"""FFmpeg assembly — replace Sora's audio with the Sarvam track and align durations.

Sarvam audio is the source of truth: it is never stretched or trimmed. The video
is padded (last frame held) when it is shorter, and cut when it is longer.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

TOLERANCE_SECONDS = 0.05  # below this, a re-encode buys nothing


def _require(tool: str) -> str:
    path = shutil.which(tool)
    if not path:
        raise RuntimeError(f"{tool} not found on PATH — install FFmpeg to assemble the final MP4")
    return path


def _run(args: list[str]) -> subprocess.CompletedProcess:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{Path(args[0]).stem} failed: {result.stderr[-400:]}")
    return result


SILENCE_DB = -35  # Sora clips carry room tone, so pure -60dB digital silence is rare
MIN_SILENCE = 0.25
MIN_SPEECH = 0.15


def speech_onsets(path: Path, noise_db: int = SILENCE_DB, min_silence: float = MIN_SILENCE):
    """Start time of each run of speech in a clip's own audio, via ffmpeg silencedetect.

    Returns [] when the track has no usable structure (music, constant ambience) —
    callers must treat that as "don't align" rather than "no speech".
    """
    result = subprocess.run(
        [
            _require("ffmpeg"), "-i", str(path),
            "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return []

    starts = [float(m) for m in re.findall(r"silence_start:\s*(-?[\d.]+)", result.stderr)]
    ends = [float(m) for m in re.findall(r"silence_end:\s*([\d.]+)", result.stderr)]

    total = probe_duration(path)
    silences = []
    for index, start in enumerate(starts):
        end = ends[index] if index < len(ends) else total
        silences.append((max(start, 0.0), min(end, total)))

    onsets, cursor = [], 0.0
    for start, end in silences:
        if start - cursor >= MIN_SPEECH:
            onsets.append(round(cursor, 3))
        cursor = end
    if total - cursor >= MIN_SPEECH:
        onsets.append(round(cursor, 3))
    return onsets


def probe_duration(path: Path) -> float:
    result = _run([
        _require("ffprobe"), "-v", "error", "-show_entries", "format=duration",
        "-of", "json", str(path),
    ])
    return float(json.loads(result.stdout)["format"]["duration"])


def mux(video: Path, audio: Path, audio_seconds: float, out_path: Path) -> dict:
    """Mux `audio` over `video`, cut or hold the video to match, return timing info."""
    ffmpeg = _require("ffmpeg")
    video_seconds = probe_duration(video)
    pad = audio_seconds - video_seconds

    args = [ffmpeg, "-y", "-i", str(video), "-i", str(audio)]
    if pad > TOLERANCE_SECONDS:
        # hold the last frame instead of touching the voice track
        args += [
            "-filter_complex", f"[0:v]tpad=stop_mode=clone:stop_duration={pad:.3f}[v]",
            "-map", "[v]", "-map", "1:a:0",
        ]
    else:
        args += ["-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy"]
    args += ["-c:a", "aac", "-t", f"{audio_seconds:.3f}", "-movflags", "+faststart", str(out_path)]

    _run(args)
    return {
        "audio_seconds": round(audio_seconds, 2),
        "video_seconds": round(video_seconds, 2),
        "padded_seconds": round(max(pad, 0.0), 2) or 0.0,   # `or` also normalises -0.0
        "trimmed_seconds": round(max(-pad, 0.0), 2) or 0.0,
        "final_seconds": round(probe_duration(out_path), 2),
    }


def demo() -> None:
    """Both alignment directions, end to end through real FFmpeg."""
    import tempfile
    import wave

    ffmpeg, tmp = _require("ffmpeg"), Path(tempfile.mkdtemp())

    def make_video(path: Path, seconds: float) -> None:
        _run([
            ffmpeg, "-y", "-f", "lavfi", "-i", f"testsrc=size=320x240:rate=24:duration={seconds}",
            "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
            "-shortest", "-pix_fmt", "yuv420p", str(path),
        ])

    def make_audio(path: Path, seconds: float) -> None:
        with wave.open(str(path), "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(22050)
            handle.writeframes(b"\x01\x00" * int(22050 * seconds))

    video, audio, out = tmp / "v.mp4", tmp / "a.wav", tmp / "final.mp4"

    # voice longer than the clip -> hold the last frame, never cut the voice
    make_video(video, 4.0)
    make_audio(audio, 6.0)
    timing = mux(video, audio, 6.0, out)
    assert timing["padded_seconds"] > 1.5, timing
    assert abs(timing["final_seconds"] - 6.0) < 0.3, timing

    # voice shorter -> trim the excess video
    make_video(video, 8.0)
    make_audio(audio, 5.0)
    timing = mux(video, audio, 5.0, out)
    assert timing["padded_seconds"] == 0 and timing["trimmed_seconds"] > 2.5, timing
    assert abs(timing["final_seconds"] - 5.0) < 0.3, timing

    # Sora's own audio must be gone: exactly one audio stream, and it is the WAV's length
    streams = _run([
        _require("ffprobe"), "-v", "error", "-select_streams", "a",
        "-show_entries", "stream=codec_name", "-of", "json", str(out),
    ])
    assert len(json.loads(streams.stdout)["streams"]) == 1

    # speech runs: tone 0-2s, silence 2-3.5s, tone 3.5-5.5s -> onsets near 0.0 and 3.5
    spoken = tmp / "spoken.mp4"
    _run([
        ffmpeg, "-y",
        "-f", "lavfi", "-i", "testsrc=size=320x240:rate=24:duration=5.5",
        "-f", "lavfi", "-i",
        "sine=frequency=300:duration=2,apad=pad_dur=1.5,"
        "concat=n=1:v=0:a=1[a0];sine=frequency=300:duration=2[a1];[a0][a1]concat=n=2:v=0:a=1",
        "-shortest", "-pix_fmt", "yuv420p", str(spoken),
    ])
    onsets = speech_onsets(spoken)
    assert len(onsets) == 2, onsets
    assert onsets[0] < 0.3 and 3.2 < onsets[1] < 3.9, onsets

    # a clip with no silence at all is one continuous run
    make_video(video, 3.0)
    assert len(speech_onsets(video)) == 1, speech_onsets(video)

    shutil.rmtree(tmp, ignore_errors=True)
    print("ok")


if __name__ == "__main__":
    demo()
