"""
Body Analyzer — Ensemble ML + OpenCV silhouette analysis.

Pipeline:
  1. OpenCV edge/contour detection → body measurements
  2. US Navy body fat formula → base body fat %
  3. Ensemble (MLP + GradientBoosting + ExtraTrees) → multi-output refinement
  4. Body composition decomposition (fat kg, lean kg, bone, water, visceral level)
  5. Metabolic age + body type classification

Falls back to Deurenberg formula if image analysis fails.
"""

import math
import os
import numpy as np
import cv2
import joblib


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


# ── Width → circumference ─────────────────────────────────────────────────────
def width_to_circ(width_cm, part):
    ratios = {"waist": 3.10, "neck": 2.98, "hip": 3.14, "chest": 2.90}
    return width_cm * ratios.get(part, 3.0)


# ── Conicity index ────────────────────────────────────────────────────────────
def conicity_index(waist_cm, weight_kg, height_cm):
    try:
        return waist_cm / (0.109 * math.sqrt(weight_kg / (height_cm / 100)))
    except Exception:
        return 1.25


# ── Body type classification ──────────────────────────────────────────────────
def classify_body_type(whr, shr, gender):
    if gender == "male":
        if shr > 1.30 and whr < 0.90:   return "Athletic / Inverted Triangle"
        if whr >= 0.95:                  return "Apple (Android)"
        if shr < 1.05 and whr < 0.88:   return "Pear (Gynoid)"
        return "Rectangular"
    else:
        if whr < 0.75 and shr > 1.10:   return "Hourglass"
        if whr >= 0.88:                  return "Apple (Android)"
        if whr < 0.78 and shr < 1.00:   return "Pear (Gynoid)"
        return "Rectangular"


# ── Body composition breakdown ────────────────────────────────────────────────
def body_composition(weight_kg, body_fat_pct, gender, age):
    fat_mass_kg  = round(weight_kg * body_fat_pct / 100, 1)
    lean_mass_kg = round(weight_kg - fat_mass_kg, 1)
    # Bone mass estimate (Heymsfield formula approximation)
    bone_mass_kg = round(max(1.5, min(5.5, lean_mass_kg * (0.072 if gender == 'male' else 0.068))), 1)
    # Skeletal muscle estimate (≈ 45-50% of lean for males, 38-43% for females)
    muscle_pct   = 0.47 if gender == 'male' else 0.40
    muscle_kg    = round(lean_mass_kg * muscle_pct, 1)
    # Total Body Water (Watson formula)
    if gender == 'male':
        water_L = round(2.447 - 0.09516 * age + 0.1074 * (weight_kg * lean_mass_kg / weight_kg * 100 / 100) + 0.3362 * weight_kg, 1)
    else:
        water_L = round(-2.097 + 0.1069 * (lean_mass_kg) + 0.2466 * weight_kg, 1)
    water_L = max(20, min(60, water_L))
    water_pct = round(water_L / weight_kg * 100, 1)
    return {
        "fat_mass_kg":      fat_mass_kg,
        "lean_mass_kg":     lean_mass_kg,
        "muscle_mass_kg":   muscle_kg,
        "bone_mass_kg":     bone_mass_kg,
        "water_liters":     water_L,
        "water_pct":        water_pct,
        "fat_pct":          round(body_fat_pct, 1),
        "lean_pct":         round(100 - body_fat_pct, 1),
    }


# ── Metabolic age ─────────────────────────────────────────────────────────────
def metabolic_age(bmi, body_fat, age, gender):
    bf_ref = 18 if gender == 'male' else 26
    bmi_ref = 22.0
    delta = (body_fat - bf_ref) * 0.35 + (bmi - bmi_ref) * 0.45
    return int(max(18, min(age + 20, round(age + delta))))


# ── Regional fat distribution ─────────────────────────────────────────────────
def regional_fat_detail(body_fat, trunk_fat_pct, appendicular_fat_pct, weight_kg):
    trunk_kg   = round(weight_kg * trunk_fat_pct / 100, 1)
    append_kg  = round(weight_kg * appendicular_fat_pct / 100, 1)
    return {
        "core_abdomen": round(min(65, body_fat * 0.55), 1),
        "chest":        round(min(45, body_fat * 0.38), 1),
        "back":         round(min(40, body_fat * 0.32), 1),
        "arms":         round(min(40, appendicular_fat_pct * 0.38), 1),
        "thighs":       round(min(55, appendicular_fat_pct * 0.62), 1),
        "calves":       round(min(30, appendicular_fat_pct * 0.22), 1),
        "trunk_fat_kg":      trunk_kg,
        "appendicular_fat_kg": append_kg,
    }


