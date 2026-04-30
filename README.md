# Body Analyzer

An AI-powered full-stack web application that analyzes body composition from a photo and biometrics, visualizes results with a 3D model, and provides personalized nutrition and exercise recommendations.

## Features

- **Google OAuth login** via NextAuth.js
- **AI body scan** — upload a photo + enter height/weight/age for body fat analysis
- **3D GLB model viewer** with color-coded heatmap status
- **Dashboard** — BMI, body fat %, lean mass, sparkline charts, health score
- **Insights page** — nutrition plan, exercise protocol, advanced estimations
- **Analytics page** — organ risk prediction, ML training console, regional fat distribution
- **FastAPI ML backend** — Navy body fat formula + OpenCV contour analysis + scikit-learn MLP

---

## Project Structure

```
analyzer/
├── run.sh                        # Start both services with one command
├── .env.example                  # Environment variable template
│
├── public/
│   └── models/
│       ├── male.glb              # Male 3D body model
│       └── female.glb            # Female 3D body model
│
├── backend/                      # Python FastAPI ML service
│   ├── app/
│   │   ├── main.py               # FastAPI endpoints
│   │   ├── analyzer.py           # OpenCV body analysis + Navy formula
│   │   └── train_model.py        # scikit-learn MLP training
│   ├── model/                    # Saved model (auto-generated)
│   ├── requirements.txt
│   └── start.sh                  # Start backend only
│
└── src/                          # Next.js 14 App Router frontend
    ├── middleware.ts              # Route protection
    ├── app/
    │   ├── login/                # Google login page
    │   ├── scan/                 # Input form (height, weight, image)
    │   ├── dashboard/            # 3D model + metrics overview
    │   ├── insights/             # Nutrition & exercise plans
    │   └── analytics/            # ML engine + organ risk
    ├── components/
    │   ├── 3d/                   # Three.js / R3F components
    │   │   ├── BodyModel3D.tsx
    │   │   └── BodyViewer.tsx
    │   └── ui/                   # UI components
    │       └── Nav.tsx
    ├── context/
    │   ├── AuthProvider.tsx
    │   └── ScanContext.tsx
    └── lib/
        ├── auth.ts               # NextAuth config
        ├── backendApi.ts         # FastAPI client
        └── metrics.ts            # Body metric calculations
```

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/Girisankarsm/Body-analyzer.git
cd Body-analyzer
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
# Edit .env.local and fill in your Google OAuth credentials and NEXTAUTH_SECRET
```

### 3. Set up Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable Google+ API
3. OAuth 2.0 Credentials → Authorized redirect URIs:
   ```
   http://localhost:3001/api/auth/callback/google
   ```
4. Copy Client ID and Secret into `.env.local`

### 4. Start everything

```bash
bash run.sh
```

This single command will:
- Create a Python virtual environment
- Install all Python dependencies
- Train the ML model (first run only, ~5 seconds)
- Start the FastAPI backend on `http://localhost:8000`
- Install Node.js dependencies
- Start the Next.js frontend on `http://localhost:3001`

---

## Running Services Separately

**Backend only:**
```bash
cd backend
bash start.sh
```

**Frontend only:**
```bash
npm install
npm run dev
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React, TypeScript, TailwindCSS |
| 3D Rendering | React Three Fiber, Three.js, Drei |
| Charts | Recharts |
| Animations | Framer Motion |
| Auth | NextAuth.js v4, Google OAuth |
| Backend | FastAPI, Python |
| ML | scikit-learn MLPRegressor, OpenCV |
| State | React Context + localStorage |

---

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_URL` | App URL (default: `http://localhost:3001`) |
| `NEXTAUTH_SECRET` | Random secret — run `openssl rand -base64 32` |
| `NEXT_PUBLIC_BACKEND_URL` | ML backend URL (default: `http://localhost:8000`) |
