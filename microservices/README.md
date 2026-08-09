# GuruDroneAI GenAI Microservices

FastAPI service hosting agents for:

- **Classroom Director** — MD parts → scenes (slides, visual prompts, narration) + live commands
- **Sarvam speech** — Bulbul V3 TTS + Saaras V3 STT
- **Lesson Agent** — legacy whole-text path (delegates to Director)
- **Student Persona Crew** — simulates Fast / Struggling / Visual / Distracted learners

## Setup

```bash
cd microservices
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# Put keys in repo-root .env (see ../.env.example)
uvicorn app.main:app --reload --port 8001
```

API docs: http://localhost:8001/docs

## Env

| Variable | Purpose |
|----------|---------|
| `SARVAM_API_KEY` | Sarvam subscription key (chat + Bulbul + Saaras) |
| `SARVAM_CHAT_MODEL` | default `sarvam-30b` |
| `SARVAM_TTS_MODEL` | default `bulbul:v3` |
| `SARVAM_STT_MODEL` | default `saaras:v3` |
| `OPENAI_API_KEY` | Optional LLM fallback for Director |

Provider preference: **Sarvam → OpenAI → heuristic stub**.

## Key routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Service health |
| GET | `/health/providers` | Which LLM/speech keys are loaded |
| POST | `/v1/director/plan-scenes` | Director: MD parts → classroom scenes |
| POST | `/v1/generate/lesson` | Legacy whole-text generation |
| POST | `/v1/simulate/classroom` | Run persona simulation |
| POST | `/v1/classroom/command` | Handle teacher voice/text commands |
| POST | `/v1/speech/tts` | Bulbul text-to-speech |
| POST | `/v1/speech/stt` | Saaras speech-to-text |

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
