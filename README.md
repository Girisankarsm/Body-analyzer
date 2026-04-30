<div align="center">

# Body Analyzer

**AI-powered body composition analysis with 3D visualization**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)](https://www.python.org)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)

Upload a photo, enter your measurements — get a full body composition report with a 3D heatmap model, nutrition plan, and ML-powered health insights.

</div>

---

## What It Does

Body Analyzer combines computer vision, the US Navy body fat formula, and a trained neural network to estimate your body composition from a single photo. Results are visualized on an interactive 3D model and broken down across four pages — all behind secure Google login.

---

## App Flow

```
Google Login  →  Body Scan Input  →  Dashboard  →  Insights  →  Analytics
     🔐               📸                 🧍             🥗             🧠
  Sign in with    Height/weight/     3D model +     Nutrition &    ML engine +
  Google OAuth    image upload       live metrics   exercise plan  organ risk
```

---

## Features

| Page | What you get |
|---|---|
| **Login** | Secure Google OAuth sign-in |
| **Scan** | Upload photo + enter height, weight, age, gender |
| **Dashboard** | Interactive 3D body model with heatmap, BMI, body fat %, lean mass, health score |
| **Insights** | Personalized nutrition plan, exercise protocol, TDEE, hydration target, BMR |
| **Analytics** | Organ risk indicators, live ML training console, regional fat distribution |

### ML Pipeline

1. Image decoded and processed with **OpenCV** contour detection
2. Body measurements estimated (neck, waist, hip widths)
3. **US Navy body fat formula** applied for base prediction
4. **scikit-learn MLPRegressor** (128→64→32) refines the estimate
5. Results include confidence score, regional fat breakdown, and anomaly flags

---

## Project Structure

```
Body-analyzer/
├── run.sh                          # ← start everything with one command
├── .env.example                    # ← copy to .env.local and fill in secrets
├── README.md
│
├── public/
│   └── models/
│       ├── male.glb                # 3D male body model
│       └── female.glb              # 3D female body model
│
├── backend/                        # Python FastAPI ML service
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # API endpoints (/analyze, /train/stream, /health)
│   │   ├── analyzer.py             # OpenCV analysis + Navy formula + MLP inference
│   │   └── train_model.py          # Synthetic data generation + MLP training
│   ├── model/                      # bf_model.pkl (auto-generated on first run)
│   ├── requirements.txt
│   └── start.sh                    # Start backend only
│
└── src/                            # Next.js 14 App Router frontend
    ├── middleware.ts                # Protects /scan /dashboard /insights /analytics
    ├── app/
    │   ├── page.tsx                 # Root redirect (login or scan)
    │   ├── layout.tsx               # Providers: Auth + Scan context
    │   ├── globals.css
    │   ├── login/page.tsx           # Google sign-in page
    │   ├── scan/page.tsx            # Input form + analysis trigger
    │   ├── dashboard/page.tsx       # 3D model + metrics
    │   ├── insights/page.tsx        # Nutrition & exercise
    │   ├── analytics/page.tsx       # ML console + risk prediction
    │   └── api/auth/[...nextauth]/  # NextAuth.js handler
    ├── components/
    │   ├── 3d/
    │   │   ├── BodyModel3D.tsx      # Three.js canvas + GLB loader
    │   │   └── BodyViewer.tsx       # Dynamic import wrapper (no SSR)
    │   └── ui/
    │       └── Nav.tsx              # Top navigation bar
    ├── context/
    │   ├── AuthProvider.tsx         # NextAuth SessionProvider wrapper
    │   └── ScanContext.tsx          # Scan results + localStorage persistence
    └── lib/
        ├── auth.ts                  # NextAuth config (Google provider)
        ├── backendApi.ts            # FastAPI HTTP client
        └── metrics.ts               # BMI, BMR, lean mass, score calculations
```

---

## Quick Start

### Prerequisites

- **Node.js** 18+ — [nodejs.org](https://nodejs.org)
- **Python** 3.10+ — [python.org](https://www.python.org)
- **Google OAuth credentials** — [console.cloud.google.com](https://console.cloud.google.com)

---

### 1. Clone

```bash
git clone https://github.com/Girisankarsm/Body-analyzer.git
cd Body-analyzer
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in:

```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
```

### 3. Configure Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add this to **Authorized redirect URIs**:
   ```
   http://localhost:3001/api/auth/callback/google
   ```
4. Copy the Client ID and Secret into `.env.local`

### 4. Run

```bash
bash run.sh
```

Open **http://localhost:3001** in your browser.

> On first run, this installs all dependencies and trains the ML model (~5 seconds). Subsequent starts are instant.

---

## Running Services Individually

**Backend only** (FastAPI on port 8000):
```bash
cd backend
bash start.sh
```

**Frontend only** (Next.js on port 3001):
```bash
npm install
npm run dev
```

**API docs** (Swagger UI):
```
http://localhost:8000/docs
```

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| Next.js 14 (App Router) | Framework, routing, SSR |
| TypeScript | Type safety |
| TailwindCSS | Styling |
| React Three Fiber + Drei | 3D GLB rendering |
| Three.js | WebGL / 3D engine |
| Recharts | Charts and sparklines |
| Framer Motion | Animations |
| NextAuth.js v4 | Google OAuth authentication |
| Lucide React | Icons |

### Backend

| Technology | Purpose |
|---|---|
| FastAPI | REST API + streaming endpoints |
| OpenCV | Image processing, contour detection |
| scikit-learn | MLPRegressor neural network |
| NumPy | Numerical computations |
| Joblib | Model serialization |
| Uvicorn | ASGI server |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | From Google Cloud Console |
| `NEXTAUTH_URL` | Yes | App base URL (e.g. `http://localhost:3001`) |
| `NEXTAUTH_SECRET` | Yes | Random string — `openssl rand -base64 32` |
| `NEXT_PUBLIC_BACKEND_URL` | No | ML backend URL (default: `http://localhost:8000`) |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/analyze` | Analyze body composition from image + biometrics |
| `GET` | `/train/stream` | Stream live ML training epoch logs (SSE) |
| `GET` | `/model/status` | Check if ML model is trained and ready |

---

## License

MIT
