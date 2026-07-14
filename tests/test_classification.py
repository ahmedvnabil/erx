from egypt_research_mcp.classification import classify_topics


def test_classify_topics_detects_multiple_research_topics() -> None:
    topics = classify_topics(
        "قرار بشأن الحبس الاحتياطي بعد القبض على صحفي بسبب حرية التعبير"
    )

    assert "الحبس الاحتياطي" in topics
    assert "حرية التعبير والصحافة" in topics
    assert "القضاء والمحاكمات" in topics


def test_classify_topics_returns_empty_for_unrelated_text() -> None:
    assert classify_topics("افتتاح معرض للفنون التشكيلية") == []

