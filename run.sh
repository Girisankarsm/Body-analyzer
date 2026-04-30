#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo -e "${BOLD}  BodyAnalyzer — Starting All Services${NC}"
echo -e "  ──────────────────────────────────────"
echo ""

# ── 1. Python backend ─────────────────────────────────────────────────────────
echo -e "${BLUE}[1/2]${NC} Starting ML Backend (FastAPI)..."

cd "$ROOT/backend"

# Create venv if missing
if [ ! -d "venv" ]; then
  echo "      Creating Python virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate

# Install deps if needed
if ! python -c "import fastapi, cv2, sklearn" 2>/dev/null; then
  echo "      Installing Python dependencies..."
  pip install -q -r requirements.txt
fi

# Train model if missing
if [ ! -f "model/bf_model.pkl" ]; then
  echo "      Training ML model (first run only, ~5s)..."
  python train_model.py --quiet 2>/dev/null || python train_model.py
fi

# Kill any existing process on port 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Start backend in background
python main.py > /tmp/bodyanalyzer_backend.log 2>&1 &
BACKEND_PID=$!

# Wait for it to be ready
for i in $(seq 1 20); do
  if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "      ${GREEN}✓${NC} ML Backend running at ${BOLD}http://localhost:8000${NC} (PID: $BACKEND_PID)"
    break
  fi
  sleep 0.5
done

# ── 2. Next.js frontend ───────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[2/2]${NC} Starting Frontend (Next.js)..."

cd "$ROOT"

# Install node_modules if missing
if [ ! -d "node_modules" ]; then
  echo "      Installing Node dependencies..."
  npm install --silent
fi

# Kill any existing process on port 3001 or 3000
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start Next.js on fixed port 3001
PORT=3001 npm run dev > /tmp/bodyanalyzer_frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for it to be ready
for i in $(seq 1 30); do
  if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo -e "      ${GREEN}✓${NC} Frontend running at ${BOLD}http://localhost:3001${NC} (PID: $FRONTEND_PID)"
    break
  fi
  sleep 0.8
done

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ──────────────────────────────────────"
echo -e "  ${GREEN}${BOLD}All services running!${NC}"
echo -e ""
  echo -e "  ${BOLD}App${NC}      →  http://localhost:3001"
echo -e "  ${BOLD}ML API${NC}   →  http://localhost:8000"
echo -e "  ${BOLD}API Docs${NC} →  http://localhost:8000/docs"
echo -e ""
echo -e "  Logs:  /tmp/bodyanalyzer_frontend.log"
echo -e "         /tmp/bodyanalyzer_backend.log"
echo -e ""
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop all services."
echo -e "  ──────────────────────────────────────"
echo ""

# ── Trap Ctrl+C to kill both ──────────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${YELLOW}  Stopping all services...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  lsof -ti:8000 | xargs kill -9 2>/dev/null || true
  lsof -ti:3001 | xargs kill -9 2>/dev/null || true
  echo -e "${GREEN}  Done. Goodbye!${NC}"
  echo ""
  exit 0
}

trap cleanup INT TERM

# Keep script alive
wait
