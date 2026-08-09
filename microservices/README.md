# GuruDroneAI GenAI Microservices

FastAPI service hosting agent stubs for:

- **Classroom Director** — MD parts → scenes (slides, visual prompts, narration) + live commands
- **Lesson Agent** — legacy whole-text path (delegates to Director)
- **Student Persona Crew** — simulates Fast / Struggling / Visual / Distracted learners

## Setup

```bash
cd microservices
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
| POST | `/v1/director/plan-scenes` | Director: MD parts → classroom scenes |
| POST | `/v1/generate/lesson` | Legacy whole-text generation |
| POST | `/v1/simulate/classroom` | Run persona simulation |
| POST | `/v1/classroom/command` | Handle teacher voice/text commands |

## Director contract

`POST /v1/director/plan-scenes` expects:

```json
{
  "title": "Chapter title",
  "language": "en",
  "subject": "History",
  "parts": [
    {
      "id": "part-01",
      "title": "1.1 Finding out about the past",
      "markdown": "# 1.1 ...\\n\\nBody..."
    }
  ]
}
```

Each scene includes `slide` (headline + bullets), `visual_prompt`, `narration`, and `questions`, grounded in a `part_id`.

## Notes

Current agents return deterministic scaffold responses so the monorepo runs without LLM keys. Replace `_build_scene_from_part` in `app/agents/director_agent.py` with real model / visual / TTS pipelines when ready.
