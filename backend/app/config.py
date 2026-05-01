"""
BodyAnalyzer Backend — Central Configuration
All tunable constants in one place.
"""

import os

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR         = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR        = os.path.join(BASE_DIR, "model")
DATA_DIR         = os.path.join(BASE_DIR, "data")
NHANES_DIR       = os.path.join(DATA_DIR, "nhanes")

TABULAR_MODEL_PATH = os.path.join(MODEL_DIR, "bf_model.pkl")
IMAGE_MODEL_PATH   = os.path.join(MODEL_DIR, "image_model.pkl")

# ── NHANES dataset ────────────────────────────────────────────────────────────
NHANES_BASE_NEW  = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public"
NHANES_BASE_OLD  = "https://wwwn.cdc.gov/Nchs/Nhanes"
NHANES_CYCLES    = [
    ("2017-2018", "2017", "J"),
    ("2015-2016", "2015", "I"),
    ("2013-2014", "2013", "H"),
]
NHANES_MIN_AGE   = 16
NHANES_MAX_AGE   = 80

# ── Training ──────────────────────────────────────────────────────────────────
N_SYNTHETIC_TOTAL   = 25_000   # target synthetic pool size
NHANES_REPEAT_WEIGHT = 3       # real NHANES rows repeated N× vs synthetic
CROSS_VAL_FOLDS      = 5

# ── Inference ─────────────────────────────────────────────────────────────────
BODY_FAT_MIN     = 3.0
BODY_FAT_MAX     = 55.0
VISCERAL_MAX     = 12.0

# Formula blend thresholds (Navy vs Deurenberg)
BLEND_DIFF_HIGH  = 10.0   # % diff → heavy Deurenberg weight
BLEND_DIFF_MED   =  5.0   # % diff → partial Deurenberg weight
LEAN_BMI_CUTOFF  = 23.0   # below this BMI → lean penalty on Navy trust

# ── API ───────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS  = ["http://localhost:3001", "http://localhost:3000"]
REQUEST_TIMEOUT  = 60     # seconds
