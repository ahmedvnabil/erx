from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


SourceType = Literal[
    "official",
    "legal",
    "news",
    "human_rights",
    "academic",
    "statistics",
    "investigative",
]


class SourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=200)
    url: str
    source_type: SourceType
    ownership_type: str = Field(min_length=2, max_length=80)
    language: Literal["ar", "en", "mixed"] = "ar"
    feed_url: str | None = None
    sitemap_url: str | None = None
    collection_method: Literal["catalog", "rss", "sitemap", "hybrid"] = "catalog"
    crawl_delay_seconds: float = Field(default=1.0, ge=0.5, le=60)
    content_license: str = Field(default="unknown", min_length=2, max_length=100)
    robots_policy: Literal["respect", "allowlist_only"] = "respect"
    active: bool = True

    @field_validator("url", "feed_url", "sitemap_url")
    @classmethod
    def validate_http_url(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(("https://", "http://")):
            raise ValueError("URL must use http or https")
        return value


class DocumentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str = Field(min_length=3, max_length=500)
    source_slug: str
    canonical_url: str
    title: str = Field(min_length=2, max_length=1000)
    excerpt: str = ""
    content: str = ""
    published_at: datetime | None = None
    event_at: datetime | None = None
    document_type: str = "article"
    topics: list[str] = Field(default_factory=list)
    language: Literal["ar", "en", "mixed"] = "ar"

    @field_validator("canonical_url")
    @classmethod
    def validate_canonical_url(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("canonical_url must use http or https")
        return value

    @field_validator("published_at", "event_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("datetime must include a timezone")
        return value


class FeedEntry(BaseModel):
    external_id: str
    canonical_url: str
    title: str
    excerpt: str = ""
    published_at: datetime | None = None
    content: str = ""


class Citation(BaseModel):
    title: str
    source_name: str
    url: str
    published_at: datetime | None
    archived_at: datetime


class SearchResult(BaseModel):
    document_id: int
    external_id: str
    source_slug: str
    source_name: str
    source_type: SourceType
    title: str
    excerpt: str
    canonical_url: str
    published_at: datetime | None
    event_at: datetime | None
    archived_at: datetime
    document_type: str
    topics: list[str]
    citation: Citation


class DocumentRecord(SearchResult):
    content: str


class TimelineItem(BaseModel):
    document_id: int
    occurred_at: datetime
    date_basis: Literal["event_at", "published_at", "archived_at"]
    title: str
    source_name: str
    citation: Citation


class UpsertResult(BaseModel):
    document_id: int
    created_version: bool


class DocumentAssetInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_id: int = Field(gt=0)
    url: str
    media_type: str = Field(min_length=3, max_length=100)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    byte_size: int = Field(ge=0)
    page_count: int | None = Field(default=None, ge=1, le=10_000)
    extracted_with: str = Field(min_length=2, max_length=100)
    ocr_used: bool = False
    storage_path: str | None = None

    @field_validator("url")
    @classmethod
    def validate_asset_url(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("asset URL must use http or https")
        return value


class SourceRecord(BaseModel):
    slug: str
    name: str
    url: str
    source_type: SourceType
    ownership_type: str
    language: str
    feed_url: str | None
    sitemap_url: str | None
    collection_method: str
    crawl_delay_seconds: float
    content_license: str
    robots_policy: str
    last_success_at: datetime | None
    last_error_at: datetime | None
    consecutive_failures: int
    active: bool
    health_status: str
    last_crawled_at: datetime | None
    document_count: int = 0


class SourceComparison(BaseModel):
    query: str
    total_documents: int
    independent_source_count: int
    by_source_type: dict[str, list[SearchResult]]


class DailyBrief(BaseModel):
    date: str
    document_count: int
    source_count: int
    items: list[SearchResult]


class IngestionReport(BaseModel):
    source_slug: str
    status: Literal["success", "empty", "failed", "skipped"]
    items_found: int = 0
    items_saved: int = 0
    items_enriched: int = 0
    enrichment_failures: int = 0
    error_code: str | None = None
    error_message: str | None = None


class CrawlRun(BaseModel):
    id: int
    source_slug: str
    started_at: datetime
    finished_at: datetime | None
    status: Literal["running", "success", "empty", "failed", "skipped"]
    items_found: int = 0
    items_saved: int = 0
    error_code: str | None = None
    error_message: str | None = None
    duration_ms: int | None = None


class StoryDocument(BaseModel):
    document_id: int
    source_slug: str
    source_name: str
    title: str
    canonical_url: str
    published_at: datetime | None


class StoryRecord(BaseModel):
    id: int
    title: str
    first_seen_at: datetime
    last_seen_at: datetime
    document_count: int
    source_count: int
    documents: list[StoryDocument] = Field(default_factory=list)


class EntityRecord(BaseModel):
    id: int
    canonical_name: str
    entity_type: str
    aliases: list[str] = Field(default_factory=list)
    mentions: int = 0
    document_count: int = 0


class ClaimEvidenceRecord(BaseModel):
    document_id: int
    title: str
    source_name: str
    canonical_url: str
    stance: str
    quote: str
    confidence: float


class ClaimRecord(BaseModel):
    id: int
    claim_text: str
    claim_type: str
    first_seen_at: datetime
    last_seen_at: datetime
    review_status: str
    evidence: list[ClaimEvidenceRecord] = Field(default_factory=list)


class EventDocumentRecord(BaseModel):
    document_id: int
    title: str
    source_name: str
    canonical_url: str
    role: str


class EventRecord(BaseModel):
    id: int
    title: str
    summary: str
    occurred_at: datetime | None
    event_type: str
    location: str | None
    documents: list[EventDocumentRecord] = Field(default_factory=list)


class KnowledgeIndexReport(BaseModel):
    document_id: int
    entities: int
    claims: int
    events: int
    embedded: bool


class HybridSearchResult(SearchResult):
    retrieval_score: float
    match_reasons: list[Literal["lexical", "semantic"]]


class SavedSearchRecord(BaseModel):
    id: int
    name: str
    query: str
    filters: dict[str, str | int | bool | list[str]] = Field(default_factory=dict)
    created_at: datetime
    last_run_at: datetime | None
