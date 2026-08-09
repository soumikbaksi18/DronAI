# Contributing to GuruDroneAI

Thanks for helping build GuruDroneAI. This scaffold is meant for parallel contribution across frontend, backend, and GenAI agents.

## Repo layout

```text
frontend/              Next.js UI
backend/               FastAPI orchestration API
genai-microservices/   FastAPI agent services (generate / simulate / director)
```

## Getting started

1. Fork / clone the repo
2. Copy per-service env files (no root `.env`):
   - `backend/.env.example` → `backend/.env`
   - `microservices/.env.example` → `microservices/.env`
   - `frontend/.env.example` → `frontend/.env.local`
3. Start services (see root `README.md`)
4. Pick an area to work on

## Suggested contribution lanes

| Area | Good first tasks |
|------|------------------|
| Frontend | Richer MD-part editor, scene/slide viewer, readiness report visuals, live classroom controls |
| Backend | Persist lessons in Postgres, better PDF cleanup, websocket for live class |
| GenAI / Director | Real LLM scene generation from MD parts, visuals, Sarvam narration, persona agents |

### Lesson intake → Director handoff

1. Backend `POST /v1/lessons/upload` extracts PDF/MD and splits into `uploads/<lesson_id>/parts/*.md`
2. Backend `POST /v1/lessons/{id}/generate` plans scenes in-backend from MD parts + teacher video length (OpenAI/Sarvam)
3. GenAI microservice is used for simulation / live classroom / speech — not for PDF→scenes

## Local workflow

- Keep changes focused — prefer one concern per PR
- Match existing folder conventions (`api/`, `agents/`, `models/`, `services/`)
- Stub-friendly: the GenAI layer should keep working offline with deterministic fallbacks when keys are missing
- Update the relevant package/service README if you add routes or env vars

## API contract (scaffold)

Frontend → Backend (`:8000`) → GenAI (`:8001`)

Core loop endpoints:

1. `POST /v1/lessons`
2. `POST /v1/lessons/{id}/generate`
3. `POST /v1/classroom/simulate`
4. `POST /v1/classroom/command`

## Code style

- **Python**: FastAPI + Pydantic v2, type hints, small routers
- **TypeScript**: Next.js App Router, keep API calls in `src/lib/api.ts`

## Before you open a PR

- [ ] Services still boot (`backend`, `genai-microservices`, `frontend`)
- [ ] New env vars documented in the relevant `*/.env.example`
- [ ] No secrets committed
