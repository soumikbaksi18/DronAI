"""Sora 2 video generation service.

Routes a prompt to portrait (720x1280, talking historical figure) or scene
(1280x720, cinematic) mode, builds an enhanced Sora prompt, and runs generation
in the background. Jobs live in memory.

Every job hits the real OpenAI video API using OPENAI_API_KEY (~$0.10/sec, so
~$0.80 for 8s). No mock — a missing key or an API error fails the job.
"""

import time
import uuid
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()

OUTPUT_DIR = Path(settings.video_output_dir)
UPLOAD_DIR = Path(settings.video_upload_dir)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SECONDS_CHOICES = ("4", "8", "12")  # Sora 2 accepts only these
MAX_VIDEO_SECONDS = float(SECONDS_CHOICES[-1])
SIZES = {"portrait": (720, 1280), "scene": (1280, 720)}
POLL_SECONDS = 10

# ponytail: in-memory job store, swap for Redis when more than one worker runs
jobs: dict[str, dict] = {}

PORTRAIT_WORDS = (
    "portrait", "historical figure", "historical character", "person", "speaks",
    "speaking", "talking", "says", "dialogue", "monologue", "interview",
    "addresses the camera", "looks into camera", "talking head",
    "facial expression", "lip sync", "lipsync", "teacher", "explains",
)

SCENE_WORDS = (
    "battle", "war", "crowd", "army", "soldiers", "street", "market", "city",
    "explosion", "landscape", "ship", "building", "meeting", "march",
    "festival", "scene", "cinematic", "experiment", "diagram", "animation",
)


def detect_mode(prompt: str) -> str:
    text = prompt.lower()
    portrait = sum(1 for w in PORTRAIT_WORDS if w in text)
    scene = sum(1 for w in SCENE_WORDS if w in text)
    return "portrait" if portrait >= scene else "scene"


PORTRAIT_TEMPLATE = """Create a photorealistic historical documentary portrait video.

SUBJECT:
{prompt}

FORMAT: Vertical portrait composition, 720x1280.

CAMERA: Medium close-up / chest-up framing. Eye-level. Subtle natural camera
movement. Keep the face centered and clearly visible.

CHARACTER: Preserve the person's recognizable facial structure and historical
appearance. Period-accurate clothing, hairstyle and environment. Realistic skin
texture. Natural blinking and breathing.

FACIAL PERFORMANCE: Realistic eye movement, subtle emotional changes, natural
eyebrow and head movement. The face must remain temporally consistent.

DIALOGUE: If dialogue is specified above, the subject speaks those exact words
while looking toward the camera, with mouth movement corresponding naturally to
the speech. Natural pauses. Do not have the character silently mouth words.

AUDIO: Generate natural spoken dialogue if dialogue is provided, in a
historically plausible speaking style. Add subtle environmental room tone.

VISUAL STYLE: Photorealistic archival documentary. Authentic period lighting.
Natural film grain. No modern objects. No subtitles. No text overlays."""

SCENE_TEMPLATE = """Create a photorealistic cinematic historical scene.

SCENE:
{prompt}

FORMAT: Landscape composition, 1280x720.

CAMERA: Cinematic camera movement appropriate to the scene. Establish the
environment first, then follow the important action. Natural depth of field.

HISTORICAL ACCURACY: Period-appropriate architecture, clothing, vehicles,
weapons, props and environmental details. Do not introduce modern objects.

ACTION: Clearly show the main action described above. Characters move naturally.
Crowds and background characters behave realistically.

LIGHTING: Natural cinematic lighting appropriate to the period.

AUDIO: Realistic environmental sound. Dialogue only when explicitly requested.

VISUAL STYLE: Photorealistic documentary. Subtle film grain. Natural colors.
High temporal consistency. No subtitles. No text overlays."""


SCRIPT_BLOCK = """

PERFORMANCE SCRIPT — the character speaks exactly these words, in this order,
holding each written pause. Total target duration: {seconds} seconds.

{script}

Match mouth movement to the spoken words. Do not add, drop or reorder words.
Do not show subtitles."""


def build_prompt(prompt: str, mode: str, script: str = "", seconds: str = "") -> str:
    template = PORTRAIT_TEMPLATE if mode == "portrait" else SCENE_TEMPLATE
    built = template.format(prompt=prompt)
    if script:
        built += SCRIPT_BLOCK.format(script=script.strip(), seconds=seconds)
    return built