# ── OpenCV body contour analysis ──────────────────────────────────────────────
def analyze_body_contour(img, height_cm):
    h_px, w_px = img.shape[:2]
    scale  = 512 / max(h_px, w_px)
    img_r  = cv2.resize(img, (int(w_px * scale), int(h_px * scale)))
    h, w   = img_r.shape[:2]

    gray  = cv2.cvtColor(img_r, cv2.COLOR_BGR2GRAY)
    gray  = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 30, 90)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (4, 4))
    edges = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    body = max(contours, key=cv2.contourArea)
    if cv2.contourArea(body) < h * w * 0.02:
        return None

    x, y, bw, bh = cv2.boundingRect(body)
    if bh < h * 0.3:
        return None

    px_per_cm = bh / height_cm

    def width_at(frac):
        sy = int(y + frac * bh)
        if sy >= h: return bw
        cols = np.where(edges[sy, :] > 0)[0]
        return float(cols[-1] - cols[0]) if len(cols) >= 2 else bw * 0.5

    neck_cm    = width_at(0.08) / px_per_cm
    chest_cm   = width_at(0.25) / px_per_cm
    waist_cm   = width_at(0.42) / px_per_cm
    hip_cm     = width_at(0.55) / px_per_cm

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
        self.model_data = None
        if os.path.exists(model_path):
            try:
                self.model_data = joblib.load(model_path)
            except Exception:
                pass

    def _predict_ensemble(self, features_raw):
        """Run ensemble prediction. Returns [body_fat, trunk_fat, appendicular_fat, visceral_level]."""
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

    def analyze(self, image_bytes, height_cm, weight_kg, gender, age):
        bmi = weight_kg / (height_cm / 100) ** 2

        contour_data = None
        if image_bytes:
            try:
                arr = np.frombuffer(image_bytes, np.uint8)
                img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
                if img is not None:
                    contour_data = analyze_body_contour(img, height_cm)
            except Exception:
                pass

        if contour_data:
            return self._with_image(contour_data, height_cm, weight_kg, bmi, gender, age)
        return self._formula_fallback(height_cm, weight_kg, bmi, gender, age, reason="contour detection failed")

    def _with_image(self, cd, height_cm, weight_kg, bmi, gender, age):
        try:
            if gender == "male":
                navy_bf = navy_bf_male(cd["waist_circ"], cd["neck_circ"], height_cm)
            else:
                navy_bf = navy_bf_female(cd["waist_circ"], cd["neck_circ"], cd["hip_circ"], height_cm)
        except (ValueError, ZeroDivisionError) as e:
            return self._formula_fallback(height_cm, weight_kg, bmi, gender, age, reason=str(e))

        navy_bf = max(3.0, min(55.0, navy_bf))

        whr  = cd["waist_circ"] / cd["hip_circ"] if cd["hip_circ"] > 0 else 0.9
        whtr = cd["waist_circ"] / height_cm
        ci   = conicity_index(cd["waist_circ"], weight_kg, height_cm)

        features = [bmi, age, 1 if gender == "male" else 0,
                    whr, whtr, cd["shoulder_hip_ratio"],
                    cd["waist_circ"], cd["neck_circ"], cd["hip_circ"],
                    height_cm, ci, weight_kg]

        ensemble_preds = self._predict_ensemble(features)

        if ensemble_preds:
            ml_bf, trunk_fat, append_fat, visceral_level = ensemble_preds
            ml_bf = max(3.0, min(55.0, ml_bf))
            final_bf = round(0.55 * navy_bf + 0.45 * ml_bf, 1)
            source   = "ensemble_ml_opencv_navy"
            confidence = 0.88
        else:
            final_bf      = round(navy_bf, 1)
            trunk_fat     = round(final_bf * 0.52, 1)
            append_fat    = round(final_bf * 0.38, 1)
            visceral_level = max(1, min(12, round(final_bf * 0.22)))
            source        = "navy_formula_opencv"
            confidence    = 0.75

        body_type = classify_body_type(whr, cd["shoulder_hip_ratio"], gender)
        meta_age  = metabolic_age(bmi, final_bf, age, gender)
        comp      = body_composition(weight_kg, final_bf, gender, age)
        reg_fat   = regional_fat_detail(final_bf, trunk_fat, append_fat, weight_kg)

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
            "source":                source,
            "measurements":          cd["measurements_cm"],
        }

    def _formula_fallback(self, height_cm, weight_kg, bmi, gender, age, reason=""):
        sex = 1 if gender == "male" else 0
        bf  = max(4.0, min(55.0, 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4))

        whr_est = 0.93 if gender == "male" else 0.82
        whtr    = (bmi * 0.55) / height_cm * 100
        ci      = conicity_index(bmi * 0.55, weight_kg, height_cm)

        features = [bmi, age, sex, whr_est, whtr, 1.1, bmi * 2.5, bmi * 0.9, bmi * 3.1, height_cm, ci, weight_kg]
        ensemble_preds = self._predict_ensemble(features)

        if ensemble_preds:
            ml_bf, trunk_fat, append_fat, visceral_level = ensemble_preds
            bf            = round(max(3.0, min(55.0, 0.5 * bf + 0.5 * ml_bf)), 1)
            source        = "ensemble_ml_deurenberg"
            confidence    = 0.70
        else:
            trunk_fat     = round(bf * 0.52, 1)
            append_fat    = round(bf * 0.38, 1)
            visceral_level = max(1, min(12, round(bf * 0.22)))
            source        = "deurenberg_formula"
            confidence    = 0.58

        body_type = classify_body_type(whr_est, 1.1, gender)
        meta_age  = metabolic_age(bmi, bf, age, gender)
        comp      = body_composition(weight_kg, bf, gender, age)
        reg_fat   = regional_fat_detail(bf, trunk_fat, append_fat, weight_kg)

        return {
            "body_fat":              bf,
            "lean_mass":             comp["lean_mass_kg"],
            "body_composition":      comp,
            "regional_distribution": reg_fat,
            "trunk_fat_pct":         round(trunk_fat, 1),
            "appendicular_fat_pct":  round(append_fat, 1),
            "visceral_fat_level":    round(visceral_level, 1),
            "metabolic_age":         meta_age,
            "body_type":             body_type,
            "confidence":            confidence,
            "source":                source,
            "fallback_reason":       reason,
            "measurements":          {},
        }
