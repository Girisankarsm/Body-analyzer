"""
BodyFat ML Model — Ensemble of MLP + GradientBoosting + ExtraTrees
trained on 20,000 synthetic samples using the US Navy body fat formula
with clinically-inspired body composition distributions.

Multi-output predictions:
  1. body_fat_pct          — overall body fat percentage
  2. trunk_fat_pct         — torso/abdominal fat percentage
  3. appendicular_fat_pct  — arms + legs fat percentage
  4. visceral_fat_level    — visceral fat level (1–12 scale, clinical reference)

Features:
  [bmi, age, gender_int, waist_height_ratio, waist_hip_ratio,
   shoulder_hip_ratio, waist_cm, neck_cm, hip_cm, height_cm,
   conicity_index, weight_kg]
"""

import math
import random
import os
import numpy as np
import joblib
import warnings
warnings.filterwarnings("ignore")

from sklearn.neural_network import MLPRegressor
from sklearn.ensemble import GradientBoostingRegressor, ExtraTreesRegressor, VotingRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_absolute_error


# ── US Navy body fat formulas ─────────────────────────────────────────────────
def navy_bf_male(waist_cm, neck_cm, height_cm):
    try:
        diff = waist_cm - neck_cm
        if diff <= 0: return None
        bf = (495 / (1.0324 - 0.19077 * math.log10(diff) + 0.15456 * math.log10(height_cm))) - 450
        return max(3.0, min(55.0, bf))
    except Exception:
        return None


def navy_bf_female(waist_cm, neck_cm, hip_cm, height_cm):
    try:
        diff = waist_cm + hip_cm - neck_cm
        if diff <= 0: return None
        bf = (495 / (1.29579 - 0.35004 * math.log10(diff) + 0.22100 * math.log10(height_cm))) - 450
        return max(8.0, min(60.0, bf))
    except Exception:
        return None


# ── Conicity Index (abdominal obesity marker) ─────────────────────────────────
def conicity_index(waist_cm, weight_kg, height_cm):
    try:
        return waist_cm / (0.109 * math.sqrt(weight_kg / (height_cm / 100)))
    except Exception:
        return 1.25


# ── Regional fat decomposition model (research-based) ─────────────────────────
def compute_regional_fat(body_fat, gender, waist_hip_ratio, age):
    """
    Estimate regional fat percentages based on body fat, gender, and distribution pattern.
    Based on DEXA-scan reference distributions from clinical literature.
    """
    # Android (central/trunk) vs gynoid (peripheral) tendency
    if gender == "male":
        android_bias = min(0.68, 0.48 + (waist_hip_ratio - 0.90) * 0.25 + (age - 30) * 0.002)
    else:
        android_bias = min(0.55, 0.38 + (waist_hip_ratio - 0.80) * 0.22 + (age - 30) * 0.002)

    android_bias = max(0.28, android_bias)
    gynoid_bias  = 1.0 - android_bias

    # Trunk fat (abdomen + chest + back) — android region
    trunk_fat_pct = round(min(65, max(8, body_fat * android_bias * 1.32)), 1)
    # Appendicular fat (arms + legs) — gynoid region
    appendicular_fat_pct = round(min(55, max(5, body_fat * gynoid_bias * 0.98)), 1)

    # Visceral fat level 1–12 (clinical scale)
    # Correlated with waist_hip_ratio, age, and overall body fat
    visceral_raw = (body_fat * android_bias * 0.28) + (age - 20) * 0.04 + (waist_hip_ratio - 0.8) * 8
    visceral_level = round(max(1, min(12, visceral_raw)), 1)

    return trunk_fat_pct, appendicular_fat_pct, visceral_level


