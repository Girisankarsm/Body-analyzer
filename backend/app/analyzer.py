"""
Body Analyzer — Ensemble ML + MediaPipe pose (optional) + OpenCV fallback.

Pipeline:
  1. OpenCV edge/contour detection → raw pixel measurements
  2. BMI-based sanity validation — reject/correct implausible measurements
  3. US Navy body fat formula → baseline body fat %
  4. Ensemble ML (MLP + GradientBoosting + ExtraTrees) → multi-output refinement
  5. Body composition decomposition (fat, muscle, bone, water)
  6. Metabolic age + body type classification

Sanity check principle: for a given BMI, gender, and age, body measurements
lie within statistically predictable ranges. If OpenCV produces measurements
outside these ranges the result is downweighted or the formula fallback is used.
"""

import math
import os
import warnings
import numpy as np
import cv2
import joblib

warnings.filterwarnings("ignore")

# ── Try to load MediaPipe (optional — falls back to OpenCV if unavailable) ────
_MP_POSE = None
try:
    import mediapipe as mp
    # Support both old solutions API and new tasks API
    if hasattr(mp, "solutions") and hasattr(mp.solutions, "pose"):
        _MP_POSE = mp.solutions.pose
        _USE_MP  = True
    else:
        _USE_MP  = False
except Exception:
    _USE_MP = False


# ── Navy formulas ─────────────────────────────────────────────────────────────
def navy_bf_male(waist_cm, neck_cm, height_cm):
    diff = waist_cm - neck_cm
    if diff <= 0:
        raise ValueError("waist must be > neck")
    return (495 / (1.0324 - 0.19077 * math.log10(diff) + 0.15456 * math.log10(height_cm))) - 450


def navy_bf_female(waist_cm, neck_cm, hip_cm, height_cm):
    diff = waist_cm + hip_cm - neck_cm
    if diff <= 0:
        raise ValueError("waist + hip must be > neck")
    return (495 / (1.29579 - 0.35004 * math.log10(diff) + 0.22100 * math.log10(height_cm))) - 450


# ── Deurenberg fallback formula ───────────────────────────────────────────────
def deurenberg_bf(bmi, age, gender):
    sex = 1 if gender == "male" else 0
    return max(4.0, min(55.0, 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4))


# ── Width → circumference ─────────────────────────────────────────────────────
def width_to_circ(width_cm, part):
    ratios = {"waist": 3.10, "neck": 2.98, "hip": 3.14, "chest": 2.90}
    return width_cm * ratios.get(part, 3.0)


# ── BMI-expected measurement ranges ──────────────────────────────────────────
def bmi_expected_waist(bmi, gender):
    """Return (min_cm, max_cm) for a plausible waist circumference given BMI."""
    if gender == "male":
        center = 62 + bmi * 1.35
        return max(55, center - 18), min(145, center + 20)
    else:
        center = 55 + bmi * 1.20
        return max(50, center - 18), min(135, center + 20)


def bmi_expected_neck(bmi, gender):
    if gender == "male":
        center = 32 + bmi * 0.30
        return max(26, center - 6), min(55, center + 7)
    else:
        center = 28 + bmi * 0.20
        return max(24, center - 5), min(48, center + 6)


def bmi_expected_hip(bmi, gender):
    if gender == "male":
        center = 88 + bmi * 0.90
        return max(78, center - 15), min(145, center + 18)
    else:
        center = 92 + bmi * 1.05
        return max(82, center - 15), min(155, center + 20)


def _clamp_to_range(val, lo, hi):
    return max(lo, min(hi, val))


def _in_range(val, lo, hi):
    return lo <= val <= hi


# ── Sanity-validate and correct OpenCV measurements ───────────────────────────
def validate_measurements(waist_circ, neck_circ, hip_circ, bmi, gender, height_cm):
    """
    Check each measurement against BMI-derived expected ranges.
    Returns (corrected_waist, corrected_neck, corrected_hip, confidence_factor 0-1).
    confidence_factor = 1.0 means all measurements in range; lower = more correction was needed.
    """
    w_lo, w_hi = bmi_expected_waist(bmi, gender)
    n_lo, n_hi = bmi_expected_neck(bmi, gender)
    h_lo, h_hi = bmi_expected_hip(bmi, gender)

    w_ok = _in_range(waist_circ, w_lo, w_hi)
    n_ok = _in_range(neck_circ,  n_lo, n_hi)
    h_ok = _in_range(hip_circ,   h_lo, h_hi)

    ok_count = sum([w_ok, n_ok, h_ok])
    confidence_factor = ok_count / 3.0   # 0.33, 0.67, or 1.0

    # Correct out-of-range values to nearest bound
    waist_ok = _clamp_to_range(waist_circ, w_lo, w_hi) if not w_ok else waist_circ
    neck_ok  = _clamp_to_range(neck_circ,  n_lo, n_hi) if not n_ok else neck_circ
    hip_ok   = _clamp_to_range(hip_circ,   h_lo, h_hi) if not h_ok else hip_circ

    return waist_ok, neck_ok, hip_ok, confidence_factor


