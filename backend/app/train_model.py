"""
BodyFat ML Model — trains a 3-layer MLP (scikit-learn) on synthetic data
generated from the US Navy body fat formula.

Navy formula:
  BF = (495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(height))) - 450

We train with:
  inputs  : [bmi, age, gender_int, shoulder_hip_ratio, waist_cm, neck_cm, height_cm]
  output  : body_fat %

The trained model is saved to backend/model/bf_model.pkl
"""

import math
import random
import os
import numpy as np
import joblib
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error


# ── US Navy body fat formula ─────────────────────────────────────────────────
def navy_bf_male(waist_cm: float, neck_cm: float, height_cm: float) -> float:
    try:
        diff = waist_cm - neck_cm
        if diff <= 0:
            return None
        bf = (495 / (1.0324 - 0.19077 * math.log10(diff) + 0.15456 * math.log10(height_cm))) - 450
        return max(3.0, min(55.0, bf))
    except (ValueError, ZeroDivisionError):
        return None


def navy_bf_female(waist_cm: float, neck_cm: float, hip_cm: float, height_cm: float) -> float:
    try:
        diff = waist_cm + hip_cm - neck_cm
        if diff <= 0:
            return None
        bf = (495 / (1.29579 - 0.35004 * math.log10(diff) + 0.22100 * math.log10(height_cm))) - 450
        return max(8.0, min(60.0, bf))
    except (ValueError, ZeroDivisionError):
        return None


# ── Synthetic training data generator ───────────────────────────────────────
def generate_training_data(n: int = 12_000, seed: int = 42) -> tuple:
    rng = random.Random(seed)
    np.random.seed(seed)

    X, y = [], []

    for _ in range(n):
        gender = rng.choice(['male', 'female'])
        gender_int = 1 if gender == 'male' else 0

        height_cm = rng.gauss(175 if gender == 'male' else 163, 8)
        height_cm = max(150, min(210, height_cm))

        weight_kg = rng.gauss(80 if gender == 'male' else 65, 15)
        weight_kg = max(40, min(160, weight_kg))

        age = rng.randint(16, 75)
        bmi = weight_kg / (height_cm / 100) ** 2

        # Realistic body measurements
        if gender == 'male':
            neck_cm = rng.gauss(38 + bmi * 0.25, 2.5)
            neck_cm = max(28, min(55, neck_cm))
            waist_cm = rng.gauss(80 + bmi * 1.2, 8)
            waist_cm = max(60, min(140, waist_cm))
            hip_cm = rng.gauss(95 + bmi * 0.8, 7)
            shoulder_hip_ratio = rng.gauss(1.20, 0.08)
        else:
            neck_cm = rng.gauss(33 + bmi * 0.15, 2.0)
            neck_cm = max(25, min(48, neck_cm))
            waist_cm = rng.gauss(70 + bmi * 1.0, 8)
            waist_cm = max(55, min(130, waist_cm))
            hip_cm = rng.gauss(100 + bmi * 0.9, 8)
            shoulder_hip_ratio = rng.gauss(0.95, 0.07)

        if gender == 'male':
            bf = navy_bf_male(waist_cm, neck_cm, height_cm)
        else:
            bf = navy_bf_female(waist_cm, neck_cm, hip_cm, height_cm)

        if bf is None:
            continue

        # Add small real-world noise (measurement uncertainty)
        bf += rng.gauss(0, 1.2)
        bf = max(3.0, min(60.0, bf))

        X.append([bmi, age, gender_int, shoulder_hip_ratio, waist_cm, neck_cm, height_cm])
        y.append(bf)

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)


# ── Train and save the model ─────────────────────────────────────────────────
def train(verbose: bool = True) -> dict:
    if verbose:
        print("Generating synthetic training data (n=12,000) using Navy formula...")
        print("Using US Navy body fat formula with MLP refinement.\n")

    X, y = generate_training_data(n=12_000)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)

    model = Pipeline([
        ('scaler', StandardScaler()),
        ('mlp', MLPRegressor(
            hidden_layer_sizes=(128, 64, 32),
            activation='relu',
            solver='adam',
            max_iter=500,
            learning_rate_init=0.001,
            early_stopping=True,
            validation_fraction=0.1,
            n_iter_no_change=20,
            random_state=42,
            verbose=verbose,
        ))
    ])

    if verbose:
        print("Training MLP (3-layer: 128→64→32 neurons)...\n")

    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)

    if verbose:
        print(f"\n Training complete.")
        print(f"  MAE on test set : {mae:.2f}%")
        print(f"  Samples trained : {len(X_train)}")

    os.makedirs("model", exist_ok=True)
    joblib.dump(model, "model/bf_model.pkl")

    if verbose:
        print("  Model saved     : backend/model/bf_model.pkl\n")

    return {
        "mae": round(float(mae), 2),
        "train_samples": int(len(X_train)),
        "test_samples": int(len(X_test)),
        "iterations": int(model.named_steps['mlp'].n_iter_),
        "loss_curve": [round(float(v), 4) for v in model.named_steps['mlp'].loss_curve_],
    }


if __name__ == "__main__":
    train(verbose=True)
