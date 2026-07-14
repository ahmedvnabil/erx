from .models import DailyBrief, SourceComparison
from .store import ResearchStore


class ResearchService:
    def __init__(self, store: ResearchStore) -> None:
        self.store = store

    def compare_sources(self, query: str, limit: int = 50) -> SourceComparison:
        results = self.store.search(query, limit=limit)
        grouped: dict[str, list] = {}
        for result in results:
            grouped.setdefault(result.source_type, []).append(result)
        return SourceComparison(
            query=query,
            total_documents=len(results),
            independent_source_count=len({item.source_slug for item in results}),
            by_source_type=grouped,
        )

    def daily_brief(self, date: str, limit: int = 50) -> DailyBrief:
        items = self.store.documents_on_date(date, limit=limit)
        return DailyBrief(
            date=date,
            document_count=len(items),
            source_count=len({item.source_slug for item in items}),
            items=items,
        )
