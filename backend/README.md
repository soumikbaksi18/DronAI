# GuruDroneAI Backend

FastAPI service that owns lesson orchestration and talks to the GenAI microservice.

## Setup

```bash
cd backend
cp .env.example .env   # keys live in backend/.env only
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

## PDF extraction

When `SARVAM_API_KEY` is set, uploads use **Sarvam Document AI** (`/doc-ai/v1/job/digitise`, Sarvam Vision) to turn PDFs into Markdown. Longer PDFs are split into ≤10-page batches. If Sarvam is unavailable, extraction falls back to `pypdf`.

## Scene planning (no GenAI microservice)

`POST /v1/lessons/{id}/generate` plans scenes **inside this backend**:

1. Teacher sets `scene_count` (e.g. 8)
2. Python packs MD parts into that many scene buckets
3. Sarvam 30B / OpenAI writes slide bullets, narration, visual prompt, questions
4. `POST /v1/lessons/{id}/approve-scenes` marks them ready for the later Video generation page

Live classroom commands may still use the GenAI service on `:8001`.

## Notes

- Lessons are stored in memory for this scaffold — swap `lesson_store` for a real DB later.
- Uploaded sources + MD parts are written under `uploads/<lesson_id>/`.
- Set `GENAI_SERVICE_URL` (default `http://localhost:8001`) so the Director/simulation can reach the GenAI service.
