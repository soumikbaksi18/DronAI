from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.sarvam_client import SarvamClient, SarvamError

router = APIRouter(prefix="/v1/speech", tags=["speech"])


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)
    language: str = "en"
    speaker: str | None = None


@router.post("/tts")
async def text_to_speech(payload: TTSRequest) -> dict:
    """Bulbul V3 text-to-speech via Sarvam."""
    settings = get_settings()
    if not settings.has_sarvam:
        raise HTTPException(
            status_code=503,
            detail="SARVAM_API_KEY is not configured. Add it to microservices/.env from https://dashboard.sarvam.ai",
        )
    try:
        result = await SarvamClient().text_to_speech(
            payload.text,
            language=payload.language,
            speaker=payload.speaker,
        )
    except SarvamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "provider": "sarvam",
        "model": settings.sarvam_tts_model,
        "language": payload.language,
        "result": result,
    }


@router.post("/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    mode: str = Form(default="transcribe"),
) -> dict:
    """Saaras V3 speech-to-text via Sarvam."""
    settings = get_settings()
    if not settings.has_sarvam:
        raise HTTPException(
            status_code=503,
            detail="SARVAM_API_KEY is not configured. Add it to microservices/.env from https://dashboard.sarvam.ai",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Audio file is empty")
    try:
        result = await SarvamClient().speech_to_text(
            data,
            file.filename or "audio.wav",
            language=language,
            mode=mode,
        )
    except SarvamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "provider": "sarvam",
        "model": settings.sarvam_stt_model,
        "result": result,
    }
