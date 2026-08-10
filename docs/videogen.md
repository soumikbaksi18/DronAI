Yes. The previous service can be rewritten almost one-to-one for **Sora 2**, but the API flow is different: instead of `google.genai` + `generate_videos()` + polling an operation, Sora uses `POST /v1/videos`, returns a video job ID, and you poll `GET /v1/videos/{video_id}` until it is completed, then download `/v1/videos/{video_id}/content`. Sora 2 supports text and image inputs and synced audio. ([OpenAI Platform][1])

Your original architecture—automatic **portrait historical character vs. cinematic scene**, optional historical reference image, async jobs—is still exactly the right abstraction. 

## Sora 2 version

### Architecture

```text
                    POST /generate
                          │
                          ▼
                 ┌──────────────────┐
                 │   Prompt Router  │
                 │                  │
                 │ portrait / scene │
                 └────────┬─────────┘
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
       HISTORICAL PORTRAIT       CINEMATIC SCENE
          720x1280                  1280x720
             │                         │
             │                         │
             └───────────┬─────────────┘
                         ▼
                      Sora 2
                         │
                    video job
                         │
                         ▼
                   /jobs/{id}
                         │
                         ▼
                      MP4
```

Sora 2's standard output sizes are currently `720x1280` for portrait and `1280x720` for landscape; the API supports 4, 8, or 12-second clips. ([OpenAI Platform][1])

---

# 1. Project

```text
sora-video-service/
├── app.py
├── requirements.txt
├── .env
├── outputs/
└── uploads/
```

### `requirements.txt`

```txt
fastapi
uvicorn[standard]
python-multipart
openai
python-dotenv
```

---

# 2. `.env`

```env
OPENAI_API_KEY=your_openai_api_key
```

The OpenAI SDK automatically reads `OPENAI_API_KEY`, but loading it explicitly with `python-dotenv` is convenient for local development. OpenAI's current quickstart also recommends storing the API key as an environment variable. ([OpenAI Platform][2])

---

# 3. `app.py`