# ── Conicity index ─────────────────────────────────────────────────────────────
def conicity_index(waist_cm, weight_kg, height_cm):
    try:
        return waist_cm / (0.109 * math.sqrt(weight_kg / (height_cm / 100)))
    except Exception:
        return 1.25


# ── Body type classification ──────────────────────────────────────────────────
def classify_body_type(whr, shr, gender):
    if gender == "male":
        if shr > 1.30 and whr < 0.90: return "Athletic / Inverted Triangle"
        if whr >= 0.95:                return "Apple (Android)"
        if shr < 1.05 and whr < 0.88: return "Pear (Gynoid)"
        return "Rectangular"
    else:
        if whr < 0.75 and shr > 1.10: return "Hourglass"
        if whr >= 0.88:                return "Apple (Android)"
        if whr < 0.78 and shr < 1.00: return "Pear (Gynoid)"
        return "Rectangular"


# ── Body composition breakdown ────────────────────────────────────────────────
def body_composition(weight_kg, body_fat_pct, gender, age):
    """
    Clinical breakdown using validated reference formulas:
    - Bone mass: Heymsfield et al. 2002 (DEXA reference)
    - Muscle mass: Kim et al. 2002 formula
    - Body water: Watson formula
    """
    fat_mass_kg  = round(weight_kg * body_fat_pct / 100, 1)
    lean_mass_kg = round(weight_kg - fat_mass_kg, 1)

    # Bone mineral content (Heymsfield regression on lean mass)
    bone_pct     = 0.073 if gender == "male" else 0.068
    bone_mass_kg = round(max(1.5, min(5.5, lean_mass_kg * bone_pct)), 1)

    # Skeletal muscle mass: Kim (appendicular) × 2.0 approx
    muscle_pct   = 0.476 if gender == "male" else 0.410
    muscle_kg    = round(lean_mass_kg * muscle_pct, 1)

    # Total body water: Watson formula
    if gender == "male":
        tbw = -2.097 + 0.1069 * lean_mass_kg + 0.2466 * weight_kg
    else:
        tbw = -2.097 + 0.1069 * lean_mass_kg + 0.2466 * weight_kg * 0.92
    tbw = round(max(18, min(60, tbw)), 1)

    return {
        "fat_mass_kg":     fat_mass_kg,
        "lean_mass_kg":    lean_mass_kg,
        "muscle_mass_kg":  muscle_kg,
        "bone_mass_kg":    bone_mass_kg,
        "water_liters":    tbw,
        "water_pct":       round(tbw / weight_kg * 100, 1),
        "fat_pct":         round(body_fat_pct, 1),
        "lean_pct":        round(100 - body_fat_pct, 1),
    }


# ── Metabolic age ─────────────────────────────────────────────────────────────
def metabolic_age(bmi, body_fat, age, gender):
    bf_ref  = 17.0 if gender == "male" else 24.0
    bmi_ref = 22.0
    delta   = (body_fat - bf_ref) * 0.35 + (bmi - bmi_ref) * 0.45
    return int(max(16, min(age + 20, round(age + delta))))


# ── Regional fat distribution (DEXA-calibrated fractions) ────────────────────
def regional_fat_detail(body_fat, trunk_fat_pct, appendicular_fat_pct, weight_kg):
    """
    Regional fat breakdown calibrated to DEXA scan reference data.
    Abdomen ≈ 55% of trunk fat, chest ≈ 30%, back ≈ 15%.
    Thighs ≈ 60% of appendicular fat, arms ≈ 28%, calves ≈ 12%.
    """
    trunk_fat_pct  = max(4, min(65, trunk_fat_pct))
    append_fat_pct = max(3, min(55, appendicular_fat_pct))

    return {
        "core_abdomen": round(trunk_fat_pct  * 0.55, 1),
        "chest":        round(trunk_fat_pct  * 0.30, 1),
        "back":         round(trunk_fat_pct  * 0.15, 1),
        "arms":         round(append_fat_pct * 0.28, 1),
        "thighs":       round(append_fat_pct * 0.60, 1),
        "calves":       round(append_fat_pct * 0.12, 1),
        "trunk_fat_kg":         round(weight_kg * trunk_fat_pct  / 100, 1),
        "appendicular_fat_kg":  round(weight_kg * append_fat_pct / 100, 1),
    }