# ── Synthetic training data ───────────────────────────────────────────────────
def generate_training_data(n=20_000, seed=42):
    rng = random.Random(seed)
    np.random.seed(seed)

    X, Y = [], []

    for _ in range(n):
        gender  = rng.choice(['male', 'female'])
        g_int   = 1 if gender == 'male' else 0
        age     = rng.randint(16, 80)

        height_cm = max(148, min(212, rng.gauss(175 if gender == 'male' else 163, 8)))
        weight_kg = max(40,  min(160, rng.gauss(80  if gender == 'male' else 65,  15)))
        bmi       = weight_kg / (height_cm / 100) ** 2

        # Body measurement distributions correlated with BMI
        if gender == 'male':
            neck_cm  = max(28, min(55,  rng.gauss(38  + bmi * 0.25, 2.5)))
            waist_cm = max(62, min(140, rng.gauss(78  + bmi * 1.25, 8.0)))
            hip_cm   = max(80, min(140, rng.gauss(95  + bmi * 0.80, 6.5)))
            shr      = max(0.95, min(1.50, rng.gauss(1.20, 0.08)))
        else:
            neck_cm  = max(25, min(48,  rng.gauss(33  + bmi * 0.15, 2.0)))
            waist_cm = max(55, min(130, rng.gauss(70  + bmi * 1.05, 7.5)))
            hip_cm   = max(80, min(150, rng.gauss(100 + bmi * 0.90, 7.5)))
            shr      = max(0.75, min(1.20, rng.gauss(0.95, 0.07)))

        # Derived features
        whr  = waist_cm / hip_cm
        whr  = max(0.65, min(1.20, whr))
        whtr = waist_cm / height_cm
        ci   = conicity_index(waist_cm, weight_kg, height_cm)

        # Body fat from Navy formula
        if gender == 'male':
            bf = navy_bf_male(waist_cm, neck_cm, height_cm)
        else:
            bf = navy_bf_female(waist_cm, neck_cm, hip_cm, height_cm)
        if bf is None:
            continue

        # Add real-world measurement noise
        bf += rng.gauss(0, 1.0)
        bf  = max(3.0, min(60.0, bf))

        # Multi-output targets
        trunk_fat_pct, appendicular_fat_pct, visceral_level = compute_regional_fat(bf, gender, whr, age)

        # Add noise to targets too
        trunk_fat_pct        = max(4,  min(65, trunk_fat_pct        + rng.gauss(0, 0.8)))
        appendicular_fat_pct = max(3,  min(55, appendicular_fat_pct + rng.gauss(0, 0.6)))
        visceral_level       = max(1,  min(12, visceral_level        + rng.gauss(0, 0.3)))

        X.append([bmi, age, g_int, whr, whtr, shr, waist_cm, neck_cm, hip_cm, height_cm, ci, weight_kg])
        Y.append([bf, trunk_fat_pct, appendicular_fat_pct, visceral_level])

    return np.array(X, dtype=np.float32), np.array(Y, dtype=np.float32)


# ── Build ensemble estimator ──────────────────────────────────────────────────
def build_ensemble():
    mlp = MLPRegressor(
        hidden_layer_sizes=(256, 128, 64, 32),
        activation='relu',
        solver='adam',
        max_iter=600,
        learning_rate_init=0.0008,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=25,
        random_state=42,
    )
    gbr = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.85,
        random_state=42,
    )
    etr = ExtraTreesRegressor(
        n_estimators=150,
        max_depth=12,
        min_samples_leaf=3,
        random_state=42,
    )
    voting = VotingRegressor(estimators=[('mlp', mlp), ('gbr', gbr), ('etr', etr)])
    return voting


# ── Train and save ────────────────────────────────────────────────────────────
def train(verbose=True):
    if verbose:
        print("=" * 58)
        print("  BodyAnalyzer — Ensemble ML Training")
        print("=" * 58)
        print(f"  Generating 20,000 synthetic training samples...")

    X, Y = generate_training_data(n=20_000)
    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.15, random_state=42)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    if verbose:
        print(f"  Training ensemble (MLP + GradientBoosting + ExtraTrees)...")
        print(f"  Features : {X.shape[1]}  |  Outputs : {Y.shape[1]}")

    # Multi-output wrapper
    ensemble   = build_ensemble()
    mo_model   = MultiOutputRegressor(ensemble, n_jobs=-1)
    mo_model.fit(X_train_s, Y_train)

    Y_pred = mo_model.predict(X_test_s)

    output_names = ['body_fat', 'trunk_fat', 'appendicular_fat', 'visceral_level']
    maes = {}
    for i, name in enumerate(output_names):
        maes[name] = round(float(mean_absolute_error(Y_test[:, i], Y_pred[:, i])), 2)

    if verbose:
        print(f"\n  ✓ Training complete — Test MAE per output:")
        for k, v in maes.items():
            unit = '' if k == 'visceral_level' else '%'
            print(f"      {k:<26} {v:.2f}{unit}")

    os.makedirs("model", exist_ok=True)
    joblib.dump({'scaler': scaler, 'model': mo_model, 'feature_names': output_names}, "model/bf_model.pkl")

    if verbose:
        print(f"\n  Model saved → backend/model/bf_model.pkl")
        print("=" * 58 + "\n")

    return {
        "mae": maes,
        "train_samples": int(len(X_train)),
        "test_samples":  int(len(X_test)),
        "outputs":       output_names,
    }


if __name__ == "__main__":
    import sys
    verbose = "--quiet" not in sys.argv
    train(verbose=verbose)
