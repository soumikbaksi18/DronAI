"""Extract plain text from uploaded lesson sources (PDF / Markdown / text).

PDFs prefer Sarvam Document AI (Vision digitise → Markdown), then fall back to pypdf.
"""

from __future__ import annotations

import logging
import re
from io import BytesIO

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".md", ".markdown", ".txt"}


def normalize_extension(filename: str) -> str:
    name = filename.lower().rsplit(".", 1)
    if len(name) != 2:
        return ""
    return f".{name[1]}"


async def extract_text(
    filename: str,
    data: bytes,
    *,
    language: str = "en",
) -> tuple[str, str]:
    """Return (text, extractor_name). extractor_name is sarvam-doc-ai | pypdf | plaintext."""
    ext = normalize_extension(filename)
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type '{ext or 'unknown'}'. Use PDF, Markdown, or TXT.")

    if ext == ".pdf":
        return await _extract_pdf(data, filename=filename, language=language)
    return _clean_text(data.decode("utf-8", errors="replace")), "plaintext"


async def _extract_pdf(data: bytes, *, filename: str, language: str) -> tuple[str, str]:
    settings = get_settings()
    if settings.has_sarvam and settings.use_sarvam_document_ai:
        try:
            from app.services.sarvam_docs import digitise_pdf_to_markdown

            markdown = await digitise_pdf_to_markdown(data, filename, language=language)
            return _clean_pdf_text(markdown), "sarvam-doc-ai"
        except Exception as exc:  # noqa: BLE001
            logger.warning("Sarvam Document AI failed; falling back to pypdf: %s", exc)

    return _extract_pdf_pypdf(data), "pypdf"


def _extract_pdf_pypdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("pypdf is required for PDF extraction. pip install pypdf") from exc

    reader = PdfReader(BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)
    return _clean_pdf_text("\n\n".join(pages))


def _clean_pdf_text(text: str) -> str:
    """Light cleanup for NCERT-style textbook PDF extraction noise."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # Join hyphenated line breaks: "indepen-\ndence" → "independence"
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    # Collapse single newlines inside paragraphs, keep blank lines
    text = re.sub(r"(?<!\n)\n(?!\n)", " ", text)
    # Fix extractors that emit spaced characters: "T h e  F r e n c h" → "The French"
    text = _collapse_spaced_characters(text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return _clean_text(text)


def _collapse_spaced_characters(text: str) -> str:
    """Collapse runs of single-character tokens common in some PDF extractions."""

    def collapse_segment(segment: str) -> str:
        tokens = segment.split(" ")
        if len(tokens) < 2:
            return segment
        singles = sum(1 for token in tokens if len(token) == 1 and token.isalnum())
        if singles < 2 or singles / len(tokens) < 0.6:
            return segment

        words: list[str] = []
        buffer: list[str] = []
        for token in tokens:
            if len(token) == 1 and token.isalnum():
                buffer.append(token)
                continue
            if buffer:
                words.append("".join(buffer))
                buffer = []
            words.append(token)
        if buffer:
            words.append("".join(buffer))
        return " ".join(words)

    lines: list[str] = []
    for line in text.split("\n"):
        parts = re.split(r"( {2,})", line)
        rebuilt: list[str] = []
        for part in parts:
            if re.fullmatch(r" {2,}", part or ""):
                rebuilt.append(" ")
            else:
                rebuilt.append(collapse_segment(part))
        lines.append("".join(rebuilt))
    return "\n".join(lines)


def _clean_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = text.strip()
    if not text:
        raise ValueError("No readable text found in the uploaded file.")
    return text