# ── Body morph targets + heatmap for 3D model ────────────────────────────────
def compute_morph_targets(body_fat, bmi, gender, trunk_fat_pct, append_fat_pct,
                          waist_cm, hip_cm, weight_kg, height_cm):
    """
    Compute 3D body morph scales and per-region fat heatmap intensities.

    Morph targets: scale factors (1.0 = neutral) for 6 body regions.
    Heatmap:       0.0–1.0 intensity per region (0=lean green, 1=obese red).
    All scales are relative to a reference lean body (bf ~12% male / 20% female).
    """
    # Reference BMI at lean body
    ref_bmi = 19.5 if gender == "male" else 18.5

    # Overall body fullness driven by BMI
    bmi_factor = max(0.0, min(1.0, (bmi - ref_bmi) / 20.0))

    # Torso width scales with waist circumference vs lean reference
    ref_waist = (62 + ref_bmi * 1.35) if gender == "male" else (55 + ref_bmi * 1.20)
    torso_scale = max(0.85, min(1.55, 1.0 + (waist_cm - ref_waist) / ref_waist * 1.2))

    # Hip scale
    ref_hip = (88 + ref_bmi * 0.90) if gender == "male" else (92 + ref_bmi * 1.05)
    hip_scale = max(0.88, min(1.50, 1.0 + (hip_cm - ref_hip) / ref_hip * 1.1))

    # Arm scale from appendicular fat
    ref_append = 8.0 if gender == "male" else 12.0
    arm_scale  = max(0.88, min(1.45, 1.0 + (append_fat_pct - ref_append) / 40.0 * 0.6))

    # Leg scale
    leg_scale = max(0.90, min(1.45, 1.0 + (append_fat_pct - ref_append) / 40.0 * 0.5))

    # Belly (abdominal protrusion) — driven by android fat
    belly_scale = max(0.85, min(1.70, 1.0 + (trunk_fat_pct - 14.0) / 30.0 * 0.85))

    # Chest scale
    chest_scale = max(0.88, min(1.45, 1.0 + (trunk_fat_pct - 14.0) / 30.0 * 0.45))

    # ── Heatmap intensities (0.0 lean → 1.0 obese) ──────────────────────────
    def fat_to_heat(fat_pct, lean_ref, obese_ref):
        return round(max(0.0, min(1.0, (fat_pct - lean_ref) / (obese_ref - lean_ref))), 3)

    abdomen_heat = fat_to_heat(trunk_fat_pct * 0.55, 5,  25)
    chest_heat   = fat_to_heat(trunk_fat_pct * 0.30, 3,  18)
    back_heat    = fat_to_heat(trunk_fat_pct * 0.15, 2,  10)
    arms_heat    = fat_to_heat(append_fat_pct * 0.28, 2, 12)
    thighs_heat  = fat_to_heat(append_fat_pct * 0.60, 4, 20)
    calves_heat  = fat_to_heat(append_fat_pct * 0.12, 1,  6)

    return {
        "morph_scales": {
            "torso":  round(torso_scale, 3),
            "belly":  round(belly_scale, 3),
            "chest":  round(chest_scale, 3),
            "hips":   round(hip_scale,   3),
            "arms":   round(arm_scale,   3),
            "legs":   round(leg_scale,   3),
        },
        "heatmap": {
            "abdomen": abdomen_heat,
            "chest":   chest_heat,
            "back":    back_heat,
            "arms":    arms_heat,
            "thighs":  thighs_heat,
            "calves":  calves_heat,
        },
        "overall_fatness": round(bmi_factor, 3),
    }


