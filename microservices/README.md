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
cp .env.example .env   # keys live in microservices/.env only
uvicorn app.main:app --reload --port 8001
```

API docs: http://localhost:8001/docs

## Env (`microservices/.env`)

| Variable | Purpose |
|----------|---------|
| `SARVAM_API_KEY` | Sarvam subscription key (chat + Bulbul + Saaras) |
| `SARVAM_CHAT_MODEL` | default `sarvam-30b` |
| `SARVAM_TTS_MODEL` | default `bulbul:v3` |
| `SARVAM_STT_MODEL` | default `saaras:v3` |
| `OPENAI_API_KEY` | Optional LLM fallback for live classroom commands |

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
| POST | `/v1/video/generate` | Queue a job (form: `prompt`, `mode`, `seconds`, `character`, optional `reference_image`) |
| GET | `/v1/video/jobs/{id}` | Poll job status, stage, script and timing |
| GET | `/v1/video/characters` | Character keys for the `character` field |
| GET | `/v1/video/languages` | Language codes, Mayura coverage, models, styles |
| GET | `/v1/video/file/{id}` | Raw Sora clip (Sora's own audio) |
| GET | `/v1/video/audio/{id}` | Sarvam voice track (WAV) |
| GET | `/v1/video/final/{id}` | **Final MP4** — Sora video + Sarvam voice, aligned |
| GET | `/videogen.html` | Browser test page for the video pipeline (`/` redirects here) |

## Video generation

Config comes from `microservices/.env` like every other service here.
Every job calls **Sora 2** with `OPENAI_API_KEY` — $0.10/sec, so ~$0.80 for the
default 8s clip. `seconds` accepts `4`, `8` or `12`; portrait renders 720x1280,
scene 1280x720. There is no mock: a missing key or an API error fails the job
and the message lands in `/v1/video/jobs/{id}`, which also reports Sora's
`progress` 0–100. Open http://localhost:8001/ for the test page.

Sora generates synchronized dialogue and natural mouth movement — not
deterministic phoneme-level lip-sync. Don't promise the latter in the product.

### Script-synchronized character pipeline

Pass a `character` (see `/v1/video/characters`) and `prompt` becomes a *question*
the figure answers. Stages, reported as `stage` on the job:

```
script_generating -> script_ready -> [translation_pending -> translation_completed]
                  -> generating_audio -> measuring_timing
                  -> generating_video -> synchronizing -> completed
```

Pick a `language` (see `/v1/video/languages`, 23 codes) and the English script is
translated before TTS, so the **translated** line is what sets audio timing.
`translation_model` is `sarvam-translate` (all 23, faithful) or `mayura`
(conversational, 11 languages, honours `translation_style`). Only the spoken
lines go to the translator — pauses and performance cues never do, so pause
placement survives untouched. Both scripts are kept on the job: `script` is the
English source, `translated_script` is what was spoken.

Character profiles carry a `gender`, passed as Sarvam's `speaker_gender`.
Without it gendered languages inflect wrongly — Napoleon says "मैं ... लाई"
(feminine). Sarvam-translate honours it; mayura appears to ignore it.

The same generated dialogue drives both Sora (visual performance) and Sarvam
(the voice), so they cannot drift. Sora's own audio is discarded.

Two deliberate deviations from the PRD:

- **Audio is generated before video.** The measured voice duration is what picks
  Sora's 4/8/12s length; guessing first means paying for a clip the script
  doesn't fit. If the voice still overruns 12s, the script is tightened and
  re-voiced once (cents) rather than padding the video with a frozen frame.
- **Speaker `ratan` doesn't exist.** bulbul:v2 offers anushka, abhilash, manisha,
  vidya, arya, karun, hitesh — profiles in `app/services/characters.py` use those.

Alignment never touches the voice: the video is held on its last frame when it
is short, and cut when it is long. Requires **FFmpeg on PATH**.

When translating, Sora performs the **translated** script (plus an explicit
"speaks entirely in <language>" line), so the mouth forms the same language the
voice speaks instead of miming English over a dub.

**Pause re-timing.** Sora paces its own delivery, so scripted silences land in
the wrong places. After the clip exists, `ffmpeg silencedetect` finds where it
actually starts each line and the gaps between the already-voiced Sarvam clips
are re-spaced to match (`pause_alignment` on the job shows before/after). The
voice itself is never stretched and no TTS is re-billed — only the silence moves.
Alignment is skipped when the clip's audio has fewer speech runs than the script
has lines, since that would be guessing.

None of this is lip-sync. It reduces drift at line boundaries; matching mouth
shapes to phonemes needs a dedicated lip-sync stage, which the PRD rules out.

### Self-checks

No test framework — each module runs its own assertions:

```bash
python -m app.agents.script_agent   # script parsing, pauses, word budget
python -m app.services.tts          # pause timing in the rendered WAV (Sarvam stubbed)
python -m app.services.translate    # pause preservation, char-limit splitting, gender
python -m app.services.media        # both alignment directions through real FFmpeg
python -m app.services.videogen     # routing, image fitting, full pipeline (APIs stubbed)
```

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
