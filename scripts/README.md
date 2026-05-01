# Scripts

Standalone ML training and utility scripts.

## Usage

Run from the `backend/` directory with the venv activated:

```bash
cd backend
source venv/bin/activate
```

### Train tabular ensemble model (MLP + GBR + ETR on NHANES data)

```bash
python -c "import sys; sys.path.insert(0,'app'); from app.train_model import train; train()"
```

### Train CNN image model (MobileNetV2 on HuggingFace body dataset)

```bash
python -c "import sys; sys.path.insert(0,'app'); from app.image_model import download_and_train; download_and_train()"
```

### Download NHANES dataset manually

```bash
python -c "import sys; sys.path.insert(0,'app'); from app.nhanes_loader import load_nhanes; df = load_nhanes(); print('Rows:', len(df))"
```

## Output

| File | Description |
|------|-------------|
| `backend/model/bf_model.pkl` | Trained tabular ensemble (auto-generated) |
| `backend/model/image_model.pkl` | Trained CNN image model (auto-generated) |
| `backend/data/nhanes/*.XPT` | Downloaded NHANES data (auto-cached) |
