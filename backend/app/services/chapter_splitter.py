"""Split extracted textbook/chapter text into structured Markdown parts.

Designed for NCERT-style History chapters:
- Markdown headings (# / ## / ###)
- Numbered sections (1.1 Title, 2. Title)
- ALL-CAPS or Title-Case standalone section lines from PDF extraction
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.schemas import MdPart

MD_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
NUMBERED_SECTION_RE = re.compile(
    r"^((?:\d+\.)+\d*|\d+)\s+([A-Z][\w\s,'’\"\-\(\):;/&]+?)\s*$"
)
ALL_CAPS_HEADING_RE = re.compile(r"^[A-Z][A-Z0-9\s,'’\"\-\(\):;/&]{3,80}$")
TITLE_CASE_HEADING_RE = re.compile(
    r"^(?:[A-Z][a-z0-9’']+)(?:\s+(?:[A-Z][a-z0-9’']+|of|and|the|in|on|for|to|a|an)){1,10}$"
)

NOISE_LINE_RE = re.compile(
    r"^(page\s+\d+\s*$|\d+\s*$|ncert\s*$|ncert\s+textbook.*$|textbook\s*$|"
    r"rationale\s*$|exercises?\s*$|let'?s discuss\s*$)",
    re.IGNORECASE,
)


@dataclass
class _Section:
    title: str
    body_lines: list[str]


def split_into_md_parts(
    source_text: str,
    *,
    chapter_title: str | None = None,
    max_parts: int = 24,
    min_part_chars: int = 120,
) -> list[MdPart]:
    """Return ordered Markdown parts ready for the Classroom Director."""
    text = source_text.strip()
    if not text:
        raise ValueError("Cannot split empty source text.")

    sections = _split_by_structure(text)
    if len(sections) <= 1:
        sections = _split_by_length(text, target_chars=900)

    parts: list[MdPart] = []
    for index, section in enumerate(sections[:max_parts], start=1):
        title = _clean_title(section.title) or f"Part {index}"
        body = "\n".join(section.body_lines).strip()
        if not body and index < len(sections):
            continue

        markdown = _to_markdown(title, body, chapter_title=chapter_title)
        if len(markdown) < min_part_chars and parts:
            # Merge tiny trailing fragments into the previous part
            prev = parts[-1]
            merged_md = f"{prev.markdown.rstrip()}\n\n### {title}\n\n{body}".strip()
            parts[-1] = prev.model_copy(
                update={
                    "markdown": merged_md,
                    "char_count": len(merged_md),
                    "summary": _summarize(merged_md),
                }
            )
            continue

        slug = _slugify(title) or f"part-{index:02d}"
        filename = f"part-{index:02d}-{slug}.md"
        part_id = f"part-{index:02d}"
        parts.append(
            MdPart(
                id=part_id,
                index=index,
                title=title,
                markdown=markdown,
                filename=filename,
                char_count=len(markdown),
                summary=_summarize(body or title),
            )
        )

    if not parts:
        markdown = _to_markdown(chapter_title or "Lesson", text, chapter_title=chapter_title)
        parts.append(
            MdPart(
                id="part-01",
                index=1,
                title=chapter_title or "Lesson",
                markdown=markdown,
                filename="part-01-lesson.md",
                char_count=len(markdown),
                summary=_summarize(text),
            )
        )

    parts = _merge_undersized_forward(parts, min_part_chars=min_part_chars)

    # Re-index after merges
    reindexed: list[MdPart] = []
    for i, part in enumerate(parts, start=1):
        slug = _slugify(part.title) or f"part-{i:02d}"
        reindexed.append(
            part.model_copy(
                update={
                    "id": f"part-{i:02d}",
                    "index": i,
                    "filename": f"part-{i:02d}-{slug}.md",
                }
            )
        )
    return reindexed


def _merge_undersized_forward(parts: list[MdPart], *, min_part_chars: int) -> list[MdPart]:
    """Fold tiny preamble parts into the following section (common for chapter titles)."""
    if len(parts) < 2:
        return parts

    merged: list[MdPart] = []
    i = 0
    while i < len(parts):
        current = parts[i]
        if current.char_count < min_part_chars and i + 1 < len(parts):
            nxt = parts[i + 1]
            combined = (
                f"{current.markdown.rstrip()}\n\n---\n\n{nxt.markdown.lstrip()}"
            ).strip() + "\n"
            merged.append(
                nxt.model_copy(
                    update={
                        "title": nxt.title,
                        "markdown": combined,
                        "char_count": len(combined),
                        "summary": _summarize(combined),
                    }
                )
            )
            i += 2
            continue
        merged.append(current)
        i += 1
    return merged


def _split_by_structure(text: str) -> list[_Section]:
    lines = text.splitlines()
    sections: list[_Section] = []
    current = _Section(title="Introduction", body_lines=[])

    for raw in lines:
        line = raw.strip()
        if not line or NOISE_LINE_RE.match(line):
            if line and current.body_lines:
                current.body_lines.append("")
            continue

        heading = _detect_heading(line)
        if heading:
            has_content = bool("".join(current.body_lines).strip())
            # Keep the previous section when it has body text, or when we already
            # started real sections (avoids dropping a titled preamble on next H2).
            if has_content or (sections and current.title != "Introduction"):
                sections.append(current)
            elif current.title != "Introduction" and not sections:
                # Preserve chapter-title sections even if body is still empty;
                # body may only contain lines filtered as noise.
                sections.append(current)
            current = _Section(title=heading, body_lines=[])
            continue

        current.body_lines.append(line)

    if current.body_lines or not sections:
        sections.append(current)

    # Drop empty intro if we found real sections after it
    if (
        len(sections) > 1
        and sections[0].title == "Introduction"
        and len(" ".join(sections[0].body_lines)) < 40
    ):
        sections = sections[1:]

    return sections


def _detect_heading(line: str) -> str | None:
    md = MD_HEADING_RE.match(line)
    if md:
        return md.group(2).strip()

    numbered = NUMBERED_SECTION_RE.match(line)
    if numbered and len(line) <= 120:
        return f"{numbered.group(1)} {numbered.group(2)}".strip()

    # Short standalone headings common in PDF extraction
    if len(line) <= 80 and (ALL_CAPS_HEADING_RE.match(line) or TITLE_CASE_HEADING_RE.match(line)):
        # Avoid treating normal sentences as headings
        if line.endswith(".") or "," in line[:20]:
            return None
        return line.title() if line.isupper() else line

    return None


def _split_by_length(text: str, target_chars: int = 900) -> list[_Section]:
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not paragraphs:
        return [_Section(title="Lesson", body_lines=[text])]

    sections: list[_Section] = []
    buf: list[str] = []
    size = 0
    part_no = 1

    for para in paragraphs:
        if size + len(para) > target_chars and buf:
            title = _guess_title(buf[0], part_no)
            sections.append(_Section(title=title, body_lines=buf))
            part_no += 1
            buf = []
            size = 0
        buf.append(para)
        size += len(para)

    if buf:
        sections.append(_Section(title=_guess_title(buf[0], part_no), body_lines=buf))
    return sections


def _guess_title(first_para: str, part_no: int) -> str:
    first_line = first_para.split("\n", 1)[0].strip()
    if 3 < len(first_line) <= 80 and not first_line.endswith("."):
        return first_line
    return f"Section {part_no}"


def _to_markdown(title: str, body: str, *, chapter_title: str | None) -> str:
    lines = [f"# {title}", ""]
    if chapter_title and chapter_title.lower() not in title.lower():
        lines.extend([f"> Chapter: {chapter_title}", ""])
    if body:
        # Ensure body paragraphs are markdown-friendly
        normalized = re.sub(r"\n{3,}", "\n\n", body.strip())
        lines.append(normalized)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def _summarize(text: str, max_len: int = 180) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 1].rstrip() + "…"


def _clean_title(title: str) -> str:
    return re.sub(r"\s+", " ", title).strip(" -:•")


def _slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:48]
