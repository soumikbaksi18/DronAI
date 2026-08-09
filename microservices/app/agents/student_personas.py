"""Student Persona Crew — scaffold simulation."""

from typing import Any

PERSONA_PROFILES: dict[str, dict[str, Any]] = {
    "fast_learner": {
        "name": "Fast Learner",
        "focus": "depth and challenge",
        "default_score": 0.85,
    },
    "struggling_learner": {
        "name": "Struggling Learner",
        "focus": "clarity and examples",
        "default_score": 0.55,
    },
    "visual_learner": {
        "name": "Visual Learner",
        "focus": "diagrams and visual storytelling",
        "default_score": 0.7,
    },
    "distracted_learner": {
        "name": "Distracted Learner",
        "focus": "pacing and engagement",
        "default_score": 0.6,
    },
    "skeptic": {
        "name": "Skeptic",
        "focus": "evidence and logical connections",
        "default_score": 0.65,
    },
}


def simulate_classroom(title: str, scenes: list[dict[str, Any]], personas: list[str]) -> dict[str, Any]:
    selected = personas or list(PERSONA_PROFILES.keys())[:4]
    persona_feedback = []
    confusion_flags: list[dict[str, Any]] = []

    for persona_key in selected:
        profile = PERSONA_PROFILES.get(
            persona_key,
            {"name": persona_key, "focus": "general", "default_score": 0.7},
        )
        weak_scene = scenes[min(1, len(scenes) - 1)] if scenes else None
        notes = [
            f"Evaluated '{title}' with focus on {profile['focus']}.",
        ]
        if weak_scene:
            notes.append(f"May struggle or disengage at '{weak_scene.get('title', 'Scene')}'.")
            if persona_key in {"struggling_learner", "distracted_learner", "visual_learner"}:
                confusion_flags.append(
                    {
                        "persona": profile["name"],
                        "scene_id": weak_scene.get("id"),
                        "scene_title": weak_scene.get("title"),
                        "reason": f"Needs stronger support for {profile['focus']}.",
                    }
                )

        persona_feedback.append(
            {
                "persona": persona_key,
                "name": profile["name"],
                "engagement": profile["default_score"],
                "clarity": max(0.4, profile["default_score"] - 0.05),
                "notes": notes,
                "sample_questions": [
                    f"Why does this matter for {profile['focus']}?",
                    "Can you explain that another way?",
                ],
            }
        )

    overall = (
        sum(item["engagement"] for item in persona_feedback) / len(persona_feedback)
        if persona_feedback
        else 0.0
    )

    return {
        "overall_score": round(overall * 100, 1),
        "engagement": round(overall * 100, 1),
        "clarity": round(max(0.0, overall - 0.05) * 100, 1),
        "difficulty": "moderate",
        "visual_quality": 68.0,
        "predicted_confusion": confusion_flags,
        "persona_feedback": persona_feedback,
        "recommendations": [
            "Simplify the weakest scene with a concrete classroom example.",
            "Add a timeline or diagram for visual learners.",
            "Insert a quick check-for-understanding question mid-lesson.",
        ],
    }
