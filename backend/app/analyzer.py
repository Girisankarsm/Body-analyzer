"""
Body analyzer using OpenCV silhouette analysis:
  1. OpenCV edge/contour detection for body measurement estimation
  2. US Navy body fat formula for body fat percentage calculation
  3. Trained MLP for enhanced accuracy

If image analysis fails for any reason, falls back to the Deurenberg formula.
"""

import math
import os
import numpy as np
import cv2
import joblib


# ── US Navy body fat formula ──────────────────────────────────────────────────
def navy_bf_male(waist_cm: float, neck_cm: float, height_cm: float) -> float:
    """
    US Navy formula:
      body_fat = (495 / (1.0324 - 0.19077*log10(waist-neck) + 0.15456*log10(height))) - 450
    """
    diff = waist_cm - neck_cm
    if diff <= 0:
        raise ValueError("waist must be greater than neck")
    return (495 / (1.0324 - 0.19077 * math.log10(diff) + 0.15456 * math.log10(height_cm))) - 450


def navy_bf_female(waist_cm: float, neck_cm: float, hip_cm: float, height_cm: float) -> float:
    diff = waist_cm + hip_cm - neck_cm
    if diff <= 0:
        raise ValueError("waist + hip must be > neck")
    return (495 / (1.29579 - 0.35004 * math.log10(diff) + 0.22100 * math.log10(height_cm))) - 450


# ── Width → circumference (ellipse body model) ───────────────────────────────
def width_to_circ(width_cm: float, part: str) -> float:
    ratios = {"waist": 3.10, "neck": 2.98, "hip": 3.14, "chest": 2.90}
    return width_cm * ratios.get(part, 3.0)


# ── Regional fat distribution ─────────────────────────────────────────────────
def regional_fat(body_fat: float, shoulder_hip_ratio: float, gender: str) -> dict:
    if gender == "male":
        android = min(0.65, max(0.35, 0.45 + (shoulder_hip_ratio - 1.15) * 0.12))
    else:
        android = min(0.55, max(0.25, 0.38 + (shoulder_hip_ratio - 0.95) * 0.10))
    gynoid = 1 - android
    return {
        "core_abdomen": round(min(60, body_fat * android * 1.35), 1),
        "chest":        round(min(45, body_fat * android * 0.82), 1),
        "back":         round(min(40, body_fat * android * 0.72), 1),
        "arms":         round(min(40, body_fat * gynoid * 0.75), 1),
        "thighs":       round(min(50, body_fat * gynoid * 1.25), 1),
        "calves":       round(min(30, body_fat * gynoid * 0.55), 1),
    }


# ── OpenCV body contour analysis ──────────────────────────────────────────────
def analyze_body_contour(img: np.ndarray, height_cm: float) -> dict | None:
    """
    Estimate body measurements from a frontal body photo using edge detection.
    Returns estimated measurements in cm, or None if detection fails.
    """
    h_px, w_px = img.shape[:2]

    # Resize to a consistent size for analysis
    scale_to = 512
    scale = scale_to / max(h_px, w_px)
    img_resized = cv2.resize(img, (int(w_px * scale), int(h_px * scale)))
    h, w = img_resized.shape[:2]

    # Convert to grayscale + denoise
    gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    # Edge detection
    edges = cv2.Canny(gray, 30, 90)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (4, 4))
    edges = cv2.dilate(edges, kernel, iterations=1)

    # Find contours and pick the largest (body)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    body_contour = max(contours, key=cv2.contourArea)
    area = cv2.contourArea(body_contour)
    if area < (h * w * 0.02):  # must cover at least 2% of image
        return None

    x, y, bw, bh = cv2.boundingRect(body_contour)
    if bh < h * 0.3:  # body must span at least 30% of image height
        return None

    # Scale factor cm per pixel (body bounding box = full height)
    px_per_cm = bh / height_cm

    # Sample horizontal widths at characteristic y-positions within bounding box
    def width_at_frac(frac: float) -> float:
        """Width of the contour mask at fraction `frac` from top of bounding box."""
        sample_y = int(y + frac * bh)
        if sample_y >= h:
            return bw
        row = edges[sample_y, :]
        cols = np.where(row > 0)[0]
        if len(cols) < 2:
            return bw * (0.5 + frac * 0.1)
        return float(cols[-1] - cols[0])

    neck_px     = width_at_frac(0.08)
    chest_px    = width_at_frac(0.25)
    waist_px    = width_at_frac(0.42)
    hip_px      = width_at_frac(0.55)
    thigh_px    = width_at_frac(0.70)

    neck_cm  = neck_px  / px_per_cm
    chest_cm = chest_px / px_per_cm
    waist_cm = waist_px / px_per_cm
    hip_cm   = hip_px   / px_per_cm

    shoulder_hip_ratio = chest_cm / hip_cm if hip_cm > 0 else 1.1

    # Convert widths → circumferences
    neck_circ  = width_to_circ(neck_cm,  "neck")
    waist_circ = width_to_circ(waist_cm, "waist")
    hip_circ   = width_to_circ(hip_cm,   "hip")

    return {
        "neck_circ":          neck_circ,
        "waist_circ":         waist_circ,
        "hip_circ":           hip_circ,
        "shoulder_hip_ratio": shoulder_hip_ratio,
        "measurements_cm": {
            "estimated_neck_cm":  round(neck_circ, 1),
            "estimated_waist_cm": round(waist_circ, 1),
            "estimated_hip_cm":   round(hip_circ, 1),
        },
    }


