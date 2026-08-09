````md
# PRD — Multilingual Historical Character Audio

## Overview

Add language selection before audio generation.

The user selects the language in which the historical character should speak. The existing generated answer is translated into that language using **Sarvam Translate** or **Mayura**, then the translated script is passed to Sarvam TTS.

This happens **before audio generation** and does not change the Sora video generation pipeline.

## Flow

Historical Agent
→ Original Script
→ User selects language
→ Translation
→ Translated Script
→ Sarvam TTS
→ Audio
→ Existing synchronization pipeline
→ Final MP4

## Language Selection

Add a `language` field to the generation request.

Example:

```json
{
  "character": "napoleon",
  "prompt": "Why did people initially see you as a liberator but later see your armies as invaders?",
  "language": "hi-IN"
}
````

Supported language options should include the languages supported by the selected Sarvam translation model.

### Sarvam Translate

Use `sarvam-translate:v1` when broad language coverage is required. It supports English + all 22 scheduled Indian languages and has a 2,000-character request limit. 

Codes include:

```text
en-IN
hi-IN
bn-IN
ta-IN
te-IN
kn-IN
ml-IN
mr-IN
gu-IN
pa-IN
od-IN
...
```

Full language coverage should follow Sarvam's supported language list. 

### Mayura

Use `mayura:v1` when conversational or colloquial translation is preferred.

Mayura supports customizable translation styles, including:

* formal
* modern-colloquial
* classic-colloquial
* code-mixed

It also supports output script control.  

Mayura currently supports 10 Indian languages + English and has a 1,000-character input limit. 

## Translation Strategy

Default:

```text
English Script
      ↓
Sarvam Translate
      ↓
Target Language Script
      ↓
Sarvam TTS
```

For conversational historical responses, allow:

```json
{
  "translation_model": "mayura",
  "translation_style": "modern-colloquial"
}
```

For formal/accurate historical narration:

```json
{
  "translation_model": "sarvam-translate",
  "translation_style": "formal"
}
```

## Important Timing Requirement

The **translated script becomes the source of truth for audio timing**.

Do not translate after TTS generation.

Example:

```text
Original Script
      ↓
Translation
      ↓
Translated Script
      ↓
Pause/timing processing
      ↓
Sarvam TTS
      ↓
Audio
      ↓
Existing video/audio synchronization
```

If the translation changes sentence length, the timing must be recalculated from the translated script.

## API Update

### `POST /generate`

```json
{
  "character": "napoleon",
  "prompt": "Why did people initially see you as a liberator but later see your armies as invaders?",
  "mode": "portrait",
  "language": "hi-IN",
  "translation_model": "sarvam-translate",
  "translation_style": "formal"
}
```

### Response

```json
{
  "job_id": "abc123",
  "status": "translation_pending",
  "source_language": "en-IN",
  "target_language": "hi-IN"
}
```

## Job Pipeline

Update the existing pipeline to:

```text
queued
  ↓
script_generating
  ↓
translation_pending
  ↓
translation_completed
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

## Output

Store both scripts:

```json
{
  "original_script": "...",
  "translated_script": "...",
  "source_language": "en-IN",
  "target_language": "hi-IN",
  "translation_model": "sarvam-translate:v1"
}
```

The original script is retained for debugging and display; **only the translated script is sent to TTS**.

## Translation Rules

* Preserve the historical meaning.
* Do not translate character names unnecessarily.
* Preserve intentional pauses and emotional cues.
* Preserve quoted historical terminology where appropriate.
* Do not introduce new factual information.
* Maintain conversational tone when using Mayura.
* Split requests at sentence boundaries when the model character limit is exceeded. Sarvam Translate supports up to 2,000 characters per request, while Mayura supports up to 1,000.  



```
```
