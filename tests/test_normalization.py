from egypt_research_mcp.normalization import normalize_arabic, tokenize_query


def test_normalize_arabic_unifies_letters_diacritics_and_digits() -> None:
    text = "إِعْلَان الهَيْئَة رقم ٢٠٢٦\u0640م"

    assert normalize_arabic(text) == "اعلان الهييه رقم 2026م"


def test_tokenize_query_discards_empty_tokens_and_punctuation() -> None:
    assert tokenize_query("  حقوق، الإنسان! في مصر  ") == [
        "حقوق",
        "الانسان",
        "في",
        "مصر",
    ]

