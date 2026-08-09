"""Proxy Sarvam speech endpoints through the backend for the frontend."""

from typing import Any

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.config import get_settings

router = APIRouter(prefix="/v1/speech", tags=["speech"])


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)
    language: str = "en"
    speaker: str | None = None


@router.post("/tts")
async def text_to_speech(payload: TTSRequest) -> dict[str, Any]:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{settings.genai_service_url.rstrip('/')}/v1/speech/tts",
            json=payload.model_dump(),
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()


@router.post("/stt")
async def speech_to_text(
    file: UploadFile = File(...),
    language: str | None = Form(default=None),
    mode: str = Form(default="transcribe"),
) -> dict[str, Any]:
    settings = get_settings()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Audio file is empty")

    files = {"file": (file.filename or "audio.wav", data, file.content_type or "application/octet-stream")}
    form: dict[str, str] = {"mode": mode}
    if language:
        form["language"] = language

    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            f"{settings.genai_service_url.rstrip('/')}/v1/speech/stt",
            data=form,
            files=files,
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()
