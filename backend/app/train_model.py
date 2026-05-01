"""
BodyFat Ensemble ML — NHANES Real Data + Synthetic Augmentation
────────────────────────────────────────────────────────────────────────────
Strategy:
  1. Try to download 3 cycles of real NHANES DEXA data (~6,000 participants)
  2. Augment with 20,000 NHANES-calibrated synthetic samples
  3. Train VotingRegressor(MLP + GBR + ETR) with MultiOutputRegressor
  4. Report MAE, RMSE, R² per output + 5-fold cross-validation
  5. Save model with feature importances and training metadata

Outputs (4):
  body_fat_pct  |  trunk_fat_pct  |  appendicular_fat_pct  |  visceral_level

Features (12):
  bmi, age, gender_int, waist_hip_ratio, waist_height_ratio,
  shoulder_hip_ratio, waist_cm, neck_cm, hip_cm, height_cm,
  conicity_index, weight_kg
────────────────────────────────────────────────────────────────────────────
"""

import math
import os
import sys
import random
import warnings
import numpy as np
import joblib

warnings.filterwarnings("ignore")

from sklearn.neural_network      import MLPRegressor
from sklearn.ensemble            import GradientBoostingRegressor, ExtraTreesRegressor, VotingRegressor
from sklearn.multioutput         import MultiOutputRegressor
from sklearn.preprocessing       import StandardScaler
from sklearn.model_selection     import train_test_split, KFold
from sklearn.metrics             import mean_absolute_error, mean_squared_error, r2_score


# ── Navy body fat formulas ────────────────────────────────────────────────────
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


def deurenberg_bf(bmi, age, sex):
    return max(4.0, min(55.0, 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4))


def conicity_index(waist_cm, weight_kg, height_cm):
    try:
        return waist_cm / (0.109 * math.sqrt(weight_kg / (height_cm / 100)))
    except Exception:
        return 1.25


# ── NHANES-calibrated synthetic data generator ────────────────────────────────
def _regional(body_fat, gender, whr, age):
    if gender == "male":
        android = max(0.33, min(0.70, 0.46 + (whr - 0.90) * 0.30 + (age - 30) * 0.0025))
    else:
        android = max(0.26, min(0.60, 0.38 + (whr - 0.80) * 0.25 + (age - 30) * 0.0020))
    gynoid  = 1.0 - android
    trunk   = round(min(65, max(5, body_fat * android * 1.28)), 1)
    append  = round(min(55, max(3, body_fat * gynoid  * 0.92)), 1)
    visceral= round(max(1, min(12, (trunk * 0.30) + (age - 20) * 0.045 + (whr - 0.80) * 9.0)), 1)
    return trunk, append, visceral


def generate_synthetic(n=20_000, seed=42):
    """NHANES-calibrated synthetic samples (CDC 2003-2018 reference stats)."""
    rng = random.Random(seed)
    np.random.seed(seed)
    X, Y = [], []

    for _ in range(n):
        gender  = rng.choice(["male", "female"])
        g_int   = 1 if gender == "male" else 0
        age     = max(16, min(80, int(rng.gauss(38, 13) if rng.random() < 0.65 else rng.randint(16, 80))))

        height_cm = max(148, min(215, rng.gauss(175.7 if gender == "male" else 162.1,
                                                 7.1  if gender == "male" else 6.5)))
        bmi_target = max(16, min(50, rng.gauss(28.2 if gender == "male" else 29.1,
                                               6.1  if gender == "male" else 7.3)))
        weight_kg = max(40, min(165, bmi_target * (height_cm / 100) ** 2))
        bmi       = weight_kg / (height_cm / 100) ** 2

        if gender == "male":
            neck_cm  = max(27, min(55, rng.gauss(30.5 + bmi * 0.28, 2.0)))
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

        if gender == "male":
            navy = navy_bf_male(waist_cm, neck_cm, height_cm)
        else:
            navy = navy_bf_female(waist_cm, neck_cm, hip_cm, height_cm)
        if navy is None:
            continue

        deuren   = deurenberg_bf(bmi, age, g_int)
        body_fat = max(3.0, min(60.0, 0.60 * navy + 0.40 * deuren + rng.gauss(0, 0.9)))

        trunk, append, visc = _regional(body_fat, gender, whr, age)
        trunk  = max(4,  min(65, trunk  + rng.gauss(0, 0.7)))
        append = max(3,  min(55, append + rng.gauss(0, 0.6)))
        visc   = max(1,  min(12, visc   + rng.gauss(0, 0.25)))

        X.append([bmi, age, g_int, whr, whtr, shr, waist_cm, neck_cm, hip_cm, height_cm, ci, weight_kg])
        Y.append([body_fat, trunk, append, visc])

    return np.array(X, dtype=np.float32), np.array(Y, dtype=np.float32)