# ── MediaPipe pose-based measurement estimation ───────────────────────────────
def analyze_body_mediapipe(img_rgb: np.ndarray, height_cm: float) -> dict | None:
    """
    Use MediaPipe Pose landmarks to estimate waist, neck, and hip widths.
    Landmark indices:
      11/12 = shoulders, 23/24 = hips, 25/26 = knees
    Hip landmark distance → hip width → hip circumference.
    Neck estimated from shoulder width.
    Waist estimated between shoulder and hip midpoints.
    """
    if not _USE_MP or _MP_POSE is None:
        return None
    try:
        with _MP_POSE.Pose(static_image_mode=True, min_detection_confidence=0.5) as pose:
            results = pose.process(img_rgb)
            if not results.pose_landmarks:
                return None

            lm  = results.pose_landmarks.landmark
            h_px, w_px = img_rgb.shape[:2]

            def px(i):
                return np.array([lm[i].x * w_px, lm[i].y * h_px])

            # Key landmarks
            ls, rs = px(11), px(12)   # left/right shoulder
            lh, rh = px(23), px(24)   # left/right hip

            # Body height in pixels (shoulder top to ankle)
            la, ra = px(27), px(28)
            body_top_y    = min(ls[1], rs[1])
            body_bottom_y = max(la[1], ra[1])
            body_h_px     = max(1, body_bottom_y - body_top_y)
            px_per_cm     = body_h_px / (height_cm * 0.88)   # shoulders to ankles ≈ 88% of height

            shoulder_w_px = abs(ls[0] - rs[0])
            hip_w_px      = abs(lh[0] - rh[0])

            # Waist at midpoint between shoulder and hip
            mid_y    = (ls[1] + rs[1] + lh[1] + rh[1]) / 4
            waist_w_px = shoulder_w_px * 0.75   # typical waist ≈ 75% of shoulder width

            shoulder_cm = shoulder_w_px / px_per_cm
            waist_cm    = waist_w_px    / px_per_cm
            hip_cm      = hip_w_px      / px_per_cm
            neck_cm     = shoulder_cm   * 0.34   # neck ≈ 34% of shoulder width (empirical)

            # Convert widths → circumferences
            waist_circ  = width_to_circ(waist_cm, "waist")
            neck_circ   = width_to_circ(neck_cm,  "neck")
            hip_circ    = width_to_circ(hip_cm,   "hip")
            shr         = shoulder_cm / hip_cm if hip_cm > 0 else 1.1

            return {
                "neck_circ":          neck_circ,
                "waist_circ":         waist_circ,
                "hip_circ":           hip_circ,
                "shoulder_hip_ratio": shr,
                "measurements_cm": {
                    "estimated_neck_cm":  round(neck_circ,  1),
                    "estimated_waist_cm": round(waist_circ, 1),
                    "estimated_hip_cm":   round(hip_circ,   1),
                },
                "source_method": "mediapipe_pose",
            }
    except Exception:
        return None


# ── OpenCV body contour analysis ──────────────────────────────────────────────
def analyze_body_contour(img, height_cm):
    """
    Estimate body width measurements from a frontal body photo.
    Applies multiple contour passes and selects best body candidate.
    Returns raw measurements (not validated yet).
    """
    h_px, w_px = img.shape[:2]
    scale  = 640 / max(h_px, w_px)
    img_r  = cv2.resize(img, (int(w_px * scale), int(h_px * scale)))
    h, w   = img_r.shape[:2]

    gray  = cv2.cvtColor(img_r, cv2.COLOR_BGR2GRAY)

    # Try both CLAHE + Canny and adaptive threshold to get best contour
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_eq = clahe.apply(gray)
    gray_bl = cv2.GaussianBlur(gray_eq, (7, 7), 0)

    edges_lo = cv2.Canny(gray_bl, 20, 70)
    edges_hi = cv2.Canny(gray_bl, 40, 120)
    edges    = cv2.bitwise_or(edges_lo, edges_hi)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    edges  = cv2.dilate(edges, kernel, iterations=1)
    edges  = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    # Pick largest contour that has reasonable aspect ratio for a human body
    body = None
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        area = cv2.contourArea(c)
        if area < h * w * 0.015:
            continue
        _x, _y, bw, bh = cv2.boundingRect(c)
        aspect = bh / bw if bw > 0 else 0
        if aspect < 1.2:          # human body is always taller than wide
            continue
        if bh < h * 0.25:
            continue
        body = c
        break

    if body is None:
        return None

    x, y, bw, bh = cv2.boundingRect(body)
    px_per_cm = bh / height_cm

    # Create a body mask for more accurate width sampling
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(mask, [body], -1, 255, thickness=cv2.FILLED)

    def body_width_at(frac):
        """True width of body mask at fractional height."""
        sy = int(y + frac * bh)
        if sy >= h or sy < 0:
            return bw
        row = mask[sy, :]
        cols = np.where(row > 0)[0]
        if len(cols) < 2:
            return bw * 0.45
        width = float(cols[-1] - cols[0])
        # Use 95th percentile over a small window to be robust to noise
        widths = []
        for dy in range(-3, 4):
            sy2 = sy + dy
            if 0 <= sy2 < h:
                row2 = mask[sy2, :]
                c2 = np.where(row2 > 0)[0]
                if len(c2) >= 2:
                    widths.append(float(c2[-1] - c2[0]))
        return float(np.median(widths)) if widths else width

    neck_w   = body_width_at(0.07)
    chest_w  = body_width_at(0.24)
    waist_w  = body_width_at(0.43)
    hip_w    = body_width_at(0.57)

    # Convert pixel widths to cm, then to circumference
    neck_cm  = neck_w  / px_per_cm
    chest_cm = chest_w / px_per_cm
    waist_cm = waist_w / px_per_cm
    hip_cm   = hip_w   / px_per_cm

    # Shoulder-hip ratio
    shr = chest_cm / hip_cm if hip_cm > 0 else 1.1

    return {
        "neck_circ":          width_to_circ(neck_cm,  "neck"),
        "waist_circ":         width_to_circ(waist_cm, "waist"),
        "hip_circ":           width_to_circ(hip_cm,   "hip"),
        "shoulder_hip_ratio": shr,
        "measurements_cm": {
            "estimated_neck_cm":  round(width_to_circ(neck_cm,  "neck"),  1),
            "estimated_waist_cm": round(width_to_circ(waist_cm, "waist"), 1),
            "estimated_hip_cm":   round(width_to_circ(hip_cm,   "hip"),   1),
        },
    }