def create_job(
    prompt: str,
    mode: str,
    seconds: str,
    character: str | None = None,
    language: str = "en-IN",
    translation_model: str | None = None,
    translation_style: str | None = None,
) -> dict:
    from app.services import translate

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "stage": "queued",
        "mode": mode,
        "character": character,
        "prompt": prompt,
        "seconds": seconds,
        "progress": 0,
        "source_language": translate.SOURCE_LANGUAGE,
        "target_language": language,
        "translation_model": (
            translate.resolve_model(translation_model)
            if language != translate.SOURCE_LANGUAGE
            else None
        ),
        "translation_style": translation_style,
        "script": None,
        "translated_script": None,
        "pause_alignment": None,
        "video_url": None,
        "audio_url": None,
        "final_video_url": None,
        "timing": None,
        "message": "Queued",
        "error": None,
        "failed_stage": None,
    }
    return jobs[job_id]


def image_mode(data: bytes) -> str:
    """A reference photo's own orientation beats keyword-guessing from the prompt."""
    import io

    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as image:
        width, height = ImageOps.exif_transpose(image).size
    return "portrait" if height >= width else "scene"


def fit_reference(path: Path, size: tuple[int, int]) -> Path:
    """Sora rejects any input_reference whose dimensions differ from the output size.

    ponytail: center cover-crop — a face off to one side of a wide photo can lose
    its edge. Add a face-aware crop if that shows up in real uploads.
    """
    from PIL import Image, ImageOps

    with Image.open(path) as image:
        upright = ImageOps.exif_transpose(image).convert("RGB")
        fitted = ImageOps.fit(upright, size, Image.LANCZOS)
        out = path.with_name(f"{path.stem}-{size[0]}x{size[1]}.png")
        fitted.save(out)
    return out


def _generate(
    job_id: str,
    prompt: str,
    mode: str,
    seconds: str,
    reference_image: str | None,
    script: str = "",
):
    from openai import OpenAI

    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI(api_key=settings.openai_api_key)
    job = jobs[job_id]

    size = SIZES[mode]
    kwargs = {
        "model": settings.sora_model,
        "prompt": build_prompt(prompt, mode, script, seconds),
        "size": f"{size[0]}x{size[1]}",
        "seconds": seconds,
    }

    job["message"] = "Submitting video to Sora 2..."
    if reference_image:
        with open(fit_reference(Path(reference_image), size), "rb") as handle:
            video = client.videos.create(**kwargs, input_reference=handle)
    else:
        video = client.videos.create(**kwargs)

    job.update(sora_video_id=video.id, message="Sora 2 is generating the video...")

    while video.status not in ("completed", "failed"):
        time.sleep(POLL_SECONDS)
        video = client.videos.retrieve(video.id)
        job["progress"] = video.progress or 0

    if video.status == "failed":
        raise RuntimeError(str(video.error) if video.error else "Sora video generation failed")

    job["message"] = "Downloading generated video..."
    content = client.videos.download_content(video.id)
    (OUTPUT_DIR / f"{job_id}.mp4").write_bytes(content.read())


def pick_seconds(audio_seconds: float) -> str:
    """Smallest Sora duration that covers the measured voice track."""
    for choice in SECONDS_CHOICES:
        if float(choice) >= audio_seconds:
            return choice
    return SECONDS_CHOICES[-1]


def _stage(job: dict, stage: str, message: str) -> None:
    job.update(status=stage, stage=stage, message=message)