```python
import os
import time
import uuid
import threading
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")

if not API_KEY:
    raise RuntimeError("OPENAI_API_KEY is not set")

client = OpenAI(api_key=API_KEY)

MODEL = "sora-2"

OUTPUT_DIR = Path("outputs")
UPLOAD_DIR = Path("uploads")

OUTPUT_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(
    title="Sora 2 Historical Video Generator",
    version="1.0.0",
)

jobs = {}


# ---------------------------------------------------------
# Prompt routing
# ---------------------------------------------------------

PORTRAIT_WORDS = [
    "portrait",
    "historical figure",
    "historical character",
    "person",
    "speaks",
    "speaking",
    "talking",
    "says",
    "say",
    "dialogue",
    "monologue",
    "interview",
    "addresses the camera",
    "looks into camera",
    "talking head",
    "facial expression",
    "lip sync",
    "lipsync",
]

SCENE_WORDS = [
    "battle",
    "war",
    "crowd",
    "army",
    "soldiers",
    "street",
    "market",
    "city",
    "explosion",
    "landscape",
    "ship",
    "building",
    "meeting",
    "march",
    "festival",
    "scene",
    "cinematic",
]


def detect_mode(prompt: str) -> str:
    text = prompt.lower()

    portrait_score = sum(
        1 for word in PORTRAIT_WORDS
        if word in text
    )

    scene_score = sum(
        1 for word in SCENE_WORDS
        if word in text
    )

    if portrait_score >= scene_score:
        return "portrait"

    return "scene"


# ---------------------------------------------------------
# Prompt enhancement
# ---------------------------------------------------------

def build_prompt(prompt: str, mode: str) -> str:

    if mode == "portrait":

        return f"""
Create a photorealistic historical documentary portrait.

SUBJECT:
{prompt}

FRAMING:
Vertical portrait composition.
Medium close-up / chest-up framing.
Eye-level camera.
Keep the face clearly visible and centered.

CHARACTER:
Historically accurate clothing, hairstyle and environment.
Preserve the visual identity and facial structure of the
reference subject when an image reference is provided.

PERFORMANCE:
Natural blinking.
Natural breathing.
Subtle eye movement.
Subtle eyebrow movement.
Small realistic head movements.
Natural facial expressions.
Maintain strong facial consistency throughout the clip.

DIALOGUE:
If the prompt contains dialogue, the subject speaks the
specified words naturally while looking toward the camera.
The mouth movements should correspond naturally to the speech.
Use realistic pauses and facial expressions appropriate
to the meaning of the dialogue.

AUDIO:
Generate synchronized spoken dialogue when dialogue is provided.
Include subtle environmental ambience.

CAMERA:
Stable documentary camera.
Very subtle natural camera movement.
No sudden camera changes.

VISUAL STYLE:
Photorealistic historical documentary.
Period-accurate lighting.
Natural skin texture.
Subtle film grain.
No modern objects.
No subtitles.
No captions.
No text overlays.

USER REQUEST:
{prompt}
"""

    return f"""
Create a photorealistic cinematic historical scene.

SCENE:
{prompt}

COMPOSITION:
Landscape 16:9 composition.
Establish the environment clearly.
Then follow the primary action.

CAMERA:
Cinematic camera movement appropriate to the scene.
Natural depth of field.
Realistic perspective.
Smooth movement.

HISTORICAL ACCURACY:
Use period-appropriate:
- architecture
- clothing
- vehicles
- props
- technology
- environment

Do not introduce modern objects.

ACTION:
Clearly show the primary action described in the request.
Characters move naturally.
Background characters behave naturally.
Maintain temporal consistency between frames.

LIGHTING:
Natural cinematic lighting appropriate to the period
and environment.

AUDIO:
Generate realistic environmental sound.
Include dialogue only if explicitly requested.

VISUAL STYLE:
Photorealistic historical documentary.
Subtle film grain.
Natural colors.
Realistic motion.
No subtitles.
No captions.
No text overlays.

USER REQUEST:
{prompt}
"""


# ---------------------------------------------------------
# Sora generation
# ---------------------------------------------------------

def generate_video(
    job_id: str,
    prompt: str,
    mode: str,
    reference_image: str | None = None,
    seconds: str = "8",
):

    try:

        enhanced_prompt = build_prompt(prompt, mode)

        size = (
            "720x1280"
            if mode == "portrait"
            else "1280x720"
        )

        jobs[job_id]["status"] = "generating"
        jobs[job_id]["message"] = "Submitting video to Sora 2..."

        # -------------------------------------------------
        # Create Sora video job
        # -------------------------------------------------

        kwargs = {
            "model": MODEL,
            "prompt": enhanced_prompt,
            "size": size,
            "seconds": seconds,
        }

        # Optional reference image
        if reference_image:

            with open(reference_image, "rb") as f:

                video = client.videos.create(
                    **kwargs,
                    input_reference=f,
                )

        else:

            video = client.videos.create(
                **kwargs
            )

        sora_id = video.id

        jobs[job_id]["sora_video_id"] = sora_id
        jobs[job_id]["message"] = "Sora 2 is generating the video..."

        # -------------------------------------------------
        # Poll Sora
        # -------------------------------------------------

        while True:

            video = client.videos.retrieve(sora_id)

            jobs[job_id]["progress"] = getattr(
                video,
                "progress",
                0,
            )

            jobs[job_id]["status"] = video.status

            if video.status == "completed":
                break

            if video.status == "failed":
                error = getattr(video, "error", None)

                raise RuntimeError(
                    str(error)
                    if error
                    else "Sora video generation failed"
                )

            time.sleep(10)

        # -------------------------------------------------
        # Download MP4
        # -------------------------------------------------

        jobs[job_id]["message"] = "Downloading generated video..."

        response = client.videos.download_content(
            sora_id
        )

        output_path = OUTPUT_DIR / f"{job_id}.mp4"

        with open(output_path, "wb") as f:
            f.write(response.read())

        jobs[job_id].update({
            "status": "completed",
            "progress": 100,
            "video": f"/video/{job_id}",
            "message": "Video generated successfully",
        })

    except Exception as e:

        jobs[job_id].update({
            "status": "failed",
            "error": str(e),
        })


# ---------------------------------------------------------
# API
# ---------------------------------------------------------

@app.get("/")
def root():

    return {
        "service": "Sora 2 Historical Video Generator",
        "model": MODEL,
        "endpoints": {
            "generate": "POST /generate",
            "status": "GET /jobs/{job_id}",
            "video": "GET /video/{job_id}",
        },
    }


@app.post("/generate")
async def generate(
    prompt: str = Form(...),
    mode: str = Form("auto"),
    seconds: str = Form("8"),
    reference_image: UploadFile | None = File(None),
):

    if not prompt.strip():

        raise HTTPException(
            status_code=400,
            detail="Prompt cannot be empty",
        )

    if mode not in [
        "auto",
        "portrait",
        "scene",
    ]:

        raise HTTPException(
            status_code=400,
            detail="mode must be auto, portrait or scene",
        )

    if seconds not in [
        "4",
        "8",
        "12",
    ]:

        raise HTTPException(
            status_code=400,
            detail="seconds must be 4, 8 or 12",
        )

    if mode == "auto":
        mode = detect_mode(prompt)

    job_id = str(uuid.uuid4())

    image_path = None

    # -----------------------------------------------------
    # Save reference image
    # -----------------------------------------------------

    if reference_image:

        extension = Path(
            reference_image.filename or ""
        ).suffix.lower()

        if extension not in [
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
        ]:

            raise HTTPException(
                status_code=400,
                detail="Only JPG, PNG and WEBP images are supported",
            )

        image_path = (
            UPLOAD_DIR /
            f"{job_id}{extension}"
        )

        with open(image_path, "wb") as f:
            f.write(
                await reference_image.read()
            )

    # -----------------------------------------------------
    # Job
    # -----------------------------------------------------

    jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "mode": mode,
        "prompt": prompt,
        "seconds": seconds,
        "video": None,
        "progress": 0,
        "message": "Queued",
    }

    # -----------------------------------------------------
    # Background generation
    # -----------------------------------------------------

    thread = threading.Thread(
        target=generate_video,
        args=(
            job_id,
            prompt,
            mode,
            str(image_path)
            if image_path
            else None,
            seconds,
        ),
        daemon=True,
    )

    thread.start()

    return {
        "job_id": job_id,
        "status": "queued",
        "mode": mode,
        "seconds": seconds,
        "status_url": f"/jobs/{job_id}",
    }


@app.get("/jobs/{job_id}")
def job_status(job_id: str):

    job = jobs.get(job_id)

    if not job:

        raise HTTPException(
            status_code=404,
            detail="Job not found",
        )

    return job


@app.get("/video/{job_id}")
def get_video(job_id: str):

    path = OUTPUT_DIR / f"{job_id}.mp4"

    if not path.exists():

        raise HTTPException(
            status_code=404,
            detail="Video is not ready",
        )

    return FileResponse(
        path,
        media_type="video/mp4",
        filename=f"{job_id}.mp4",
    )
```

