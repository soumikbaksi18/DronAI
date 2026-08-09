"""Sarvam Document AI (Vision) — digitise PDFs into Markdown.

Uses POST /doc-ai/v1/job/digitise (Sarvam Vision 1.5).
Max 10 pages per job; longer PDFs are split into batches.
"""

from __future__ import annotations

import asyncio
import io
import logging
import zipfile
from typing import Any

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

LANGUAGE_MAP = {
    "en": "en-IN",
    "en-in": "en-IN",
    "english": "en-IN",
    "hi": "hi-IN",
    "hi-in": "hi-IN",
    "hindi": "hi-IN",
    "bn": "bn-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "pa": "pa-IN",
    "od": "od-IN",
}

MAX_PAGES_PER_JOB = 10
POLL_SECONDS = 4
MAX_POLL_ATTEMPTS = 90  # ~6 minutes


class SarvamDocError(RuntimeError):
    pass


def to_language(code: str | None) -> str:
    if not code:
        return "en-IN"
    return LANGUAGE_MAP.get(code.strip().lower(), code if "-" in code else "en-IN")


def _auth_headers() -> dict[str, str]:
    settings = get_settings()
    key = (settings.sarvam_api_key or "").strip()
    if not key:
        raise SarvamDocError("SARVAM_API_KEY is not configured")
    return {"api-subscription-key": key}


def _split_pdf_batches(data: bytes, max_pages: int = MAX_PAGES_PER_JOB) -> list[bytes]:
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError as exc:  # pragma: no cover
        raise SarvamDocError("pypdf is required to batch long PDFs") from exc

    reader = PdfReader(io.BytesIO(data))
    page_count = len(reader.pages)
    if page_count == 0:
        raise SarvamDocError("PDF has no pages")
    if page_count <= max_pages:
        return [data]

    batches: list[bytes] = []
    for start in range(0, page_count, max_pages):
        writer = PdfWriter()
        for index in range(start, min(start + max_pages, page_count)):
            writer.add_page(reader.pages[index])
        buffer = io.BytesIO()
        writer.write(buffer)
        batches.append(buffer.getvalue())
    return batches


def _markdown_from_zip(zip_bytes: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        md_names = sorted(
            name
            for name in archive.namelist()
            if name.lower().endswith(".md") and not name.startswith("__MACOSX")
        )
        if md_names:
            chunks = [archive.read(name).decode("utf-8", errors="replace") for name in md_names]
            return "\n\n".join(chunk.strip() for chunk in chunks if chunk.strip())

        # Fallback: concatenate text-ish files
        text_names = [
            name
            for name in archive.namelist()
            if name.lower().endswith((".txt", ".html", ".json"))
            and "manifest" not in name.lower()
            and not name.startswith("__MACOSX")
        ]
        chunks = []
        for name in sorted(text_names):
            raw = archive.read(name).decode("utf-8", errors="replace").strip()
            if raw:
                chunks.append(raw)
        if chunks:
            return "\n\n".join(chunks)

    raise SarvamDocError("Digitise ZIP did not contain Markdown/text output")


async def digitise_pdf_to_markdown(
    data: bytes,
    filename: str,
    *,
    language: str = "en",
) -> str:
    """Digitise a PDF with Sarvam Vision Document AI and return Markdown text."""
    settings = get_settings()
    if not settings.has_sarvam:
        raise SarvamDocError("SARVAM_API_KEY is not configured")

    batches = _split_pdf_batches(data)
    markdown_parts: list[str] = []
    for index, batch in enumerate(batches, start=1):
        batch_name = filename if len(batches) == 1 else f"part-{index:02d}-{filename}"
        logger.info("Sarvam digitise batch %s/%s (%s)", index, len(batches), batch_name)
        markdown_parts.append(
            await _digitise_single_pdf(batch, batch_name, language=language)
        )

    merged = "\n\n".join(part.strip() for part in markdown_parts if part.strip()).strip()
    if not merged:
        raise SarvamDocError("Sarvam Document AI returned empty Markdown")
    return merged


async def _digitise_single_pdf(data: bytes, filename: str, *, language: str) -> str:
    settings = get_settings()
    base = settings.sarvam_base_url.rstrip("/")
    headers = _auth_headers()

    async with httpx.AsyncClient(timeout=120.0) as client:
        create = await client.post(
            f"{base}/doc-ai/v1/job/digitise",
            headers=headers,
            files={"file": (filename, data, "application/pdf")},
            data={
                "language": to_language(language),
                "output_format": "md",
            },
        )
        if create.status_code >= 400:
            raise SarvamDocError(
                f"Sarvam digitise create failed ({create.status_code}): {create.text}"
            )
        job: dict[str, Any] = create.json()
        job_id = job.get("job_id")
        if not job_id:
            raise SarvamDocError(f"Sarvam digitise response missing job_id: {job}")

        terminal = {"completed", "partially_completed", "failed", "rejected"}
        status_payload: dict[str, Any] = {}
        for _ in range(MAX_POLL_ATTEMPTS):
            status_resp = await client.get(
                f"{base}/doc-ai/v1/job/{job_id}/status",
                headers=headers,
            )
            if status_resp.status_code >= 400:
                raise SarvamDocError(
                    f"Sarvam digitise status failed ({status_resp.status_code}): {status_resp.text}"
                )
            status_payload = status_resp.json()
            state = str(
                status_payload.get("status")
                or status_payload.get("job_state")
                or ""
            ).lower()
            if state in terminal:
                break
            await asyncio.sleep(POLL_SECONDS)
        else:
            raise SarvamDocError(f"Sarvam digitise timed out for job {job_id}")

        state = str(
            status_payload.get("status") or status_payload.get("job_state") or ""
        ).lower()
        if state not in {"completed", "partially_completed"}:
            raise SarvamDocError(
                f"Sarvam digitise ended with status={state}: {status_payload}"
            )

        download_resp = await client.get(
            f"{base}/doc-ai/v1/job/{job_id}/download-url",
            headers=headers,
        )
        if download_resp.status_code >= 400:
            raise SarvamDocError(
                f"Sarvam digitise download-url failed ({download_resp.status_code}): {download_resp.text}"
            )
        download_payload = download_resp.json()
        url = download_payload.get("url")
        if not url and isinstance(download_payload.get("download_urls"), dict):
            # Legacy-shaped response fallback
            first = next(iter(download_payload["download_urls"].values()), None)
            if isinstance(first, dict):
                url = first.get("file_url")
        if not url:
            raise SarvamDocError(f"No download URL in response: {download_payload}")

        zip_resp = await client.get(url, timeout=120.0)
        if zip_resp.status_code >= 400:
            raise SarvamDocError(
                f"Failed downloading digitise ZIP ({zip_resp.status_code})"
            )
        return _markdown_from_zip(zip_resp.content)
