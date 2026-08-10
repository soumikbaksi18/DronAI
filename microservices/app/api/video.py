from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.models.schemas import VideoJobResponse
from app.services import characters, translate, videogen

router = APIRouter(prefix="/v1/video", tags=["video"])

ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


@router.get("/characters")
async def list_characters() -> dict:
    """Character keys usable as the `character` form field."""
    return {key: profile["name"] for key, profile in characters.CHARACTERS.items()}


@router.get("/languages")
async def list_languages() -> dict:
    """Languages the character can speak, and which of them Mayura covers."""
    return {
        "languages": translate.LANGUAGES,
        "mayura_languages": sorted(translate.MAYURA_LANGUAGES),
        "models": sorted(translate.MODELS),
        "styles": list(translate.STYLES),
    }


@router.post("/generate", response_model=VideoJobResponse)
async def generate_video(
    background: BackgroundTasks,
    prompt: str = Form(...),
    mode: str = Form("auto"),
    seconds: str = Form("8"),
    character: str | None = Form(None),
    language: str = Form("en-IN"),
    translation_model: str | None = Form(None),
    translation_style: str | None = Form(None),
    reference_image: UploadFile | None = File(None),
) -> VideoJobResponse:
    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")
    if mode not in {"auto", "portrait", "scene"}:
        raise HTTPException(status_code=400, detail="mode must be auto, portrait or scene")
    if seconds != "auto" and seconds not in videogen.SECONDS_CHOICES:
        raise HTTPException(
            status_code=400,
            detail=f"seconds must be auto or one of {', '.join(videogen.SECONDS_CHOICES)}",
        )

    character = (character or "").strip() or None
    if character and character not in characters.CHARACTERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown character. Known: {', '.join(characters.CHARACTERS)}",
        )

    if language not in translate.LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language. Known: {', '.join(translate.LANGUAGES)}",
        )
    if language != translate.SOURCE_LANGUAGE and not character:
        raise HTTPException(
            status_code=400,
            detail="Translation only applies to character dialogue — pick a character",
        )
    if translation_style and translation_style not in translate.STYLES:
        raise HTTPException(
            status_code=400, detail=f"style must be one of {', '.join(translate.STYLES)}"
        )
    if (
        translate.resolve_model(translation_model) == translate.MODELS["mayura"]
        and language not in translate.MAYURA_LANGUAGES
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"{translate.LANGUAGES[language]} is not supported by mayura:v1 — "
                "use sarvam-translate for this language"
            ),
        )

    suffix, image_bytes = "", None
    if reference_image and reference_image.filename:
        suffix = Path(reference_image.filename).suffix.lower()
        if suffix not in ALLOWED_IMAGE_SUFFIXES:
            raise HTTPException(
                status_code=400, detail="Reference image must be JPG, PNG or WEBP"
            )
        image_bytes = await reference_image.read()

    if mode == "auto":
        if image_bytes:
            # the reference image is resized to the mode's output size, so its own
            # orientation decides — otherwise a portrait photo gets cropped to 16:9
            mode = videogen.image_mode(image_bytes)
        elif character:
            mode = "portrait"  # a character answering a question is a talking head
        else:
            mode = videogen.detect_mode(prompt)

    job = videogen.create_job(
        prompt, mode, seconds, character, language, translation_model, translation_style
    )

    image_path = None
    if image_bytes:
        image_path = videogen.UPLOAD_DIR / f"{job['id']}{suffix}"
        image_path.write_bytes(image_bytes)

    background.add_task(
        videogen.run_job,
        job["id"],
        prompt,
        mode,
        seconds,
        str(image_path) if image_path else None,
        character,
        language,
        translation_model,
        translation_style,
    )
    return VideoJobResponse(**job)


@router.get("/jobs/{job_id}", response_model=VideoJobResponse)
async def job_status(job_id: str) -> VideoJobResponse:
    job = videogen.jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return VideoJobResponse(**job)


def _serve(job_id: str, name: str, media_type: str, label: str) -> FileResponse:
    path = videogen.OUTPUT_DIR / name
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{label} is not ready")
    return FileResponse(path, media_type=media_type, filename=name)


@router.get("/file/{job_id}")
async def video_file(job_id: str) -> FileResponse:
    """Raw Sora clip, with Sora's own audio."""
    return _serve(job_id, f"{job_id}.mp4", "video/mp4", "Video")


@router.get("/audio/{job_id}")
async def audio_file(job_id: str) -> FileResponse:
    """Sarvam voice track — the authoritative audio."""
    return _serve(job_id, f"{job_id}.wav", "audio/wav", "Audio")


@router.get("/final/{job_id}")
async def final_file(job_id: str) -> FileResponse:
    """Sora video with the Sarvam voice muxed in and durations aligned."""
    return _serve(job_id, f"{job_id}-final.mp4", "video/mp4", "Final video")