The Sora API's actual flow is `videos.create()` → retrieve the job until `completed` → `videos.download_content()`. The official API also supports an optional `input_reference` image on video creation. ([OpenAI Platform][1])

---

# 4. Run

```bash
pip install -r requirements.txt

uvicorn app:app --host 0.0.0.0 --port 8000
```

Then:

```text
http://localhost:8000/docs
```

---

# 5. Historical character

For your exact use case, something like:

```bash
curl -X POST http://localhost:8000/generate \
  -F 'prompt=A historical military leader looks directly into the camera. He appears stern and thoughtful and says: "The situation has changed. We must act immediately."' \
  -F 'mode=portrait' \
  -F 'seconds=8'
```

The service turns that into a Sora prompt with:

```text
720x1280
       │
       ▼
medium close-up
       │
       ▼
historical clothing
       │
       ▼
facial expressions
       │
       ▼
blinking + head movement
       │
       ▼
spoken dialogue
       │
       ▼
synchronized audio
```

Sora 2 is specifically described by OpenAI as a video model with **synced audio**, so this is a much better fit for the "historical person talks to camera" portion than treating video and audio as two independent generation stages. ([OpenAI Developers][3])

---

# 6. Your uploaded historical image

This is the part I'd make central to the product.

```bash
curl -X POST http://localhost:8000/generate \
  -F 'prompt=The historical figure slowly turns toward the camera, looks directly at the viewer, becomes slightly more serious, and says: "History will judge what we do today."' \
  -F 'mode=portrait' \
  -F 'seconds=8' \
  -F 'reference_image=@historical_photo.png'
```

