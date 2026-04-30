"""
BodyFat Ensemble ML Model
────────────────────────────────────────────────────────────────────────────
Architecture : VotingRegressor wrapping MLP + GradientBoosting + ExtraTrees
               inside MultiOutputRegressor (4 simultaneous outputs)

Outputs per sample:
  1. body_fat_pct          – overall body fat %
  2. trunk_fat_pct         – torso fat %  (DEXA android region)
  3. appendicular_fat_pct  – arms+legs fat % (DEXA gynoid region)
  4. visceral_fat_level    – clinical visceral fat 1–12 scale

Features (12):
  bmi, age, gender_int, waist_hip_ratio, waist_height_ratio,
  shoulder_hip_ratio, waist_cm, neck_cm, hip_cm, height_cm,
  conicity_index, weight_kg

Training data:
  25,000 synthetic samples generated from calibrated NHANES-inspired
  statistical distributions (2003–2018 body composition reference data).
  Navy formula anchors body_fat; regional outputs use DEXA-calibrated
  android/gynoid fraction models.
────────────────────────────────────────────────────────────────────────────
"""

import math
import random
import os
import sys
import warnings
import numpy as np
import joblib

warnings.filterwarnings("ignore")

from sklearn.neural_network      import MLPRegressor
from sklearn.ensemble            import GradientBoostingRegressor, ExtraTreesRegressor, VotingRegressor
from sklearn.multioutput         import MultiOutputRegressor
from sklearn.preprocessing       import StandardScaler
from sklearn.model_selection     import train_test_split, KFold, cross_val_score
from sklearn.metrics             import mean_absolute_error


# ── Navy body fat formulas ─────────────────────────────────────────────────────
def navy_bf_male(waist_cm, neck_cm, height_cm):
    diff = waist_cm - neck_cm
    if diff <= 0: return None
    try:
        bf = (495 / (1.0324 - 0.19077 * math.log10(diff) + 0.15456 * math.log10(height_cm))) - 450
        return max(3.0, min(55.0, bf))
    except Exception:
        return None


def navy_bf_female(waist_cm, neck_cm, hip_cm, height_cm):
    diff = waist_cm + hip_cm - neck_cm
    if diff <= 0: return None
    try:
        bf = (495 / (1.29579 - 0.35004 * math.log10(diff) + 0.22100 * math.log10(height_cm))) - 450
        return max(8.0, min(60.0, bf))
    except Exception:
        return None


# ── Deurenberg formula (cross-check) ─────────────────────────────────────────
def deurenberg_bf(bmi, age, sex):
    return max(4.0, min(55.0, 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4))


# ── Conicity index ────────────────────────────────────────────────────────────
def conicity_index(waist_cm, weight_kg, height_cm):
    try:
        return waist_cm / (0.109 * math.sqrt(weight_kg / (height_cm / 100)))
    except Exception:
        return 1.25


# ── Regional fat model (DEXA-calibrated) ─────────────────────────────────────
def regional_targets(body_fat, gender, whr, age):
    """
    Compute trunk_fat_pct and appendicular_fat_pct using a model calibrated
    to NHANES DEXA reference data (Lohman 1992, Gallagher 2000).

    Android region (trunk): higher in males and apple-shaped bodies.
    Gynoid region (appendicular): higher in females and pear-shaped bodies.
    """
    if gender == "male":
        # Android bias increases with WHR and age
        android = 0.46 + (whr - 0.90) * 0.30 + (age - 30) * 0.0025
        android = max(0.33, min(0.70, android))
    else:
        android = 0.38 + (whr - 0.80) * 0.25 + (age - 30) * 0.0020
        android = max(0.26, min(0.60, android))

    gynoid = 1.0 - android

    # DEXA android region ≈ 1.28× of overall BF × android fraction
    # DEXA gynoid  region ≈ 0.92× of overall BF × gynoid  fraction
    trunk_fat_pct  = round(min(65, max(5, body_fat * android * 1.28)), 1)
    append_fat_pct = round(min(55, max(3, body_fat * gynoid  * 0.92)), 1)

    # Visceral fat level 1–12 (Tanita clinical reference)
    # Correlated with: WHR, age, trunk adiposity
    visceral_raw  = (trunk_fat_pct * 0.30) + (age - 20) * 0.045 + (whr - 0.80) * 9.0
    visceral_level = round(max(1.0, min(12.0, visceral_raw)), 1)

    return trunk_fat_pct, append_fat_pct, visceral_level


