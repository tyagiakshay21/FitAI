# FitAI — AI Personal Fitness Trainer

A full-stack fitness app: personalised workout plans, Indian-friendly nutrition/meal planning, real-time
AI form/posture analysis via computer vision, progress tracking with ML forecasts, and an AI chat coach.

## Architecture

| Service       | Stack                                      | Port |
|---------------|---------------------------------------------|------|
| `frontend`    | React + Vite + TypeScript + Tailwind        | 5173 |
| `backend`     | Node.js + Express + TypeScript + Prisma     | 4000 |
| `ml-service`  | Python + FastAPI + scikit-learn             | 8002 |
| `cv-service`  | Python + FastAPI + MediaPipe/OpenCV         | 8001 |
| `postgres`    | PostgreSQL 16                               | 5432 |

The backend is the single source of truth for business logic (workout/diet generation, safety rules,
auth). `ml-service` and `cv-service` are stateless model-serving services the backend calls internally;
the frontend talks to the backend and, for the live camera feature, directly to `cv-service` over a
WebSocket (needs a low-latency path per frame).

## Quick start (Docker Compose)

```bash
cp backend/.env.example .env   # then edit JWT secrets, GEMINI_API_KEY, etc. and re-export as needed
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:4000/api/health
- Seeded admin login: `admin@fitai.local` / `Admin@12345` (or `SEED_ADMIN_PASSWORD`)

`docker-entrypoint.sh` in the backend runs migrations (or `prisma db push` on first run), seeds ~70
exercises and ~55 Indian-inclusive foods, then starts the API.

### Required environment variables

Set these before `docker compose up` (a `.env` file in the repo root is picked up automatically by Compose):

- `DATABASE_URL` — PostgreSQL connection string for the backend. For Supabase, use the project connection
  string and replace `[YOUR-PASSWORD]` with the database password in your local, untracked `.env` file.
  Keep the local Postgres URL below as the default when using the included Compose database.

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — long random strings; **must match** between `backend` and
  `cv-service` (the CV websocket verifies the same access token).
- `CLIENT_URL` — the frontend's origin, used for CORS on both `backend` and `cv-service`.
- `VITE_API_URL`, `VITE_CV_WS_URL` — where the frontend finds the backend and CV websocket (build args).
- `GEMINI_API_KEY` (optional) — enables Gemini coaching notes, the chatbot's free-form replies, and food-
  photo recognition. Every AI feature has a deterministic rule-based fallback when this is unset, **except**
  food-photo recognition, which requires it.
- `GEMINI_MODEL` (optional) — Gemini model ID; defaults to `gemini-3.8-flash`.
- `ANTHROPIC_API_KEY` (optional) — used as a secondary provider when Gemini is not configured.

See `backend/.env.example`, `frontend/.env.example` for the full list.

## Running locally without Docker

Install dependencies once, configure `backend/.env` and `frontend/.env` from their `.env.example` files,
then start all four local services from this project root with:

```bash
npm run dev
```

This starts the frontend (`http://127.0.0.1:5173`), backend (`http://127.0.0.1:4000`), computer-vision
camera service (`http://localhost:8001`) and ML service (`http://localhost:8002`). Keep this terminal open
while using the app; press Ctrl+C to stop all services. The backend database configured in `backend/.env`
must be reachable for sign-in, saved chat history and other account features.

The backend reads `GEMINI_API_KEY` from `backend/.env` for Gemini-powered chat and AI features. The key
is local configuration and should not be committed or included in a ZIP.

```bash
# 1. Postgres (or point DATABASE_URL at any Postgres instance)
docker run -d -p 5432:5432 -e POSTGRES_USER=fitai -e POSTGRES_PASSWORD=fitai -e POSTGRES_DB=fitai postgres:16-alpine

# 2. Backend
cd backend && cp .env.example .env   # edit DATABASE_URL etc.
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npm run dev

# 3. ML service
cd ml-service && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002

# 4. CV service
cd cv-service && python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
JWT_ACCESS_SECRET=<same as backend> uvicorn app.main:app --reload --port 8001

# 5. Frontend
cd frontend && cp .env.example .env
npm install
npm run dev
```

## Tests

- Backend: `cd backend && npx vitest run` (13 tests: nutrition math, workout generation safety, diet
  filtering safety — all pure-function tests with the DB mocked).
- ML service: `cd ml-service && MODEL_DIR=/tmp/mlmodels python -m pytest -q` (10 tests: forecasting,
  adherence prediction, progression logic, accessory recommendations, correlations, HTTP smoke test).
- CV service: `cd cv-service && python -m pytest -q` (13 tests: rep counting, depth/tempo/form-fault
  detection, camera-angle-aware limb-alignment checks, all against synthetic skeletons built from known
  joint angles — no real video needed).

## Safety notes baked into the product

- Workout generation always excludes exercises that stress a joint tied to a reported injury; this is
  enforced in rule-based code, not left to the LLM.
- Diet planning always filters by diet type and allergens (including common free-text synonyms) before any
  food is chosen; the LLM only writes tips, never picks foods.
- Every AI/ML response includes a disclaimer that it is not medical advice / not a guaranteed prediction.
- Form-analysis feedback that depends on a camera angle (e.g. knee-valgus, which needs a frontal view) is
  omitted rather than guessed when the current camera angle can't measure it.
- Progress photos are stored under an authenticated static route, never publicly served.

## Known limitations

- No live Postgres instance is available in the build sandbox, so the backend has been typechecked and
  unit-tested with the DB mocked, but not run end-to-end against a real database here. `docker compose up`
  is the first true end-to-end run.
- The adherence-prediction model's cold-start prior is trained on synthetic behavioural data; it blends
  toward the user's own history once they have ≥8 logged sessions.
