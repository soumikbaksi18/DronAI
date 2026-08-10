````md
# PRD — Script-Synchronized Historical Video Generation

## Overview

Add synchronized audio/video generation to the existing historical character video microservice.

The system must use the **same generated dialogue script** for both Sora 2 video generation and Sarvam TTS, then synchronize the resulting assets in the backend using timing, pauses, duration alignment, and FFmpeg.

**No MuseTalk or external lip-sync model.**

## Core Flow

User Prompt
→ Historical Agent
→ Final Dialogue Script
→ Script Timing / Pause Extraction
→ ┌───────────────┬───────────────┐
  ↓               ↓
Sora 2          Sarvam TTS
  ↓               ↓
Video          WAV Audio
  └───────────────┬───────────────┘
                  ↓
        Backend Synchronization
                  ↓
              Final MP4

## 1. Script Generation

The historical agent generates the final response before any media generation.

The script should contain:

- Exact spoken dialogue
- Intentional pauses
- Emotional cues
- Speaking pace
- Optional actions/expression cues

Example:

```text
Napoleon looks directly into the camera.

"I brought reforms that promised equality before the law."

[pause: 1.0s]

"But as my armies crossed Europe..."

[pause: 0.5s]

"liberation began to look like conquest."

He becomes more serious during the final sentence.
````

The spoken text must remain identical between Sora and Sarvam.

## 2. Sora 2 Generation

Generate the visual performance using the exact dialogue script.

The Sora prompt should include:

* Character identity
* Historical appearance
* Camera/framing
* Exact dialogue
* Speaking pace
* Pause locations
* Emotional expressions
* Natural blinking/head movement
* Mouth movement corresponding to speech
* Total target duration

For portrait characters:

* `720x1280`
* Medium close-up
* Character facing camera
* Natural facial performance

For scenes:

* `1280x720`
* Cinematic framing
* Historical environment/action

Sora's generated audio should **not** be used as the final audio.

## 3. Sarvam TTS

Send the exact spoken dialogue to Sarvam.

Character configuration determines:

```json
{
  "speaker": "ratan",
  "language": "en-IN",
  "pace": 0.9
}
```

The TTS service should preserve the intentional pauses from the script.

Output:

```text
audio.wav
```

Use the generated WAV as the authoritative audio track.

## 4. Synchronization Engine

The backend is responsible for synchronizing the Sora video and Sarvam audio.

### Responsibilities

* Measure audio duration
* Measure video duration
* Preserve scripted pauses
* Compare target duration against generated duration
* Trim excess video
* Pad video when necessary
* Adjust timing within configured tolerance
* Replace Sora's audio with Sarvam's WAV
* Produce final MP4

The synchronization layer must **never modify the Sarvam voice track unnecessarily**.

Sarvam audio is the source of truth.

## 5. Timing Strategy

Define a target timeline from the dialogue script.

Example:

```text
0.0s ─────────────── 3.8s
"I brought reforms..."

3.8s ─── 4.8s
[pause 1.0s]

4.8s ─────────────── 8.2s
"But as my armies..."

8.2s ── 8.7s
[pause 0.5s]

8.7s ─────────────── 11.5s
"liberation began..."
```

This timeline is used when constructing both:

* Sora visual-performance instructions
* Sarvam speech generation

## 6. Final Assembly

Use FFmpeg for deterministic backend assembly.

```text
Sora Video
     +
Sarvam WAV
     ↓
Duration Alignment
     ↓
Audio Replacement
     ↓
Final MP4
```

Example operation:

```bash
ffmpeg \
  -i sora_video.mp4 \
  -i sarvam_audio.wav \
  -map 0:v:0 \
  -map 1:a:0 \
  -c:v copy \
  -c:a aac \
  -shortest \
  final.mp4
```

## 7. API

### `POST /generate`

```json
{
  "character": "napoleon",
  "prompt": "Why did people initially see you as a liberator but later see your armies as invaders?",
  "mode": "portrait",
  "duration": 12,
  "reference_image": null
}
```

Returns:

```json
{
  "job_id": "abc123",
  "status": "queued"
}
```

### `GET /jobs/{job_id}`

```json
{
  "job_id": "abc123",
  "status": "synchronizing",
  "script": "...",
  "video_url": "...",
  "audio_url": "...",
  "final_video_url": null
}
```

Final:

```json
{
  "status": "completed",
  "final_video_url": "/videos/abc123/final.mp4"
}
```

## 8. Job States

```text
queued
  ↓
script_generating
  ↓
script_ready
  ↓
generating_video
  ↓
generating_audio
  ↓
measuring_timing
  ↓
synchronizing
  ↓
completed
```

Failure at any stage:

```text
failed
```

with an error message and failed stage.

## 9. Character Profiles

Each character maintains a configuration:

```json
{
  "name": "Napoleon",
  "voice": {
    "speaker": "ratan",
    "language": "en-IN",
    "pace": 0.9
  },
  "visual": {
    "era": "19th-century France",
    "style": "historical documentary",
    "framing": "medium close-up"
  }
}
```

This allows different characters to have different voices, pacing, visual styles and performance instructions.

## 10. MVP Requirements

* Historical prompt → answer script
* Script-based pause/timing system
* Sora 2 video generation
* Sarvam TTS generation
* Character-specific voice profiles
* Portrait + scene modes
* Optional historical reference image
* Backend duration measurement
* Automatic video/audio alignment
* FFmpeg final assembly
* Async job processing
* Final MP4 output

## Out of Scope

* MuseTalk
* Wav2Lip
* Any dedicated lip-sync model
* Real-time generation
* Perfect phoneme-level lip-sync guarantees

## Success Criteria

Given a historical question:

> "Napoleon, why did people initially see you as a liberator but later see your armies as invaders?"

the service should produce:

**One final MP4** where:

1. The historical character visually performs the generated response.
2. Sarvam provides the final voice.
3. Scripted pauses are preserved.
4. Video and audio have matching duration/timing.
5. The final result looks like the character is naturally speaking the generated response.

```
```