def run_job(
    job_id: str,
    prompt: str,
    mode: str,
    seconds: str,
    reference_image: str | None = None,
    character_key: str | None = None,
    language: str = "en-IN",
    translation_model: str | None = None,
    translation_style: str | None = None,
) -> None:
    """Blocking pipeline — call via BackgroundTasks (runs in the threadpool).

    With a character: script -> translation -> Sarvam voice -> Sora video -> FFmpeg.
    Without one: a plain Sora clip, keeping Sora's own audio.

    Audio is generated BEFORE the video (the PRD lists it after) because the
    measured voice duration is what picks Sora's 4/8/12s length — guessing first
    means paying for a clip that doesn't fit the script.
    """
    job = jobs[job_id]
    stage = "generating_video"
    try:
        script = ""
        if character_key is not None:
            from app.agents import script_agent
            from app.services import characters, media, translate, tts

            character = characters.get_character(character_key)
            job["character"] = character["name"]
            model = translate.resolve_model(translation_model)
            audio_path = OUTPUT_DIR / f"{job_id}.wav"
            # the voice speaks the translated line, so TTS follows the target language
            voice = {**character["voice"], "language": language}

            def voice_track(shrink: float = 1.0) -> tuple[str, float]:
                """Script -> translate -> speak. Returns the script Sora should perform."""
                nonlocal stage, segments, clips, params

                stage = "script_generating"
                _stage(job, stage, f"Writing {character['name']}'s reply...")
                draft = int(seconds) if seconds != "auto" else 8
                english = script_agent.generate_script(prompt, character, draft, shrink=shrink)
                segments = script_agent.parse_script(english)
                if not segments:
                    raise RuntimeError("Script agent produced no usable dialogue")
                job["script"] = english
                _stage(job, "script_ready", "Script ready")

                performed = english
                if language != translate.SOURCE_LANGUAGE:
                    stage = "translation_pending"
                    _stage(job, stage, f"Translating to {translate.LANGUAGES[language]}...")
                    segments = translate.translate_segments(
                        segments, language, model, translation_style, character.get("gender")
                    )
                    # timing must come from the translated line, never the English one
                    job["translated_script"] = translate.render_script(segments)
                    # ...and so must the visual performance, or the mouth shapes English
                    # while the voice speaks the target language
                    performed = (
                        f"The character speaks entirely in "
                        f"{translate.LANGUAGES[language]}.\n\n{job['translated_script']}"
                    )
                    _stage(job, "translation_completed", "Translation ready")

                stage = "generating_audio"
                _stage(job, stage, "Synthesizing the voice with Sarvam...")
                clips, params = tts.synthesize_segments(segments, voice)
                return performed, tts.write_clips(clips, params, audio_path)

            segments: list = []
            clips: list = []
            params = None
            script, audio_seconds = voice_track()

            # A voice track longer than Sora's longest clip leaves the character
            # visibly frozen mid-sentence. Script + TTS cost cents, so tighten and
            # retry once rather than pay for a clip the dialogue outgrows.
            if seconds == "auto" and audio_seconds > MAX_VIDEO_SECONDS:
                _stage(job, stage, f"Voice ran {audio_seconds:.1f}s — tightening the script...")
                script, audio_seconds = voice_track(shrink=MAX_VIDEO_SECONDS / audio_seconds)

            job["audio_url"] = f"/v1/video/audio/{job_id}"

            stage = "measuring_timing"
            _stage(job, stage, f"Voice track is {audio_seconds:.1f}s")
            if seconds == "auto":
                seconds = pick_seconds(audio_seconds)
            job["seconds"] = seconds

        elif seconds == "auto":
            seconds = "8"
            job["seconds"] = seconds

        stage = "generating_video"
        _stage(job, stage, "Generating video...")
        _generate(job_id, prompt, mode, seconds, reference_image, script)
        job["video_url"] = f"/v1/video/file/{job_id}"

        if character_key is not None:
            stage = "synchronizing"
            _stage(job, stage, "Aligning voice and video...")

            # Sora paces its own delivery. Re-space our silences to where the clip
            # actually starts each line, so the two drift apart line by line instead
            # of accumulating from the first word. Costs nothing: the voiced clips
            # are already in memory, only the gaps between them move.
            onsets = media.speech_onsets(OUTPUT_DIR / f"{job_id}.mp4")
            plan = tts.align_plan(
                tts.speech_durations(clips, params), tts.scripted_pauses(clips), onsets
            )
            alignment = {"onsets": onsets, "applied": bool(plan)}
            if plan:
                lead, aligned = plan
                alignment.update(lead=lead, pauses=aligned, was=tts.scripted_pauses(clips))
                audio_seconds = tts.write_clips(
                    tts.retime(clips, aligned), params, audio_path, lead=lead
                )
            job["pause_alignment"] = alignment

            job["timing"] = media.mux(
                OUTPUT_DIR / f"{job_id}.mp4",
                audio_path,
                audio_seconds,
                OUTPUT_DIR / f"{job_id}-final.mp4",
            )
            job["final_video_url"] = f"/v1/video/final/{job_id}"

        job.update(
            status="completed",
            stage="completed",
            progress=100,
            message="Video generated successfully",
        )
    except Exception as exc:  # surface it to the poller instead of dying silently
        job.update(
            status="failed",
            stage="failed",
            failed_stage=stage,
            error=str(exc),
            message=f"Failed during {stage}",
        )


