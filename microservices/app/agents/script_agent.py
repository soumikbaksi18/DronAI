"""Historical character script agent.

Turns a user question into a spoken script whose dialogue is used verbatim by
BOTH Sora (visual performance) and Sarvam (authoritative audio), so the two
never drift apart.

Script format the model must return:

    Napoleon looks directly into the camera.
    "I brought reforms that promised equality before the law."
    [pause: 1.0s]
    "But as my armies crossed Europe..."
"""

import re

from app.core.config import get_settings

settings = get_settings()

PAUSE_RE = re.compile(r"\[pause:\s*([0-9]*\.?[0-9]+)\s*s?\]", re.IGNORECASE)
QUOTE_RE = re.compile(r"[\"“”]([^\"“”]+)[\"“”]")
MAX_PAUSE_SECONDS = 3.0  # a longer scripted pause is a model mistake, not a beat
WORDS_PER_SECOND = 2.6  # Sarvam at pace 1.0; only used to pick a duration up front
PAUSE_BUDGET_SECONDS = 1.5  # the model reliably spends about this on scripted pauses

SYSTEM_PROMPT = """You write short spoken monologues for historical figures in a \
documentary. You are {name}, speaking in first person, in {era}.

Rules:
- Answer the user's question directly, in character, historically grounded.
- HARD LIMIT: {max_words} spoken words in total. Count every word across every line
  before you answer. Going over ruins the clip — being under is always fine.
- 2 or 3 short spoken lines, each wrapped in double quotes. Nothing else in quotes.
- At most 2 pauses, each on its own line as [pause: 0.5s], none longer than 1.0s.
- You MAY add unquoted performance cues (expression, gaze) on their own lines.
- The whole performance must fit in {seconds} seconds.
- No stage directions inside the quotes. No narrator. No modern references."""


def word_budget(seconds: float, pace: float, shrink: float = 1.0) -> int:
    """Words that fit in `seconds`, leaving room for the pauses the model will add."""
    speaking = max(seconds - PAUSE_BUDGET_SECONDS, 1.0)
    return max(int(speaking * WORDS_PER_SECOND * pace * shrink), 8)


def generate_script(question: str, character: dict, seconds: int, shrink: float = 1.0) -> str:
    from openai import OpenAI

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI(api_key=settings.openai_api_key)
    system = SYSTEM_PROMPT.format(
        name=character["name"],
        era=character["visual"]["era"],
        seconds=seconds,
        max_words=word_budget(seconds, character["voice"]["pace"], shrink),
    )
    completion = client.chat.completions.create(
        model=settings.script_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": question}],
        temperature=0.8,
    )
    script = (completion.choices[0].message.content or "").strip()
    if not QUOTE_RE.search(script):
        raise RuntimeError(f"Script agent returned no quoted dialogue: {script[:200]}")
    return script


def parse_script(script: str) -> list[tuple[str, str | float]]:
    """Split a script into ordered ("speech", text) / ("pause", seconds) segments.

    Only quoted text is ever spoken — unquoted lines are performance cues for Sora.
    """
    segments: list[tuple[str, str | float]] = []
    for line in script.splitlines():
        line = line.strip()
        if not line:
            continue
        pause = PAUSE_RE.fullmatch(line)
        if pause:
            segments.append(("pause", min(float(pause.group(1)), MAX_PAUSE_SECONDS)))
            continue
        for spoken in QUOTE_RE.findall(line):
            spoken = spoken.strip()
            if spoken:
                segments.append(("speech", spoken))
    return segments


def spoken_text(segments: list[tuple[str, str | float]]) -> str:
    return " ".join(str(value) for kind, value in segments if kind == "speech")


def estimate_seconds(segments: list[tuple[str, str | float]], pace: float) -> float:
    """Rough script length, used before any audio exists."""
    words = len(spoken_text(segments).split())
    pauses = sum(float(value) for kind, value in segments if kind == "pause")
    return words / (WORDS_PER_SECOND * pace) + pauses


def demo() -> None:
    script = """Napoleon looks directly into the camera.

"I brought reforms that promised equality before the law."

[pause: 1.0s]

"But as my armies crossed Europe..."

[pause: 0.5s]

"liberation began to look like conquest."

He becomes more serious during the final sentence."""

    segments = parse_script(script)
    assert [kind for kind, _ in segments] == [
        "speech", "pause", "speech", "pause", "speech",
    ], segments
    # unquoted stage directions are never spoken
    assert "looks directly into the camera" not in spoken_text(segments)
    assert "serious" not in spoken_text(segments)
    assert [v for k, v in segments if k == "pause"] == [1.0, 0.5]

    assert parse_script("[pause: 99s]") == [("pause", MAX_PAUSE_SECONDS)]  # clamped
    assert parse_script("no dialogue at all") == []
    assert parse_script('“curly quotes count.”') == [("speech", "curly quotes count.")]
    assert parse_script('"one" and "two"') == [("speech", "one"), ("speech", "two")]

    words = len(spoken_text(segments).split())
    assert estimate_seconds(segments, 1.0) == words / WORDS_PER_SECOND + 1.5

    # budget must leave room for pauses, shrink on retry, and never hit zero
    assert word_budget(12, 0.9) < 12 * WORDS_PER_SECOND * 0.9
    assert word_budget(12, 0.9, shrink=0.8) < word_budget(12, 0.9)
    assert word_budget(1, 0.5, shrink=0.1) >= 8
    print("ok")


if __name__ == "__main__":
    demo()