Sora 2 supports image input for video generation, so the photograph can act as the visual reference for the generated clip. ([OpenAI Platform][1])

For your image:

```text
                    historical photograph
                            │
                            ▼
                    input_reference
                            │
                            │
                  ┌─────────▼─────────┐
                  │      SORA 2       │
                  │                   │
                  │ facial movement   │
                  │ blinking          │
                  │ expressions       │
                  │ head movement     │
                  │ speech            │
                  │ synced audio      │
                  └─────────┬─────────┘
                            │
                            ▼
                         MP4
                      720 × 1280
```

**Important:** don't promise "perfect lip sync" in your API contract. The better product wording is **"synchronized dialogue and natural mouth movement."** Sora 2 is documented as generating synced audio, but that is not the same thing as guaranteeing deterministic phoneme-level lip-sync. ([OpenAI Developers][3])

---

# 7. Scene generation

For:

```text
A crowded railway station in Delhi in 1947.
Thousands of refugees arrive carrying luggage while steam trains
slowly enter the station. Children run alongside the train.
The camera tracks backwards through the crowd.
```

Simply:

```bash
curl -X POST http://localhost:8000/generate \
  -F 'prompt=A crowded railway station in Delhi in 1947. Thousands of refugees arrive carrying luggage while steam trains slowly enter the station. Children run alongside the train. The camera tracks backwards through the crowd.' \
  -F 'mode=scene' \
  -F 'seconds=8'
```

The service generates the landscape version:

```text
1280x720
   │
   ├── establishing shot
   ├── historical environment
   ├── crowd movement
   ├── steam train
   ├── camera tracking
   └── environmental audio
```

---

## 8. I'd actually make one change to the MVP

Don't expose only:

```text
prompt
mode
reference_image
```

Expose:

```json
{
  "prompt": "...",
  "mode": "auto",
  "duration": 8,
  "reference_image": "...",
  "camera": "auto",
  "dialogue": true,
  "style": "historical_documentary"
}
```

Then your internal router produces something like:

```json
{
  "type": "portrait",
  "historical": true,
  "aspect_ratio": "portrait",
  "reference_image": true,
  "dialogue": true,
  "camera": "medium_close_up",
  "emotion": "serious",
  "duration": 8
}
```

and **that** gets converted into the Sora prompt.

So the actual service becomes:

```text
                      USER
                       │
                       ▼
                POST /generate
                       │
                       ▼
              ┌─────────────────┐
              │  Prompt Router  │
              │                 │
              │ portrait/scene  │
              │ dialogue        │
              │ historical      │
              │ camera          │
              └────────┬────────┘
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
         PORTRAIT              SCENE
        720x1280              1280x720
             │                   │
             └─────────┬─────────┘
                       ▼
                    SORA 2
                       │
                ┌──────┴──────┐
                │             │
             text          image ref
                │             │
                └──────┬──────┘
                       ▼
                 async video job
                       │
                       ▼
                    MP4 + audio
```

And Sora 2 currently costs **$0.10/sec** for its standard portrait/landscape output, so an 8-second generation is approximately **$0.80**, while Sora 2 Pro is listed at $0.30/sec. ([OpenAI Developers][3])

This is essentially the same microservice you had for Veo, but with the **OpenAI video job API replacing the Google operation**, and Sora's `input_reference` replacing the Veo image input.

[1]: https://platform.openai.com/docs/api-reference/videos?lang=csharp&utm_source=chatgpt.com "Videos | OpenAI API Reference"
[2]: https://platform.openai.com/docs/quickstart/make-your-first-api-request?utm_source=chatgpt.com "Developer quickstart - OpenAI API"
[3]: https://developers.openai.com/api/docs/models/sora-2?utm_source=chatgpt.com "Sora 2 Model | OpenAI API"
