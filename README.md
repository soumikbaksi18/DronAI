# GuruDroneAI

AI co-teacher that turns lesson material into a multilingual, interactive classroom — then simulates it with AI student personas before teaching.

**Core loop:** Create → Simulate → Critique → Refine → Teach → Adapt

This monorepo is an initialization scaffold so contributors can run the full stack locally and start building the hackathon MVP.

## Architecture

```text
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  frontend   │────▶│     backend      │────▶│  genai-microservices │
│  Next.js    │     │  FastAPI (:8000) │     │   FastAPI (:8001)    │
│  (:3000)    │     │  orchestration   │     │  agents + GenAI      │
└─────────────┘     └──────────────────┘     └──────────────────────┘
```

| Package | Role |
|---------|------|
| `frontend/` | Teacher UI — landing + studio scaffold |
| `backend/` | Lesson CRUD, orchestration, GenAI client |
| `genai-microservices/` | Lesson generation, persona simulation, classroom director |

Product vision lives in [`Guru Drone AI Project.md`](./Guru%20Drone%20AI%20Project.md).

## Quick start (local)

### Prerequisites

- Node.js 20+
- Python 3.11+
- npm

### 1. Environment

```bash
cp .env.example .env
cp .env.example frontend/.env.local
```

### 2. GenAI microservice

```bash
cd genai-microservices
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### 3. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

- UI: http://localhost:3000
- Studio flow: http://localhost:3000/studio
- Backend docs: http://localhost:8000/docs
- GenAI docs: http://localhost:8001/docs

## Docker Compose (optional)

```bash
docker compose up --build
```

## Scaffold status

What works today (deterministic stubs — no API keys required):

- Create a lesson from markdown/text
- Generate scenes / narration / quiz prompts
- Simulate four student personas and get a readiness report
- Send a live classroom command (e.g. explain in Hindi)

What to build next (see MVP in the project doc):

- Real LLM generation + grounded content
- Sarvam speech (STT / TTS / multilingual)
- Persistent storage & PDF upload
- Live classroom presentation + adaptive moment
- Rich readiness report UI

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Pick a lane (frontend / backend / genai) and open focused PRs.