def demo() -> None:
    assert detect_mode('Gandhi looks into the camera and says: "Be the change."') == "portrait"
    assert detect_mode("A crowded Delhi railway station in 1947, camera tracks the crowd") == "scene"
    assert "720x1280" in build_prompt("x", "portrait")
    assert "1280x720" in build_prompt("x", "scene")
    assert build_prompt("teach photosynthesis", "scene").count("teach photosynthesis") == 1

    # reference images must come out at exactly the Sora output size, whatever went in
    from PIL import Image

    for source_size in [(4000, 3000), (600, 900), (1280, 720)]:
        src = UPLOAD_DIR / "selfcheck.png"
        Image.new("RGB", source_size, "grey").save(src)
        expected = "portrait" if source_size[1] >= source_size[0] else "scene"
        assert image_mode(src.read_bytes()) == expected, source_size
        for mode, target in SIZES.items():
            fitted = fit_reference(src, target)
            with Image.open(fitted) as out:
                assert out.size == target, (source_size, mode, out.size)
            fitted.unlink()
        src.unlink()

    # never call the real API from the self-check — ~$0.80 a pop
    global _generate
    real_call = _generate
    try:
        _generate = lambda *args: None  # noqa: E731
        job = create_job("test", "portrait", "8")
        assert job["status"] == "queued" and job["seconds"] == "8"
        run_job(job["id"], "test", "portrait", "8")
        assert jobs[job["id"]]["status"] == "completed"
        assert jobs[job["id"]]["progress"] == 100
        assert jobs[job["id"]]["video_url"] == f"/v1/video/file/{job['id']}"

        def boom(*args):
            raise RuntimeError("moderation_blocked")

        _generate = boom
        job = create_job("test", "scene", "4")
        run_job(job["id"], "test", "scene", "4")
        assert jobs[job["id"]]["status"] == "failed"
        assert jobs[job["id"]]["failed_stage"] == "generating_video"
        assert "moderation_blocked" in jobs[job["id"]]["error"]
    finally:
        _generate = real_call

    assert pick_seconds(3.2) == "4" and pick_seconds(8.0) == "8"
    assert pick_seconds(8.1) == "12" and pick_seconds(99) == "12"  # capped, never unbounded

    _demo_pipeline()
    print("ok")


