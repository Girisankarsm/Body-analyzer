"""
NHANES Real Dataset Loader
───────────────────────────────────────────────────────────────────────────
Downloads and merges 3 cycles of CDC NHANES public data:
  - DXX  (DEXA body composition: total fat %, trunk fat %)
  - BMX  (body measurements: waist, neck, hip, height, weight)
  - DEMO (demographics: age, gender)

Cycles used:  2013-2014 (H), 2015-2016 (I), 2017-2018 (J)
Target N:     ~6,000 participants with complete DEXA + measurements

Data is cached locally in backend/data/nhanes/ so it only downloads once.
Falls back to empty DataFrame if CDC is unreachable.
"""

import os
import io
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

NHANES_BASE = "https://wwwn.cdc.gov/Nchs/Nhanes"
CACHE_DIR   = "data/nhanes"

CYCLES = [
    ("2017-2018", "J"),
    ("2015-2016", "I"),
    ("2013-2014", "H"),
]


def _download_xpt(url: str, fname: str) -> pd.DataFrame | None:
    """Download a SAS XPT file, cache it, return as DataFrame."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, fname)

    if not os.path.exists(path):
        try:
            import requests
            resp = requests.get(url, timeout=45)
            if resp.status_code != 200:
                return None
            with open(path, "wb") as f:
                f.write(resp.content)
        except Exception:
            return None

    try:
        df = pd.read_sas(path, format="xport", encoding="utf-8")
        df.columns = [c.upper() for c in df.columns]
        return df
    except Exception:
        return None


def _load_cycle(year: str, suffix: str) -> pd.DataFrame | None:
    """Load one NHANES cycle: merge DEMO + BMX + DXX on SEQN."""
    base = f"{NHANES_BASE}/{year}"

    demo = _download_xpt(f"{base}/DEMO_{suffix}.XPT", f"DEMO_{suffix}.XPT")
    bmx  = _download_xpt(f"{base}/BMX_{suffix}.XPT",  f"BMX_{suffix}.XPT")
    dxx  = _download_xpt(f"{base}/DXX_{suffix}.XPT",  f"DXX_{suffix}.XPT")

    if demo is None or bmx is None or dxx is None:
        return None

    # ── Select relevant columns ──────────────────────────────────────────
    demo_cols = ["SEQN", "RIAGENDR", "RIDAGEYR"]
    bmx_cols  = ["SEQN", "BMXWT", "BMXHT", "BMXWAIST", "BMXNECK", "BMXHIP"]

    # DEXA fat columns vary slightly by cycle
    dexa_fat_total  = next((c for c in ["DXDTOPF", "DXDTOFP"] if c in dxx.columns), None)
    dexa_fat_trunk  = next((c for c in ["DXDTRPF", "DXDTRPFM"] if c in dxx.columns), None)

    if dexa_fat_total is None:
        return None

    dxx_keep = ["SEQN", dexa_fat_total]
    if dexa_fat_trunk:
        dxx_keep.append(dexa_fat_trunk)

    try:
        demo_s = demo[[c for c in demo_cols if c in demo.columns]]
        bmx_s  = bmx[[c  for c in bmx_cols  if c in bmx.columns]]
        dxx_s  = dxx[[c  for c in dxx_keep  if c in dxx.columns]]

        merged = demo_s.merge(bmx_s, on="SEQN", how="inner") \
                       .merge(dxx_s,  on="SEQN", how="inner")

        # Rename to standard names
        merged = merged.rename(columns={
            "RIAGENDR":      "gender_code",   # 1=male, 2=female
            "RIDAGEYR":      "age",
            "BMXWT":         "weight_kg",
            "BMXHT":         "height_cm",
            "BMXWAIST":      "waist_cm",
            "BMXNECK":       "neck_cm",
            "BMXHIP":        "hip_cm",
            dexa_fat_total:  "body_fat_dexa",
        })
        if dexa_fat_trunk:
            merged = merged.rename(columns={dexa_fat_trunk: "trunk_fat_dexa"})
        else:
            merged["trunk_fat_dexa"] = np.nan

        merged["cycle"] = year
        return merged

    except Exception:
        return None


def load_nhanes(min_age: int = 16, max_age: int = 80) -> pd.DataFrame:
    """
    Download and combine NHANES cycles.
    Returns cleaned DataFrame with features + DEXA targets.
    Returns empty DataFrame if all downloads fail.
    """
    frames = []
    for year, suffix in CYCLES:
        print(f"  [NHANES] Downloading {year} cycle...", flush=True)
        df = _load_cycle(year, suffix)
        if df is not None:
            frames.append(df)
            print(f"    → {len(df):,} rows", flush=True)
        else:
            print(f"    → Failed (will use synthetic for this cycle)", flush=True)

    if not frames:
        print("  [NHANES] All downloads failed — using 100% synthetic data", flush=True)
        return pd.DataFrame()

    full = pd.concat(frames, ignore_index=True)

    # ── Clean ─────────────────────────────────────────────────────────────
    full = full.dropna(subset=["body_fat_dexa", "waist_cm", "neck_cm",
                                "weight_kg", "height_cm", "age", "gender_code"])
    full = full[full["age"].between(min_age, max_age)]
    full = full[full["weight_kg"].between(30, 200)]
    full = full[full["height_cm"].between(140, 215)]
    full = full[full["body_fat_dexa"].between(3, 65)]

    # Hip optional
    full["hip_cm"] = full.get("hip_cm", pd.Series(np.nan, index=full.index))

    # ── Derived features ──────────────────────────────────────────────────
    full["gender_int"]  = (full["gender_code"] == 1).astype(int)   # 1=male
    full["bmi"]         = full["weight_kg"] / (full["height_cm"] / 100) ** 2
    full["whr"]         = (full["waist_cm"] / full["hip_cm"]).clip(0.60, 1.30)
    full["whtr"]        = (full["waist_cm"] / full["height_cm"]).clip(0.30, 0.80)
    full["ci"]          = (full["waist_cm"] / (0.109 * np.sqrt(full["weight_kg"] / (full["height_cm"] / 100)))).clip(0.8, 2.0)
    full["shr"]         = 1.15  # placeholder; not in NHANES

    # Fill missing hip with BMI-estimated value
    hip_mask = full["hip_cm"].isna()
    full.loc[hip_mask & (full["gender_int"] == 1), "hip_cm"] = \
        90 + full.loc[hip_mask & (full["gender_int"] == 1), "bmi"] * 0.88
    full.loc[hip_mask & (full["gender_int"] == 0), "hip_cm"] = \
        94 + full.loc[hip_mask & (full["gender_int"] == 0), "bmi"] * 1.02

    # Fill missing trunk fat with estimated fraction
    trunk_missing = full["trunk_fat_dexa"].isna()
    full.loc[trunk_missing & (full["gender_int"] == 1), "trunk_fat_dexa"] = \
        full.loc[trunk_missing & (full["gender_int"] == 1), "body_fat_dexa"] * 0.53
    full.loc[trunk_missing & (full["gender_int"] == 0), "trunk_fat_dexa"] = \
        full.loc[trunk_missing & (full["gender_int"] == 0), "body_fat_dexa"] * 0.47

    print(f"  [NHANES] Final cleaned dataset: {len(full):,} participants", flush=True)
    return full


def nhanes_to_arrays(df: pd.DataFrame):
    """
    Convert cleaned NHANES DataFrame to feature matrix X and target matrix Y.
    Feature order matches train_model.py: [bmi, age, gender_int, whr, whtr, shr,
                                            waist_cm, neck_cm, hip_cm, height_cm, ci, weight_kg]
    Targets: [body_fat, trunk_fat, appendicular_fat (estimated), visceral_level (estimated)]
    """
    feature_cols = ["bmi", "age", "gender_int", "whr", "whtr", "shr",
                    "waist_cm", "neck_cm", "hip_cm", "height_cm", "ci", "weight_kg"]

    X = df[feature_cols].values.astype(np.float32)

    body_fat  = df["body_fat_dexa"].values
    trunk_fat = df["trunk_fat_dexa"].values

    # Appendicular: rest of fat after trunk (approximate from DEXA android/gynoid model)
    append_fat = np.clip(body_fat * 0.38 + (body_fat - trunk_fat) * 0.30, 3, 55)

    # Visceral level estimate from trunk fat + age + WHR
    whr     = df["whr"].values
    age_arr = df["age"].values
    visc    = np.clip((trunk_fat * 0.30) + (age_arr - 20) * 0.045 + (whr - 0.80) * 9.0, 1, 12)

    Y = np.column_stack([body_fat, trunk_fat, append_fat, visc]).astype(np.float32)
    return X, Y