# ── Main Analyzer ─────────────────────────────────────────────────────────────
class BodyAnalyzer:
    def __init__(self, model_path: str = "model/bf_model.pkl"):
        self.ml_model = None
        if os.path.exists(model_path):
            try:
                self.ml_model = joblib.load(model_path)
            except Exception:
                pass

    def analyze(
        self,
        image_bytes: bytes,
        height_cm: float,
        weight_kg: float,
        gender: str,
        age: int,
    ) -> dict:
        bmi = weight_kg / (height_cm / 100) ** 2

        # Try image-based analysis
        contour_data = None
        if image_bytes:
            try:
                nparr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                if img is not None:
                    contour_data = analyze_body_contour(img, height_cm)
            except Exception:
                pass

        if contour_data:
            return self._with_image(contour_data, height_cm, weight_kg, bmi, gender, age)
        else:
            return self._formula_fallback(height_cm, weight_kg, bmi, gender, age,
                                          reason="contour detection failed or no image")

    def _with_image(self, cd: dict, height_cm, weight_kg, bmi, gender, age) -> dict:
        try:
            if gender == "male":
                navy_bf = navy_bf_male(cd["waist_circ"], cd["neck_circ"], height_cm)
            else:
                navy_bf = navy_bf_female(cd["waist_circ"], cd["neck_circ"], cd["hip_circ"], height_cm)
        except (ValueError, ZeroDivisionError) as e:
            return self._formula_fallback(height_cm, weight_kg, bmi, gender, age, reason=str(e))

        navy_bf = max(3.0, min(55.0, navy_bf))

        # Blend with MLP if available
        final_bf = navy_bf
        source = "navy_formula_opencv_contour"
        if self.ml_model is not None:
            try:
                gender_int = 1 if gender == "male" else 0
                features = np.array([[bmi, age, gender_int,
                                       cd["shoulder_hip_ratio"],
                                       cd["waist_circ"], cd["neck_circ"], height_cm]],
                                     dtype=np.float32)
                ml_bf = float(self.ml_model.predict(features)[0])
                ml_bf = max(3.0, min(55.0, ml_bf))
                final_bf = 0.60 * navy_bf + 0.40 * ml_bf
                source = "navy_opencv_ml_blend"
            except Exception:
                pass

        final_bf = round(final_bf, 1)
        lean_mass = round(weight_kg * (1 - final_bf / 100), 1)

        return {
            "body_fat":              final_bf,
            "lean_mass":             lean_mass,
            "regional_distribution": regional_fat(final_bf, cd["shoulder_hip_ratio"], gender),
            "confidence":            0.78,
            "source":                source,
            "measurements":          cd["measurements_cm"],
        }

    def _formula_fallback(self, height_cm, weight_kg, bmi, gender, age, reason="") -> dict:
        sex = 1 if gender == "male" else 0
        bf = max(4.0, min(55.0, 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4))

        if self.ml_model is not None:
            try:
                gender_int = sex
                features = np.array([[bmi, age, gender_int, 1.1,
                                       bmi * 2.5, bmi * 0.9, height_cm]], dtype=np.float32)
                ml_bf = float(self.ml_model.predict(features)[0])
                bf = max(3.0, min(55.0, 0.5 * bf + 0.5 * ml_bf))
            except Exception:
                pass

        bf = round(bf, 1)
        lean_mass = round(weight_kg * (1 - bf / 100), 1)

        return {
            "body_fat":              bf,
            "lean_mass":             lean_mass,
            "regional_distribution": regional_fat(bf, 1.1, gender),
            "confidence":            0.62,
            "source":                "deurenberg_formula_mlp",
            "fallback_reason":       reason,
            "measurements":          {},
        }
