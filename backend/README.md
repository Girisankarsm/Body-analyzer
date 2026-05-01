# BodyAnalyzer — ML Backend

FastAPI backend for AI-powered body composition analysis.

## Stack

| Component | Technology |
|-----------|-----------|
| API Framework | FastAPI + Uvicorn |
| Body Analysis | OpenCV + MediaPipe Pose |
| Tabular ML | scikit-learn VotingRegressor (MLP + GBR + ETR) |
| Image ML | MobileNetV2 (PyTorch) + MLPRegressor |
| Dataset | NHANES 2013-2018 (9,549 DEXA participants) + HuggingFace body images |
| Body Fat Formula | US Navy + Deurenberg (blended) |

## Folder Structure

```
backend/
├── app/
│   ├── main.py           # FastAPI entrypoint — routes, lifespan, auto-train
│   ├── analyzer.py       # Core body analysis pipeline
│   ├── train_model.py    # Tabular ensemble training (NHANES + synthetic)
│   ├── nhanes_loader.py  # NHANES XPT dataset downloader + parser
│   └── image_model.py    # CNN image model (MobileNetV2 feature extractor)
├── data/
│   └── nhanes/           # Downloaded NHANES XPT files (auto-created)
├── model/                # Trained model files (auto-created, gitignored)
│   ├── bf_model.pkl      # Tabular ensemble model
│   └── image_model.pkl   # CNN image model
├── requirements.txt      # Python dependencies
└── start.sh              # Startup script
```

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check |
| POST | `/analyze` | Body composition analysis |
| POST | `/train/stream` | SSE training stream |
| GET | `/model/info` | Trained model metadata |

## ML Pipeline

```
User photo + height/weight/age/gender
        ↓
MediaPipe Pose → body landmarks (optional)
OpenCV contour → waist/neck/hip estimates
        ↓
BMI-based sanity validation + correction
        ↓
Navy formula + Deurenberg cross-check (blended)
        ↓
Ensemble ML (MLP + GBR + ETR)  ← NHANES 9,549 real DEXA participants
        ↓
CNN (MobileNetV2)  ← 315 HuggingFace body images
        ↓
3-way blend → final body fat % + 4 outputs
+ 95% confidence interval
+ morph targets for 3D model
```

## Running

```bash
cd backend
bash start.sh
```

API available at: http://localhost:8000
Docs at: http://localhost:8000/docs

## Model Performance (NHANES real data)

| Output | R² | MAE |
|--------|----|-----|
| Body Fat % | 0.944 | 1.68% |
| Trunk Fat % | 0.904 | 1.87% |
| Appendicular Fat % | 0.959 | 0.87% |
| Visceral Level | 0.924 | 0.44 |