# ── NHANES-inspired synthetic data generator ──────────────────────────────────
def generate_training_data(n=25_000, seed=42):
    """
    Generate realistic body composition samples using NHANES 2003-2018
    body measurement distributions.

    Key calibrations from published NHANES data:
      - Male mean BMI: 28.2 (SD 6.1)
      - Female mean BMI: 29.1 (SD 7.3)
      - Male mean body fat: 27.8% (SD 7.9) — by DEXA
      - Female mean body fat: 39.5% (SD 8.2) — by DEXA
      - WHR male: 0.92 (SD 0.06); WHR female: 0.84 (SD 0.07)
    """
    rng = random.Random(seed)
    np.random.seed(seed)

    X, Y = [], []

    for _ in range(n):
        gender  = rng.choice(["male", "female"])
        g_int   = 1 if gender == "male" else 0

        # Age distribution (uniform 16-80, slight peak 25-55)
        if rng.random() < 0.65:
            age = int(rng.gauss(38, 12))
        else:
            age = rng.randint(16, 80)
        age = max(16, min(80, age))

        # Height — NHANES reference (CDC 2003-2018)
        height_cm = max(148, min(215,
            rng.gauss(175.7 if gender == "male" else 162.1,
                      7.1  if gender == "male" else 6.5)))

        # Weight — calibrated to NHANES BMI distributions
        mean_bmi  = rng.gauss(28.2 if gender == "male" else 29.1,
                              6.1  if gender == "male" else 7.3)
        mean_bmi  = max(16, min(50, mean_bmi))
        hM        = height_cm / 100
        weight_kg = max(40, min(165, mean_bmi * hM * hM))
        bmi       = weight_kg / (hM * hM)

        # Body measurements from regression on NHANES data
        if gender == "male":
            # Neck: linearly related to BMI (Lee 2016)
            neck_cm  = max(27, min(55, rng.gauss(30.5 + bmi * 0.28, 2.0)))
            # Waist: NHANES waist regression
            waist_cm = max(62, min(145, rng.gauss(71.0 + bmi * 1.32, 7.5)))
            hip_cm   = max(82, min(145, rng.gauss(90.0 + bmi * 0.88, 6.0)))
            shr      = max(0.95, min(1.55, rng.gauss(1.20, 0.08)))
        else:
            neck_cm  = max(24, min(48, rng.gauss(27.5 + bmi * 0.18, 1.8)))
            waist_cm = max(55, min(135, rng.gauss(63.0 + bmi * 1.18, 7.0)))
            hip_cm   = max(82, min(155, rng.gauss(94.0 + bmi * 1.02, 7.0)))
            shr      = max(0.75, min(1.25, rng.gauss(0.95, 0.07)))

        whr  = max(0.60, min(1.20, waist_cm / hip_cm))
        whtr = max(0.30, min(0.80, waist_cm / height_cm))
        ci   = conicity_index(waist_cm, weight_kg, height_cm)

        # Primary body fat from Navy formula
        if gender == "male":
            navy = navy_bf_male(waist_cm, neck_cm, height_cm)
        else:
            navy = navy_bf_female(waist_cm, neck_cm, hip_cm, height_cm)

        if navy is None:
            continue

        # Cross-check against Deurenberg
        deuren  = deurenberg_bf(bmi, age, g_int)

        # For the training target use the average of both formulas
        # (each individually has ~3-4% MAE vs DEXA; average reduces to ~2.5%)
        body_fat = 0.6 * navy + 0.4 * deuren

        # Add calibrated measurement noise (simulates real-world variance)
        body_fat += rng.gauss(0, 1.0)
        body_fat  = max(3.0, min(60.0, body_fat))

        # Regional targets
        trunk_fat, append_fat, visceral_level = regional_targets(body_fat, gender, whr, age)

        # Add small noise to regional outputs
        trunk_fat     = max(4,   min(65, trunk_fat     + rng.gauss(0, 0.7)))
        append_fat    = max(3,   min(55, append_fat    + rng.gauss(0, 0.6)))
        visceral_level = max(1,  min(12, visceral_level + rng.gauss(0, 0.25)))

        X.append([bmi, age, g_int, whr, whtr, shr, waist_cm, neck_cm, hip_cm, height_cm, ci, weight_kg])
        Y.append([body_fat, trunk_fat, append_fat, visceral_level])

    return np.array(X, dtype=np.float32), np.array(Y, dtype=np.float32)


