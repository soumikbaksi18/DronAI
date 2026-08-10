"""Character profiles — voice + visual direction per historical figure.

The PRD's example speaker "ratan" is not a real Sarvam voice; bulbul:v2 offers
anushka, abhilash, manisha, vidya, arya, karun, hitesh.

`gender` is not decoration: gendered languages inflect the verb for the speaker,
so without it Sarvam renders Napoleon as "मैं ... लाई" (feminine).
"""

DEFAULT_CHARACTER = {
    "name": "Historical figure",
    "gender": "Male",
    "voice": {"speaker": "abhilash", "language": "en-IN", "pace": 0.95},
    "visual": {
        "era": "period-accurate historical setting",
        "style": "historical documentary",
        "framing": "medium close-up",
    },
}

CHARACTERS = {
    "napoleon": {
        "name": "Napoleon Bonaparte",
        "gender": "Male",
        "voice": {"speaker": "karun", "language": "en-IN", "pace": 0.9},
        "visual": {
            "era": "19th-century France, Napoleonic era military dress",
            "style": "historical documentary",
            "framing": "medium close-up",
        },
    },
    "gandhi": {
        "name": "Mahatma Gandhi",
        "gender": "Male",
        "voice": {"speaker": "abhilash", "language": "en-IN", "pace": 0.85},
        "visual": {
            "era": "1930s-40s India, hand-spun khadi dhoti and shawl, round spectacles",
            "style": "archival historical documentary",
            "framing": "medium close-up",
        },
    },
    "ashoka": {
        "name": "Emperor Ashoka",
        "gender": "Male",
        "voice": {"speaker": "arya", "language": "en-IN", "pace": 0.9},
        "visual": {
            "era": "3rd-century BCE Mauryan India, royal robes and gold ornaments",
            "style": "historical documentary",
            "framing": "medium close-up",
        },
    },
    "curie": {
        "name": "Marie Curie",
        "gender": "Female",
        "voice": {"speaker": "vidya", "language": "en-IN", "pace": 0.95},
        "visual": {
            "era": "early 1900s Paris laboratory, dark high-collared dress",
            "style": "archival historical documentary",
            "framing": "medium close-up",
        },
    },
}


def get_character(key: str | None) -> dict:
    """Unknown keys fall back to a generic profile rather than failing the job."""
    if not key:
        return DEFAULT_CHARACTER
    return CHARACTERS.get(key.strip().lower(), DEFAULT_CHARACTER)
