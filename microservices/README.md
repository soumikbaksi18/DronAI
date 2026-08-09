# GuruDroneAI GenAI Microservices

FastAPI service hosting agent stubs for:

- **Lesson Agent** — turns source text into scenes, narration, visuals prompts, quiz
- **Student Persona Crew** — simulates Fast / Struggling / Visual / Distracted learners
- **Classroom Director** — interprets live teacher commands

## Setup

```bash
cd genai-microservices
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

API docs: http://localhost:8001/docs

## Key routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health |
| POST | `/v1/generate/lesson` | Generate lesson scenes |
| POST | `/v1/simulate/classroom` | Run persona simulation |
| POST | `/v1/classroom/command` | Handle teacher voice/text commands |

## Notes

Current agents return deterministic scaffold responses so the monorepo runs without LLM keys. Replace agent internals with real model calls (OpenAI, Sarvam, etc.) when ready.
