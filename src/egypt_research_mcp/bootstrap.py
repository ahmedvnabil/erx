from .catalog import INITIAL_SOURCES
from .store import ResearchStore


def seed_catalog(store: ResearchStore) -> int:
    for source in INITIAL_SOURCES:
        store.upsert_source(source)
    return len(INITIAL_SOURCES)