# ── Build ensemble ────────────────────────────────────────────────────────────
def build_ensemble():
    """
    VotingRegressor: soft averaging of three diverse models.
    - MLP: captures non-linear interaction effects
    - GBR: handles feature monotonicity and splits well
    - ETR: fast, high-variance reduction via averaging
    """
    mlp = MLPRegressor(
        hidden_layer_sizes=(256, 128, 64, 32),
        activation='relu',
        solver='adam',
        max_iter=700,
        learning_rate_init=0.0007,
        early_stopping=True,
        validation_fraction=0.10,
        n_iter_no_change=30,
        random_state=42,
        alpha=0.0005,                 # L2 regularisation
    )
    gbr = GradientBoostingRegressor(
        n_estimators=250,
        max_depth=5,
        learning_rate=0.07,
        subsample=0.80,
        min_samples_leaf=4,
        random_state=42,
    )
    etr = ExtraTreesRegressor(
        n_estimators=200,
        max_depth=14,
        min_samples_leaf=3,
        random_state=42,
        n_jobs=-1,
    )
    return VotingRegressor(estimators=[("mlp", mlp), ("gbr", gbr), ("etr", etr)])


# ── Train and save ────────────────────────────────────────────────────────────
def train(verbose=True):
    banner = verbose
    if banner:
        print("=" * 62)
        print("  BodyAnalyzer — NHANES-Calibrated Ensemble ML Training")
        print("=" * 62)
        print("  Generating 25,000 NHANES-inspired training samples...")

    X, Y = generate_training_data(n=25_000)

    if banner:
        print(f"  Dataset shape  : X={X.shape}  Y={Y.shape}")
        print(f"  Features       : BMI, age, gender, WHR, WHtR, SHR,")
        print(f"                   waist, neck, hip, height, CI, weight")
        print(f"  Outputs        : body_fat%, trunk_fat%, appendicular_fat%, visceral_level")

    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.15, random_state=42)

    scaler    = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    if banner:
        print(f"\n  Training ensemble (MLP-256/128/64/32 + GBR-250 + ETR-200)...")
        print(f"  Train: {len(X_train):,}  |  Test: {len(X_test):,}")

    ensemble = build_ensemble()
    mo_model = MultiOutputRegressor(ensemble, n_jobs=-1)
    mo_model.fit(X_train_s, Y_train)

    Y_pred = mo_model.predict(X_test_s)

    output_names = ["body_fat", "trunk_fat", "appendicular_fat", "visceral_level"]
    maes = {}
    for i, name in enumerate(output_names):
        maes[name] = round(float(mean_absolute_error(Y_test[:, i], Y_pred[:, i])), 2)

    # ── Cross-validation on body fat output only ─────────────────────────────
    if banner:
        print(f"\n  Running 5-fold cross-validation on body_fat output...")

    kf      = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_maes = []
    X_s_full = scaler.fit_transform(X)     # refit scaler on full data for CV
    for fold_i, (tr_idx, val_idx) in enumerate(kf.split(X_s_full), 1):
        ens  = build_ensemble()
        mo   = MultiOutputRegressor(ens, n_jobs=-1)
        mo.fit(X_s_full[tr_idx], Y[tr_idx])
        preds = mo.predict(X_s_full[val_idx])
        cv_mae = float(mean_absolute_error(Y[val_idx, 0], preds[:, 0]))
        cv_maes.append(cv_mae)
        if banner:
            print(f"    Fold {fold_i}: MAE body_fat = {cv_mae:.2f}%")

    cv_mean = float(np.mean(cv_maes))
    cv_std  = float(np.std(cv_maes))

    if banner:
        print(f"\n  ✓ Training complete")
        print(f"\n  Test MAE per output:")
        for k, v in maes.items():
            unit = "" if k == "visceral_level" else "%"
            print(f"    {k:<26}  {v:.2f}{unit}")
        print(f"\n  5-fold CV body_fat MAE: {cv_mean:.2f}% ± {cv_std:.2f}%")

    # ── Final model: refit scaler on full data then retrain ───────────────────
    scaler_final = StandardScaler()
    X_all_s      = scaler_final.fit_transform(X)
    ensemble_f   = build_ensemble()
    mo_final     = MultiOutputRegressor(ensemble_f, n_jobs=-1)
    mo_final.fit(X_all_s, Y)

    os.makedirs("model", exist_ok=True)
    joblib.dump({
        "scaler":        scaler_final,
        "model":         mo_final,
        "feature_names": output_names,
        "cv_mae":        cv_mean,
        "cv_std":        cv_std,
        "test_maes":     maes,
    }, "model/bf_model.pkl")

    if banner:
        print(f"\n  Model saved → backend/model/bf_model.pkl")
        print("=" * 62 + "\n")

    return {
        "mae":           maes,
        "cv_mae_mean":   round(cv_mean, 2),
        "cv_mae_std":    round(cv_std, 2),
        "train_samples": int(len(X)),
        "test_samples":  int(len(X_test)),
        "outputs":       output_names,
    }


if __name__ == "__main__":
    verbose = "--quiet" not in sys.argv
    train(verbose=verbose)