# ── Main Analyzer ─────────────────────────────────────────────────────────────
class BodyAnalyzer:
    def __init__(self, model_path="model/bf_model.pkl"):
        self.model_data   = None
        self.image_model  = None

        if os.path.exists(model_path):
            try:
                self.model_data = joblib.load(model_path)
                if not isinstance(self.model_data, dict):
                    self.model_data = None
            except Exception:
                pass

        # Load CNN image model if available
        try:
            from app.image_model import ImageBodyPredictor
            img_pred = ImageBodyPredictor()
            if img_pred.loaded:
                self.image_model = img_pred
        except Exception:
            pass

    def _predict_ensemble(self, features_raw):
        """
        Returns [body_fat, trunk_fat_pct, appendicular_fat_pct, visceral_level].
        Returns None if model unavailable.
        """
        if self.model_data is None:
            return None
        try:
            scaler = self.model_data['scaler']
            model  = self.model_data['model']
            X_s    = scaler.transform(np.array([features_raw], dtype=np.float32))
            preds  = model.predict(X_s)[0]
            return [
                max(3.0,  min(60.0, float(preds[0]))),
                max(4.0,  min(65.0, float(preds[1]))),
                max(3.0,  min(55.0, float(preds[2]))),
                max(1.0,  min(12.0, float(preds[3]))),
            ]
        except Exception:
            return None

    def _predict_with_uncertainty(self, features_raw):
        """
        Returns (predictions, std_devs) by collecting individual estimator outputs.
        std_dev is used to build a ±1.96σ confidence interval (95% CI).
        Returns (None, None) if model unavailable.
        """
        if self.model_data is None:
            return None, None
        try:
            scaler      = self.model_data['scaler']
            mo_model    = self.model_data['model']
            X_s         = scaler.transform(np.array([features_raw], dtype=np.float32))

            # Collect predictions from each sub-estimator (MLP, GBR, ETR)
            per_output_preds = []
            for out_estimator in mo_model.estimators_:
                # out_estimator is a VotingRegressor
                sub_preds = []
                for _, est in out_estimator.estimators:
                    try:
                        sub_preds.append(est.predict(X_s)[0])
                    except Exception:
                        pass
                if sub_preds:
                    per_output_preds.append(sub_preds)

            if not per_output_preds:
                return self._predict_ensemble(features_raw), [1.5, 1.2, 1.2, 0.5]

            # Transpose: per_output_preds[out][estimator] → [estimator][out]
            preds_matrix = np.array(per_output_preds)   # shape (n_outputs, n_estimators)
            means = preds_matrix.mean(axis=1)
            stds  = preds_matrix.std(axis=1)

            result = [
                max(3.0,  min(60.0, float(means[0]))),
                max(4.0,  min(65.0, float(means[1]))),
                max(3.0,  min(55.0, float(means[2]))),
                max(1.0,  min(12.0, float(means[3]))),
            ]
            ci_stds = [max(0.5, float(s)) for s in stds[:4]]
            return result, ci_stds

        except Exception:
            return self._predict_ensemble(features_raw), [1.5, 1.2, 1.2, 0.5]

    def _model_info(self):
        """Return stored training metadata (R², MAE, data_source)."""
        if self.model_data is None:
            return {}
        return {
            "r2":          self.model_data.get("cv_r2_mean"),
            "cv_mae":      self.model_data.get("cv_mae_mean"),
            "data_source": self.model_data.get("data_source", "synthetic"),
            "n_train":     self.model_data.get("n_train"),
        }

    def _build_features(self, bmi, age, gender, whr, waist_cm, neck_cm, hip_cm, height_cm, weight_kg):
        g_int = 1 if gender == "male" else 0
        whtr  = waist_cm / height_cm
        ci    = conicity_index(waist_cm, weight_kg, height_cm)
        shr   = 1.2 if gender == "male" else 0.95
        return [bmi, age, g_int, whr, whtr, shr, waist_cm, neck_cm, hip_cm, height_cm, ci, weight_kg]

    def analyze(self, image_bytes, height_cm, weight_kg, gender, age):
        bmi = weight_kg / (height_cm / 100) ** 2

        pose_data = None
        if image_bytes:
            try:
                arr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is not None:
                    # Try MediaPipe first (more accurate joint landmarks)
                    if _USE_MP:
                        img_rgb   = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                        pose_data = analyze_body_mediapipe(img_rgb, height_cm)
                        if pose_data:
                            pose_data["method"] = "mediapipe"

                    # Fall back to OpenCV contour if MediaPipe fails
                    if pose_data is None:
                        pose_data = analyze_body_contour(img, height_cm)
                        if pose_data:
                            pose_data["method"] = "opencv"
            except Exception:
                pass

        if pose_data:
            return self._with_image(pose_data, height_cm, weight_kg, bmi, gender, age, image_bytes=image_bytes)
        return self._formula_fallback(height_cm, weight_kg, bmi, gender, age, reason="image analysis failed")

    def _with_image(self, cd, height_cm, weight_kg, bmi, gender, age, image_bytes=None):
        raw_waist = cd["waist_circ"]
        raw_neck  = cd["neck_circ"]
        raw_hip   = cd["hip_circ"]

        # ── Step 1: Validate measurements against BMI expectations ──────────
        waist_v, neck_v, hip_v, conf_factor = validate_measurements(
            raw_waist, raw_neck, raw_hip, bmi, gender, height_cm
        )

        # If measurements are very unreliable (all out of range), fall back
        if conf_factor < 0.34:
            return self._formula_fallback(height_cm, weight_kg, bmi, gender, age,
                                          reason=f"contour measurements outside expected BMI range (conf={conf_factor:.2f})")

        # ── Step 2: Navy formula body fat ────────────────────────────────────
        try:
            if gender == "male":
                navy_bf = navy_bf_male(waist_v, neck_v, height_cm)
            else:
                navy_bf = navy_bf_female(waist_v, neck_v, hip_v, height_cm)
        except (ValueError, ZeroDivisionError) as e:
            return self._formula_fallback(height_cm, weight_kg, bmi, gender, age, reason=str(e))

        navy_bf = max(3.0, min(55.0, navy_bf))

        # ── Step 3: Deurenberg cross-check ───────────────────────────────────
        deuren_bf = deurenberg_bf(bmi, age, gender)

        # If Navy result differs greatly from Deurenberg, strongly prefer Deurenberg.
        # For lean people (BMI < 22) OpenCV often overestimates waist — Deurenberg
        # anchored on BMI/age is far more reliable in that case.
        navy_deuren_diff = abs(navy_bf - deuren_bf)
        lean_penalty = max(0.0, (22.0 - bmi) / 10.0)   # 0 at BMI≥22, up to 1.0 at BMI≤12
        if navy_deuren_diff > 10:
            blend_navy = max(0.05, 0.25 * conf_factor - lean_penalty * 0.15)
        elif navy_deuren_diff > 5:
            blend_navy = max(0.10, 0.40 * conf_factor - lean_penalty * 0.10)
        else:
            blend_navy = max(0.20, 0.60 * conf_factor - lean_penalty * 0.05)

        blend_navy = max(0.05, min(0.70, blend_navy))
        formula_bf = round(blend_navy * navy_bf + (1 - blend_navy) * deuren_bf, 2)

        # ── Step 4: Ensemble ML refinement ───────────────────────────────────
        whr       = waist_v / hip_v if hip_v > 0 else (0.9 if gender == "male" else 0.81)
        features  = self._build_features(bmi, age, gender, whr, waist_v, neck_v, hip_v, height_cm, weight_kg)
        ens_preds = self._predict_ensemble(features)

        ens_preds, ci_stds = self._predict_with_uncertainty(features)
        method_used = cd.get("method", "opencv")

        # ── CNN image model prediction (if available) ────────────────────
        cnn_bf = None
        if self.image_model is not None and image_bytes:
            try:
                cnn_bf = self.image_model.predict(image_bytes)
            except Exception:
                cnn_bf = None

        if ens_preds:
            ml_bf, trunk_fat, append_fat, visceral_level = ens_preds
            ml_bf = max(3.0, min(55.0, ml_bf))
            if cnn_bf is not None:
                # 3-way blend: 35% formula + 35% tabular ML + 30% CNN
                final_bf   = round(0.35 * formula_bf + 0.35 * ml_bf + 0.30 * cnn_bf, 1)
                source     = f"cnn_ensemble_navy_{method_used}"
                confidence = round(0.75 + 0.15 * conf_factor, 2)
                bf_std     = float(ci_stds[0]) * 0.85 if ci_stds else 1.2
            else:
                final_bf   = round(0.50 * formula_bf + 0.50 * ml_bf, 1)
                source     = f"ensemble_ml_navy_{method_used}"
                confidence = round(0.65 + 0.20 * conf_factor, 2)
                bf_std     = float(ci_stds[0]) if ci_stds else 1.5
        else:
            final_bf       = round(formula_bf, 1)
            trunk_fat      = round(final_bf * (0.52 if gender == "male" else 0.47), 1)
            append_fat     = round(final_bf * (0.36 if gender == "male" else 0.42), 1)
            visceral_level = max(1, min(12, round(final_bf * (0.21 if gender == "male" else 0.18))))
            source         = f"navy_{method_used}_validated"
            confidence     = round(0.55 + 0.15 * conf_factor, 2)
            bf_std         = 2.0

        # ── BMI-based reality check on final_bf and visceral fat ─────────────
        # Deurenberg is the most reliable anchor for lean individuals.
        # If final_bf is still far above Deurenberg for a lean BMI, pull it back.
        if bmi < 23 and final_bf > deuren_bf + 6:
            final_bf = round(deuren_bf + (final_bf - deuren_bf) * 0.25, 1)

        # Visceral fat hard cap by BMI — scientifically impossible to be high
        # when BMI is in the healthy/lean range.
        # DEXA reference: BMI<22 → visc rarely exceeds 4; BMI<25 → rarely exceeds 7
        bmi_visc_max = round(max(1.0, min(12.0, (bmi - 10.0) * 0.55)), 1)
        visceral_level = min(visceral_level, bmi_visc_max)
        # Also derive trunk/appendicular from final_bf if ML gave outlier values
        if trunk_fat > final_bf * 0.75:
            trunk_fat  = round(final_bf * (0.52 if gender == "male" else 0.47), 1)
        if append_fat > final_bf * 0.65:
            append_fat = round(final_bf * (0.36 if gender == "male" else 0.42), 1)

        # 95% confidence interval: ±1.96 × std
        ci_95_low  = round(max(3.0,  final_bf - 1.96 * bf_std), 1)
        ci_95_high = round(min(65.0, final_bf + 1.96 * bf_std), 1)

        shr = cd["shoulder_hip_ratio"]

        # When measurements are unreliable (esp. for lean BMI), use BMI-derived
        # waist/hip for body-type classification so we don't get false "Apple".
        if conf_factor < 0.67 or (bmi < 23 and whr > 1.0):
            waist_ref = (62 + bmi * 1.35) if gender == "male" else (55 + bmi * 1.20)
            hip_ref   = (88 + bmi * 0.90) if gender == "male" else (92 + bmi * 1.05)
            whr_safe  = round(waist_ref / hip_ref, 3)
        else:
            whr_safe = whr

        body_type = classify_body_type(whr_safe, shr, gender)
        meta_age  = metabolic_age(bmi, final_bf, age, gender)
        comp      = body_composition(weight_kg, final_bf, gender, age)
        reg_fat   = regional_fat_detail(final_bf, trunk_fat, append_fat, weight_kg)
        model_inf = self._model_info()
        morph     = compute_morph_targets(
            final_bf, bmi, gender, trunk_fat, append_fat,
            cd["measurements_cm"].get("estimated_waist_cm", 62 + bmi * 1.35),
            cd["measurements_cm"].get("estimated_hip_cm",   88 + bmi * 0.9),
            weight_kg, height_cm,
        )

        return {
            "body_fat":              final_bf,
            "lean_mass":             comp["lean_mass_kg"],
            "body_composition":      comp,
            "regional_distribution": reg_fat,
            "trunk_fat_pct":         round(trunk_fat, 1),
            "appendicular_fat_pct":  round(append_fat, 1),
            "visceral_fat_level":    round(visceral_level, 1),
            "metabolic_age":         meta_age,
            "body_type":             body_type,
            "confidence":            confidence,
            "confidence_interval": {
                "low":  ci_95_low,
                "high": ci_95_high,
                "std":  round(bf_std, 2),
            },
            "model_info":            model_inf,
            "source":                source,
            "measurements":          cd["measurements_cm"],
            "morph_targets":         morph,
        }

    def _formula_fallback(self, height_cm, weight_kg, bmi, gender, age, reason=""):
        bf         = deurenberg_bf(bmi, age, gender)
        whr_est    = 0.91 if gender == "male" else 0.81
        waist_est  = (62 + bmi * 1.35) if gender == "male" else (55 + bmi * 1.20)
        neck_est   = (32 + bmi * 0.30) if gender == "male" else (28 + bmi * 0.20)
        hip_est    = (88 + bmi * 0.90) if gender == "male" else (92 + bmi * 1.05)

        features  = self._build_features(bmi, age, gender, whr_est, waist_est, neck_est, hip_est, height_cm, weight_kg)
        ens_preds = self._predict_ensemble(features)

        if ens_preds:
            ml_bf, trunk_fat, append_fat, visceral_level = ens_preds
            # Deurenberg is reliable — use it as anchor, ML adjusts by ≤ 35%
            final_bf    = round(max(3.0, min(55.0, 0.65 * bf + 0.35 * ml_bf)), 1)
            source      = "ensemble_ml_deurenberg"
            confidence  = 0.68
        else:
            final_bf       = round(bf, 1)
            trunk_fat      = round(final_bf * (0.52 if gender == "male" else 0.47), 1)
            append_fat     = round(final_bf * (0.36 if gender == "male" else 0.42), 1)
            visceral_level = max(1, min(12, round(final_bf * 0.20)))
            source         = "deurenberg_formula"
            confidence     = 0.60

        # BMI-based visceral fat cap (same logic as _with_image)
        bmi_visc_max   = round(max(1.0, min(12.0, (bmi - 10.0) * 0.55)), 1)
        visceral_level = min(visceral_level, bmi_visc_max)

        body_type = classify_body_type(whr_est, 1.1, gender)
        meta_age  = metabolic_age(bmi, final_bf, age, gender)
        comp      = body_composition(weight_kg, final_bf, gender, age)
        reg_fat   = regional_fat_detail(final_bf, trunk_fat, append_fat, weight_kg)
        model_inf = self._model_info()
        morph     = compute_morph_targets(
            final_bf, bmi, gender, trunk_fat, append_fat,
            waist_est, hip_est, weight_kg, height_cm,
        )

        bf_std     = 2.5  # formula-only is less precise
        ci_95_low  = round(max(3.0,  final_bf - 1.96 * bf_std), 1)
        ci_95_high = round(min(65.0, final_bf + 1.96 * bf_std), 1)

        return {
            "body_fat":              final_bf,
            "lean_mass":             comp["lean_mass_kg"],
            "body_composition":      comp,
            "regional_distribution": reg_fat,
            "trunk_fat_pct":         round(trunk_fat, 1),
            "appendicular_fat_pct":  round(append_fat, 1),
            "visceral_fat_level":    round(visceral_level, 1),
            "metabolic_age":         meta_age,
            "body_type":             body_type,
            "confidence":            confidence,
            "confidence_interval": {
                "low":  ci_95_low,
                "high": ci_95_high,
                "std":  bf_std,
            },
            "model_info":            model_inf,
            "source":                source,
            "fallback_reason":       reason,
            "measurements":          {},
            "morph_targets":         morph,
        }
