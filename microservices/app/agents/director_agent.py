"""Classroom Director Agent — routes live teacher commands (scaffold)."""

from typing import Any


def handle_command(command: str, language: str, scenes: list[dict[str, Any]]) -> dict[str, Any]:
    normalized = command.strip().lower()
    scene = scenes[0] if scenes else None

    if "hindi" in normalized or language.lower() in {"hi", "hindi"}:
        action = "translate_and_explain"
        response = (
            "मैं इस अवधारणा को सरल हिंदी में समझाता/समझाती हूँ। "
            "(Scaffold: wire Sarvam / LLM for real multilingual explanation.)"
        )
    elif "skip" in normalized:
        action = "skip_section"
        response = "Skipping the current section and moving to the next scene."
    elif "question" in normalized or "ask" in normalized:
        action = "ask_class"
        response = (
            scene["questions"][0]
            if scene and scene.get("questions")
            else "What is the main idea we just covered?"
        )
    elif "example" in normalized:
        action = "give_example"
        response = f"Here is another example related to '{scene.get('title') if scene else 'this topic'}'."
    elif "simplify" in normalized or "simply" in normalized:
        action = "simplify"
        response = "Let me explain this more simply, step by step."
    else:
        action = "general_assist"
        response = f"Understood: '{command}'. (Scaffold director — connect real agent reasoning next.)"

    return {
        "action": action,
        "spoken_response": response,
        "language": language,
        "ui_hints": {
            "highlight_scene_id": scene.get("id") if scene else None,
            "show_alternate_explanation": action in {"simplify", "give_example", "translate_and_explain"},
        },
    }