# ── Ensemble builder ──────────────────────────────────────────────────────────
def build_ensemble():
    mlp = MLPRegressor(
        hidden_layer_sizes=(256, 128, 64, 32),
        activation="relu", solver="adam", max_iter=700,
        learning_rate_init=0.0007, early_stopping=True,
        validation_fraction=0.10, n_iter_no_change=30,
        alpha=0.0005, random_state=42,
    )
    gbr = GradientBoostingRegressor(
        n_estimators=250, max_depth=5, learning_rate=0.07,
        subsample=0.80, min_samples_leaf=4, random_state=42,
    )
    etr = ExtraTreesRegressor(
        n_estimators=200, max_depth=14, min_samples_leaf=3,
        random_state=42, n_jobs=-1,
    )
    return VotingRegressor(estimators=[("mlp", mlp), ("gbr", gbr), ("etr", etr)])


# ── Metrics helper ────────────────────────────────────────────────────────────
def _metrics(y_true, y_pred):
    mae  = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2   = float(r2_score(y_true, y_pred))
    return {"mae": round(mae, 3), "rmse": round(rmse, 3), "r2": round(r2, 3)}


# ── Main train function ───────────────────────────────────────────────────────
def train(verbose=True):
    output_names = ["body_fat", "trunk_fat", "appendicular_fat", "visceral_level"]
    data_source  = "synthetic_only"

    # ── Step 1: Try NHANES real data ─────────────────────────────────────
    X_real, Y_real = np.empty((0, 12), dtype=np.float32), np.empty((0, 4), dtype=np.float32)
    try:
        from app.nhanes_loader import load_nhanes, nhanes_to_arrays
        nhanes_df = load_nhanes()
        if len(nhanes_df) >= 500:
            X_real, Y_real = nhanes_to_arrays(nhanes_df)
            data_source = f"nhanes_real_{len(X_real)}_plus_synthetic"
            if verbose:
                print(f"  ✓ Real NHANES data loaded: {len(X_real):,} participants")
        else:
            if verbose:
                print("  ℹ NHANES returned < 500 rows — using synthetic only")
    except Exception as e:
        if verbose:
            print(f"  ℹ NHANES load skipped ({e}) — using synthetic only")

    # ── Step 2: Generate synthetic data ──────────────────────────────────
    n_synth = max(5_000, 25_000 - len(X_real))
    if verbose:
        print(f"  Generating {n_synth:,} synthetic samples (NHANES-calibrated)...")
    X_syn, Y_syn = generate_synthetic(n=n_synth)

    # ── Step 3: Combine ───────────────────────────────────────────────────
    if len(X_real) > 0:
        # Real NHANES data weighted 3× during training (repeat rows)
        X_real_w = np.tile(X_real, (3, 1))
        Y_real_w = np.tile(Y_real, (3, 1))
        X = np.vstack([X_real_w, X_syn])
        Y = np.vstack([Y_real_w, Y_syn])
    else:
        X, Y = X_syn, Y_syn

    if verbose:
        print(f"  Total training pool: {len(X):,} samples")
        print(f"  Features: {X.shape[1]}  |  Outputs: {Y.shape[1]}")

    X_train, X_test, Y_train, Y_test = train_test_split(X, Y, test_size=0.15, random_state=42)

    scaler    = StandardScaler()
    Xtr_s     = scaler.fit_transform(X_train)
    Xte_s     = scaler.transform(X_test)

    if verbose:
        print(f"\n  Training VotingRegressor ensemble (MLP + GBR + ETR) …")

    ensemble = build_ensemble()
    mo_model = MultiOutputRegressor(ensemble, n_jobs=-1)
    mo_model.fit(Xtr_s, Y_train)

    Y_pred = mo_model.predict(Xte_s)

    # ── Step 4: Test-set metrics per output ───────────────────────────────
    test_metrics = {}
    if verbose:
        print(f"\n  Test-set metrics (MAE / RMSE / R²):")
    for i, name in enumerate(output_names):
        m = _metrics(Y_test[:, i], Y_pred[:, i])
        test_metrics[name] = m
        unit = "" if name == "visceral_level" else "%"
        if verbose:
            print(f"    {name:<26}  MAE={m['mae']:.2f}{unit}  RMSE={m['rmse']:.2f}{unit}  R²={m['r2']:.3f}")

    # ── Step 5: 5-fold cross-validation on body_fat ───────────────────────
    if verbose:
        print(f"\n  5-fold cross-validation (body_fat MAE) …")

    scaler_cv = StandardScaler()
    X_cv_s    = scaler_cv.fit_transform(X)
    kf        = KFold(n_splits=5, shuffle=True, random_state=42)
    cv_maes, cv_r2s = [], []

    for fold, (tr_idx, val_idx) in enumerate(kf.split(X_cv_s), 1):
        ens  = build_ensemble()
        mo   = MultiOutputRegressor(ens, n_jobs=-1)
        mo.fit(X_cv_s[tr_idx], Y[tr_idx])
        preds = mo.predict(X_cv_s[val_idx])
        cv_maes.append(float(mean_absolute_error(Y[val_idx, 0], preds[:, 0])))
        cv_r2s.append(float(r2_score(Y[val_idx, 0], preds[:, 0])))
        if verbose:
            print(f"    Fold {fold}: MAE={cv_maes[-1]:.2f}%  R²={cv_r2s[-1]:.3f}")

    cv_mae_mean = float(np.mean(cv_maes))
    cv_mae_std  = float(np.std(cv_maes))
    cv_r2_mean  = float(np.mean(cv_r2s))

    if verbose:
        print(f"\n  Cross-val  MAE = {cv_mae_mean:.2f}% ± {cv_mae_std:.2f}%")
        print(f"  Cross-val  R²  = {cv_r2_mean:.3f}")

    # ── Step 6: Final model — refit on ALL data ───────────────────────────
    if verbose:
        print(f"\n  Fitting final model on full dataset …")

    scaler_final = StandardScaler()
    X_all_s      = scaler_final.fit_transform(X)
    ens_final    = build_ensemble()
    mo_final     = MultiOutputRegressor(ens_final, n_jobs=-1)
    mo_final.fit(X_all_s, Y)

    # ── Step 7: Feature importance from ExtraTrees sub-estimator ─────────
    feature_names = ["bmi", "age", "gender", "whr", "whtr", "shr",
                     "waist_cm", "neck_cm", "hip_cm", "height_cm", "ci", "weight_kg"]
    importances = {}
    try:
        # Each output's VotingRegressor has an ExtraTrees estimator
        for i, out in enumerate(output_names):
            etr_est = mo_final.estimators_[i].estimators_[2]   # index 2 = etr
            imp     = dict(zip(feature_names, etr_est.feature_importances_))
            importances[out] = {k: round(float(v), 4) for k, v in sorted(imp.items(), key=lambda x: -x[1])[:5]}
    except Exception:
        pass

    if verbose and importances:
        print(f"\n  Top features (ExtraTrees — body_fat):")
        for k, v in list(importances.get("body_fat", {}).items())[:5]:
            print(f"    {k:<14} {v:.4f}")

    # ── Step 8: Save ──────────────────────────────────────────────────────
    os.makedirs("model", exist_ok=True)
    model_pkg = {
        "scaler":         scaler_final,
        "model":          mo_final,
        "feature_names":  output_names,
        "data_source":    data_source,
        "cv_mae_mean":    round(cv_mae_mean, 3),
        "cv_mae_std":     round(cv_mae_std,  3),
        "cv_r2_mean":     round(cv_r2_mean,  3),
        "test_metrics":   test_metrics,
        "importances":    importances,
        "n_train":        int(len(X)),
    }
    joblib.dump(model_pkg, "model/bf_model.pkl")

    if verbose:
        print(f"\n  Model saved → backend/model/bf_model.pkl")
        print(f"  Data source: {data_source}")
        print("=" * 62 + "\n")

    return {
        "mae":           round(test_metrics["body_fat"]["mae"], 2),
        "r2":            round(test_metrics["body_fat"]["r2"],  3),
        "cv_mae_mean":   round(cv_mae_mean, 2),
        "cv_r2":         round(cv_r2_mean,  3),
        "train_samples": int(len(X)),
        "data_source":   data_source,
        "outputs":       output_names,
    }


# ── Expose generate_training_data for the streaming endpoint ─────────────────
def generate_training_data(n=20_000, seed=42):
    return generate_synthetic(n=n, seed=seed)


if __name__ == "__main__":
    print("=" * 62)
    print("  BodyAnalyzer — NHANES + Synthetic Ensemble Training")
    print("=" * 62)
    train(verbose=True)
