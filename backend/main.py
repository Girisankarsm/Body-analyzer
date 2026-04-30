"""
BodyAnalyzer FastAPI Backend
Uses the US Navy body fat formula with MediaPipe Pose estimation
for real-time body fat analysis.

Endpoints:
  POST /analyze          — analyze uploaded image + biometrics
  POST /train            — (re)train the MLP model, stream epoch logs
  GET  /model/status     — check if model is trained
  GET  /health           — health check
"""

import os
import time
import json
import base64
import asyncio
import warnings
from contextlib import asynccontextmanager
from typing import Optional

warnings.filterwarnings("ignore", category=RuntimeWarning)

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from analyzer import BodyAnalyzer
from train_model import train as train_model, generate_training_data, navy_bf_male, navy_bf_female


# ── Startup: auto-train if no model exists ───────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.path.exists("model/bf_model.pkl"):
        print("[startup] No model found — training now...")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: train_model(verbose=True))
    else:
        print("[startup] Model found — ready.")
    yield


app = FastAPI(title="BodyAnalyzer ML API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = BodyAnalyzer()


# ── Request / response schemas ───────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    image_base64: Optional[str] = None   # base64-encoded image (no data URL prefix)
    height_cm: float
    weight_kg: float
    gender: str        # "male" | "female"
    age: int


class TrainRequest(BaseModel):
    n_samples: int = 12_000


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    model_ready = os.path.exists("model/bf_model.pkl")
    return {"status": "ok", "model_ready": model_ready}


@app.get("/model/status")
def model_status():
    path = "model/bf_model.pkl"
    if os.path.exists(path):
        size_kb = os.path.getsize(path) // 1024
        return {"trained": True, "size_kb": size_kb}
    return {"trained": False}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """
    Analyze body composition from image + biometrics.
    Uses MediaPipe pose → Navy body fat formula + MLP refinement.
    """
    if req.gender not in ("male", "female"):
        raise HTTPException(status_code=400, detail="gender must be 'male' or 'female'")
    if not (100 <= req.height_cm <= 220):
        raise HTTPException(status_code=400, detail="height_cm out of range [100, 220]")
    if not (30 <= req.weight_kg <= 200):
        raise HTTPException(status_code=400, detail="weight_kg out of range [30, 200]")

    image_bytes = None
    if req.image_base64:
        try:
            # Strip data URL prefix if present
            b64 = req.image_base64
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            image_bytes = base64.b64decode(b64)
        except Exception:
            image_bytes = None

    # Re-initialize analyzer each time to pick up newly trained model
    global analyzer
    analyzer = BodyAnalyzer()

    result = analyzer.analyze(
        image_bytes=image_bytes if image_bytes else b"",
        height_cm=req.height_cm,
        weight_kg=req.weight_kg,
        gender=req.gender,
        age=req.age,
    )

    return result


@app.post("/train/stream")
async def train_stream(req: TrainRequest):
    """
    Train the MLP model and stream epoch-by-epoch logs (SSE / newline-delimited JSON).
    This replicates the TensorFlow training console experience in the Analytics page.
    """

    async def generate():
        import threading

        logs = []
        done = threading.Event()
        result_holder = {}

        def _train():
            from sklearn.neural_network import MLPRegressor
            from sklearn.preprocessing import StandardScaler
            from sklearn.pipeline import Pipeline
            from sklearn.model_selection import train_test_split
            from sklearn.metrics import mean_absolute_error
            import joblib

            X, y = generate_training_data(n=req.n_samples)
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.15, random_state=42)

            epochs_reported = set()

            class EpochCallback:
                pass

            mlp = MLPRegressor(
                hidden_layer_sizes=(128, 64, 32),
                activation='relu',
                solver='adam',
                max_iter=1,
                warm_start=True,
                random_state=42,
                learning_rate_init=0.001,
            )

            scaler = StandardScaler()
            X_train_s = scaler.fit_transform(X_train)
            X_test_s  = scaler.transform(X_test)

            prev_loss = None
            for epoch in range(1, 51):
                mlp.fit(X_train_s, y_train)
                current_loss = mlp.loss_
                logs.append({
                    "epoch": epoch,
                    "total": 50,
                    "loss": round(float(current_loss), 4),
                })
                prev_loss = current_loss
                time.sleep(0.04)

            preds = mlp.predict(X_test_s)
            mae   = mean_absolute_error(y_test, preds)

            os.makedirs("model", exist_ok=True)
            from sklearn.pipeline import Pipeline
            pipeline = Pipeline([('scaler', scaler), ('mlp', mlp)])
            pipeline.named_steps['mlp'].max_iter = 500
            pipeline.named_steps['mlp'].warm_start = False
            pipeline.fit(X_train, y_train)

            joblib.dump(pipeline, "model/bf_model.pkl")

            result_holder['mae'] = round(float(mae), 2)
            result_holder['train_samples'] = int(len(X_train))
            done.set()

        t = threading.Thread(target=_train, daemon=True)
        t.start()

        sent = 0
        yield json.dumps({"type": "start", "message": "Initializing training data (n=12,000)..."}) + "\n"
        await asyncio.sleep(0.3)
        yield json.dumps({"type": "log", "message": "Loading dataset using Navy body fat formula..."}) + "\n"
        await asyncio.sleep(0.3)
        yield json.dumps({"type": "log", "message": "Compiling MLP 128→64→32 neurons..."}) + "\n"
        await asyncio.sleep(0.4)

        while not done.is_set() or sent < len(logs):
            while sent < len(logs):
                log = logs[sent]
                yield json.dumps({
                    "type": "epoch",
                    "epoch": log["epoch"],
                    "total": log["total"],
                    "loss": log["loss"],
                }) + "\n"
                sent += 1
                await asyncio.sleep(0.06)
            await asyncio.sleep(0.05)

        yield json.dumps({
            "type": "complete",
            "mae": result_holder.get('mae', 0),
            "train_samples": result_holder.get('train_samples', 0),
            "message": "Training complete. Model saved.",
        }) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.post("/train")
async def train_sync(req: TrainRequest):
    """Synchronous training endpoint (returns when done)."""
    import asyncio
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: train_model(verbose=False))
    return {"status": "trained", **result}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