def _demo_pipeline() -> None:
    """Character pipeline with every API stubbed — real WAV assembly and real FFmpeg mux."""
    import wave

    from app.agents import script_agent
    from app.services import media, translate, tts

    global _generate
    real_generate, real_script, real_synth = _generate, script_agent.generate_script, tts._synthesize
    real_translate = translate._post
    stages: list[str] = []
    spoken: list[str] = []
    genders: list[str | None] = []
    performed: list[str] = []

    def fake_script(question, character, seconds, shrink=1.0):
        return '"First line here."\n[pause: 1.0s]\n"Second line here."'

    def fake_translate(text, target, model, style, gender=None):
        genders.append(gender)
        return f"[{target}] {text}"

    def fake_synth(text, voice):  # 2s of tone per spoken line
        import io

        spoken.append(f"{voice['language']}|{text}")
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(22050)
            handle.writeframes(b"\x01\x00" * (22050 * 2))
        return buffer.getvalue()

    def fake_generate(job_id, prompt, mode, seconds, reference_image, script=""):
        performed.append(script)
        # stand-in Sora clip that speaks on its own schedule: tone 0-1.5s, silence,
        # second run from 3.5s — deliberately not the 1.0s pause the script asked for
        media._run([
            media._require("ffmpeg"), "-y",
            "-f", "lavfi", "-i", f"testsrc=size=320x240:rate=24:duration={seconds}",
            "-f", "lavfi", "-i",
            "sine=frequency=300:duration=1.5,apad=pad_dur=2.0[a0];"
            "sine=frequency=300:duration=2[a1];[a0][a1]concat=n=2:v=0:a=1",
            "-shortest", "-pix_fmt", "yuv420p", str(OUTPUT_DIR / f"{job_id}.mp4"),
        ])

    try:
        _generate, script_agent.generate_script, tts._synthesize = (
            fake_generate, fake_script, fake_synth
        )
        translate._post = fake_translate
        original_stage = _stage

        def spy(job, stage, message):
            stages.append(stage)
            original_stage(job, stage, message)

        globals()["_stage"] = spy

        # English: no translation stages, nothing sent to the translator
        job = create_job("Why did they call you a liberator?", "portrait", "auto", "napoleon")
        run_job(job["id"], job["prompt"], "portrait", "auto", None, "napoleon")
        assert "translation_pending" not in stages, stages
        assert all(line.startswith("en-IN|") for line in spoken), spoken
        assert jobs[job["id"]]["translated_script"] is None
        assert "First line here." in performed[0]  # English job: Sora performs English
        for name in (f"{job['id']}.mp4", f"{job['id']}.wav", f"{job['id']}-final.mp4"):
            (OUTPUT_DIR / name).unlink()

        # Hindi: translated lines are what reaches TTS, in the target language
        stages.clear()
        spoken.clear()
        performed.clear()
        job = create_job(
            "Why did they call you a liberator?", "portrait", "auto", "napoleon", "hi-IN"
        )
        run_job(job["id"], job["prompt"], "portrait", "auto", None, "napoleon", "hi-IN")
    finally:
        _generate, script_agent.generate_script, tts._synthesize = (
            real_generate, real_script, real_synth
        )
        translate._post = real_translate
        globals()["_stage"] = original_stage

    done = jobs[job["id"]]
    assert done["status"] == "completed", done
    assert stages == [
        "script_generating", "script_ready", "translation_pending", "translation_completed",
        "generating_audio", "measuring_timing", "generating_video", "synchronizing",
    ], stages
    assert spoken == ["hi-IN|[hi-IN] First line here.", "hi-IN|[hi-IN] Second line here."], spoken
    assert done["script"] and "First line here." in done["script"]  # English kept for reference
    assert "[hi-IN]" in done["translated_script"]
    assert "[pause: 1.0s]" in done["translated_script"]  # pauses survive translation
    assert done["translation_model"] == "sarvam-translate:v1"
    # Napoleon must not be translated in the feminine
    assert genders == ["Male", "Male"], genders

    # Sora performs the translated lines, not the English ones, and is told the language
    assert "[hi-IN] First line here." in performed[0], performed
    assert "Hindi" in performed[0]
    assert "First line here.\n" not in performed[0].replace("[hi-IN] ", "")

    # pauses were re-spaced to the clip's own speech runs, not left at script values
    alignment = done["pause_alignment"]
    assert alignment["applied"], alignment
    assert len(alignment["onsets"]) >= 2, alignment
    assert alignment["was"] == [1.0], alignment
    # the clip's second line starts at ~3.5s and our first line runs 2s -> ~1.5s gap
    assert alignment["pauses"] != alignment["was"], alignment
    assert abs(alignment["pauses"][0] - 1.5) < 0.15, alignment
    assert alignment["lead"] == alignment["onsets"][0]
    assert done["source_language"] == "en-IN" and done["target_language"] == "hi-IN"
    assert done["character"] == "Napoleon Bonaparte"
    assert done["seconds"] == "8"  # 2s + 1s pause + 2s = 5s of voice -> the 8s clip
    assert done["audio_url"] and done["video_url"] and done["final_video_url"]
    # 2s + realigned 1.5s gap + 2s; the scripted 1.0s pause would have given 5.0s
    assert abs(done["timing"]["audio_seconds"] - 5.5) < 0.15, done["timing"]
    assert abs(done["timing"]["final_seconds"] - 5.5) < 0.3, done["timing"]

    for name in (f"{job['id']}.mp4", f"{job['id']}.wav", f"{job['id']}-final.mp4"):
        path = OUTPUT_DIR / name
        assert path.exists(), name
        path.unlink()


if __name__ == "__main__":
    demo()
