from egypt_research_mcp.bootstrap import seed_catalog
from egypt_research_mcp.catalog import INITIAL_SOURCES
from egypt_research_mcp.store import ResearchStore


def test_seed_catalog_is_idempotent(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()

    first = seed_catalog(store)
    second = seed_catalog(store)

    assert first == len(INITIAL_SOURCES)
    assert second == len(INITIAL_SOURCES)
    assert len(store.list_sources()) == len(INITIAL_SOURCES)
