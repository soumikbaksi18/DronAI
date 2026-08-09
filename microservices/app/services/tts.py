"""Sarvam TTS — the authoritative audio track.

Each speech segment is synthesized separately and the scripted pauses are
inserted as exact digital silence, so pause timing is deterministic instead of
depending on how the model happens to read punctuation.
"""

import base64
import io
import wave
from pathlib import Path

import httpx

from app.core.config import get_settings

settings = get_settings()

SARVAM_URL = "https://api.sarvam.ai/text-to-speech"
SARVAM_MODEL = "bulbul:v2"
MAX_CHARS = 1400  # Sarvam rejects longer single requests


def _synthesize(text: str, voice: dict) -> bytes:
    if not settings.sarvam_api_key:
        raise RuntimeError("SARVAM_API_KEY is not set")
    if len(text) > MAX_CHARS:
        raise RuntimeError(f"Speech segment is {len(text)} chars, Sarvam caps at {MAX_CHARS}")

    response = httpx.post(
        SARVAM_URL,
        headers={"api-subscription-key": settings.sarvam_api_key},
        json={
            "text": text,
            "target_language_code": voice["language"],
            "speaker": voice["speaker"],
            "model": SARVAM_MODEL,
            "pace": voice["pace"],
        },
        timeout=120,
    )
    if response.status_code != 200:
        raise RuntimeError(f"Sarvam TTS {response.status_code}: {response.text[:300]}")
    return base64.b64decode(response.json()["audios"][0])


def synthesize_segments(segments: list[tuple[str, str | float]], voice: dict):
    """Voice every spoken segment once. Returns (clips, wav params).

    Clips keep the same shape as segments — ("audio", frames) / ("pause", seconds) —
    so pauses can be re-timed later without paying Sarvam again.
    """
    if not any(kind == "speech" for kind, _ in segments):
        raise RuntimeError("Script contains no spoken dialogue")

    clips: list[tuple[str, bytes | float]] = []
    params = None
    for kind, value in segments:
        if kind == "pause":
            clips.append(("pause", float(value)))
            continue
        with wave.open(io.BytesIO(_synthesize(str(value), voice))) as source:
            params = params or source.getparams()
            clips.append(("audio", source.readframes(source.getnframes())))

    assert params is not None
    return clips, params


def write_clips(clips, params, out_path: Path, lead: float = 0.0) -> float:
    """Assemble clips into one WAV, optionally offset by `lead` seconds of silence."""

    def silence(seconds: float) -> bytes:
        frames = max(int(params.framerate * seconds), 0)
        return b"\x00" * (frames * params.sampwidth * params.nchannels)

    with wave.open(str(out_path), "wb") as out:
        out.setparams(params)
        out.writeframes(silence(lead))
        for kind, value in clips:
            out.writeframes(silence(float(value)) if kind == "pause" else value)

    return wav_duration(out_path)


def speech_durations(clips, params) -> list[float]:
    frame_size = params.sampwidth * params.nchannels
    return [
        len(value) / frame_size / params.framerate for kind, value in clips if kind == "audio"
    ]


def scripted_pauses(clips) -> list[float]:
    return [float(value) for kind, value in clips if kind == "pause"]


def align_plan(
    speech: list[float], pauses: list[float], onsets: list[float], max_extra: float = 2.0
):
    """Re-time pauses so each spoken line starts where the video actually starts speaking.

    Returns (lead, pauses) or None when the video's audio gives us nothing to align
    to — fewer speech runs than lines means we'd be guessing, so we don't.
    """
    if len(onsets) < len(speech) or not speech:
        return None

    lead = max(onsets[0], 0.0)
    cursor = lead
    aligned: list[float] = []
    for index, duration in enumerate(speech):
        cursor += duration
        # a pause after the final line has no next onset to aim at — leave it scripted
        if index >= len(pauses) or index + 1 >= len(onsets):
            break
        # cumulative, so a line that overruns its slot doesn't push every later one out
        wanted = onsets[index + 1] - cursor
        wanted = min(max(wanted, 0.0), pauses[index] + max_extra)
        aligned.append(round(wanted, 3))
        cursor += wanted

    return round(lead, 3), aligned


def retime(clips, pauses: list[float]):
    """Copy of `clips` with its pause values replaced, in order."""
    out, index = [], 0
    for kind, value in clips:
        if kind == "pause" and index < len(pauses):
            out.append(("pause", pauses[index]))
            index += 1
        else:
            out.append((kind, value))
    return out


def render_segments(segments: list[tuple[str, str | float]], voice: dict, out_path: Path) -> float:
    """Write one WAV of the whole script and return its duration in seconds."""
    clips, params = synthesize_segments(segments, voice)
    return write_clips(clips, params, out_path)


def wav_duration(path: Path) -> float:
    with wave.open(str(path)) as handle:
        return handle.getnframes() / handle.getframerate()


def demo() -> None:
    """Pauses must land in the track exactly as scripted — checked without calling Sarvam."""
    import tempfile

    global _synthesize
    real = _synthesize
    rate, seconds_per_clip = 22050, 1.0

    def fake(text, voice):
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(rate)
            handle.writeframes(b"\x01\x00" * int(rate * seconds_per_clip))
        return buffer.getvalue()

    try:
        _synthesize = fake
        segments = [("speech", "one"), ("pause", 1.5), ("speech", "two"), ("pause", 0.5)]
        out = Path(tempfile.gettempdir()) / "tts_selfcheck.wav"
        duration = render_segments(segments, {"speaker": "x", "language": "en-IN", "pace": 1}, out)
        assert abs(duration - (2 * seconds_per_clip + 2.0)) < 0.01, duration
        assert abs(wav_duration(out) - duration) < 1e-6
        out.unlink()

        try:
            render_segments([("pause", 1.0)], {}, out)
            raise AssertionError("silent script should not be accepted")
        except RuntimeError as exc:
            assert "no spoken dialogue" in str(exc)

        # --- pause re-timing -------------------------------------------------
        clips, params = synthesize_segments(segments, {})
        assert speech_durations(clips, params) == [1.0, 1.0]
        assert scripted_pauses(clips) == [1.5, 0.5]

        # video starts talking at 0.4s, second line at 3.0s -> lead 0.4, gap 1.6
        plan = align_plan([1.0, 1.0], [1.5, 0.5], [0.4, 3.0])
        assert plan == (0.4, [1.6]), plan

        # a gap the video wants longer than scripted is capped, not honoured blindly
        assert align_plan([1.0, 1.0], [0.5, 0.5], [0.0, 60.0]) == (0.0, [2.5])
        # overlapping lines clamp to zero rather than going negative
        assert align_plan([2.0, 1.0], [1.0], [0.0, 1.0]) == (0.0, [0.0])
        # not enough detected speech runs -> refuse to guess
        assert align_plan([1.0, 1.0], [1.0], [0.5]) is None
        assert align_plan([1.0], [], []) is None

        retimed = retime(clips, [0.25, 0.75])
        assert scripted_pauses(retimed) == [0.25, 0.75]
        assert speech_durations(retimed, params) == [1.0, 1.0]  # voice untouched

        duration = write_clips(retimed, params, out, lead=0.4)
        assert abs(duration - (0.4 + 1.0 + 0.25 + 1.0 + 0.75)) < 0.01, duration
        out.unlink()
    finally:
        _synthesize = real

    print("ok")


if __name__ == "__main__":
    demo()
