# GuruDroneAI Backend

FastAPI service that owns lesson orchestration and talks to the GenAI microservice.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

## Key routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health |
| POST | `/v1/lessons` | Create from pasted Markdown/text + split MD parts |
| POST | `/v1/lessons/upload` | Upload PDF/MD/TXT → extract → split MD parts |
| GET | `/v1/lessons/{id}/parts` | List structured Markdown parts |
| POST | `/v1/lessons/{id}/parse` | Re-run chapter splitting |
| POST | `/v1/lessons/{id}/generate` | Classroom Director → scenes from MD parts |
| POST | `/v1/classroom/simulate` | Run student persona simulation |
| POST | `/v1/classroom/command` | Handle live teacher commands |

## Notes

- Lessons are stored in memory for this scaffold — swap `lesson_store` for a real DB later.
- Uploaded sources + MD parts are written under `uploads/<lesson_id>/`.
- Set `GENAI_SERVICE_URL` (default `http://localhost:8001`) so the Director/simulation can reach the GenAI service.
