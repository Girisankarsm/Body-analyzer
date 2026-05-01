# BodyAnalyzer — AI-Powered Body Composition Analyzer

An AI-powered full-stack web application that analyzes body composition from a single photo using ensemble machine learning, CNN deep learning, and clinically validated formulas — trained on real NHANES DEXA data.

---

## Features

- **Google OAuth Login** — secure sign-in with profile persistence
- **Body Scan** — upload a photo + enter height/weight/age/gender
- **AI Analysis** — ensemble ML (MLP + GBR + ETR) trained on 9,549 real NHANES DEXA participants
- **CNN Image Model** — MobileNetV2 extracts body features from the uploaded photo
- **3D Body Model** — GLB model with per-region fat heatmap (abdomen, chest, back, arms, thighs, calves)
- **Body Shape Morphing** — 3D model morphs based on body proportions
- **Dashboard** — body fat %, BMI, visceral fat, metabolic age, body composition donut chart
- **Insights** — nutrition plan, exercise protocol, advanced estimations
- **Analytics** — deep ML prediction engine, organ risk, biological age

---

## Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| Next.js 14 (App Router) | React framework |
| React Three Fiber + Three.js | 3D GLB model rendering |
| TailwindCSS | Styling |
| Framer Motion | Animations |
| Recharts | Data charts |
| NextAuth.js v4 | Google OAuth |

### Backend
| Technology | Purpose |
|-----------|---------|
| FastAPI + Uvicorn | REST API |
| scikit-learn | Ensemble ML (MLP + GBR + ETR) |
| PyTorch + MobileNetV2 | CNN image model |
| OpenCV + MediaPipe | Body measurement extraction |
| NHANES 2013–2018 | Real DEXA body composition data |
| pandas + numpy | Data processing |

---

## Project Structure

```
analyzer/
├── backend/                    # Python FastAPI ML backend
│   ├── app/
│   │   ├── main.py             # FastAPI routes + lifespan
│   │   ├── analyzer.py         # Core body analysis pipeline
│   │   ├── train_model.py      # Tabular ensemble training
│   │   ├── nhanes_loader.py    # NHANES dataset loader
│   │   └── image_model.py      # CNN image model (MobileNetV2)
│   ├── data/
│   │   └── nhanes/             # NHANES XPT files (auto-downloaded)
│   ├── model/                  # Trained models (auto-generated)
│   ├── requirements.txt
│   └── start.sh
│
├── src/                        # Next.js frontend
│   ├── app/
│   │   ├── login/              # Google OAuth login page
│   │   ├── scan/               # Input form + image upload
│   │   ├── dashboard/          # 3D model + body composition
│   │   ├── insights/           # Nutrition + exercise plans
│   │   ├── analytics/          # Deep ML prediction engine
│   │   └── api/auth/           # NextAuth route handler
│   ├── components/
│   │   ├── 3d/                 # BodyModel3D + BodyViewer (R3F)
│   │   └── ui/                 # Nav, shared UI components
│   ├── context/
│   │   ├── ScanContext.tsx     # Global scan state + history
│   │   └── AuthProvider.tsx    # NextAuth session provider
│   ├── lib/
│   │   ├── metrics.ts          # Body composition calculations
│   │   ├── backendApi.ts       # FastAPI client
│   │   └── auth.ts             # NextAuth config
│   └── middleware.ts           # Route protection
│
├── public/
│   └── models/                 # GLB 3D body models
│       ├── male.glb
│       └── female.glb
│
├── docs/                       # Project documentation
│   ├── architecture.jpg        # System architecture diagram
│   └── test-cases.xlsx         # Functional test cases
│
├── scripts/                    # ML training utilities
│   └── README.md
│
├── run.sh                      # Start all services
├── .env.example                # Environment variable template
└── README.md
```

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/Girisankarsm/Body-analyzer.git
cd Body-analyzer
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=any_random_secret_string
NEXTAUTH_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### 3. Run everything

```bash
bash run.sh
```

This will:
- Create Python venv and install dependencies
- Download NHANES dataset from CDC (first run, ~50MB)
- Train the ML ensemble model
- Start FastAPI backend on port 8000
- Install npm packages and start Next.js on port 3001

### 4. Open the app

| Service | URL |
|---------|-----|
| App | http://localhost:3001 |
| API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## ML Model Performance

Trained on **9,549 real NHANES DEXA participants** (2013–2018) + 15,451 NHANES-calibrated synthetic samples:

| Output | R² | MAE |
|--------|----|-----|
| Body Fat % | **0.944** | 1.68% |
| Trunk Fat % | **0.904** | 1.87% |
| Appendicular Fat % | **0.959** | 0.87% |
| Visceral Level (1–12) | **0.924** | 0.44 |

5-fold cross-validation R² = **0.945 ± 0.005**

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Random string for session encryption |
| `NEXTAUTH_URL` | Frontend URL (default: http://localhost:3001) |
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL (default: http://localhost:8000) |

---

## App Flow

```
Login (Google OAuth)
        ↓
New Scan (height, weight, age, gender, photo)
        ↓
AI Analysis (OpenCV + MediaPipe + Ensemble ML + CNN)
        ↓
Dashboard (3D model with fat heatmap + body composition)
        ↓
Insights (nutrition plan, exercise protocol)
        ↓
Analytics (deep ML engine, biological age, organ risk)
```

---

## Documentation

| File | Description |
|------|-------------|
| [`docs/architecture.jpg`](docs/architecture.jpg) | System architecture diagram |
| [`docs/test-cases.xlsx`](docs/test-cases.xlsx) | Functional test cases |
| [`backend/README.md`](backend/README.md) | Backend ML pipeline details |
| [`scripts/README.md`](scripts/README.md) | ML training scripts |
