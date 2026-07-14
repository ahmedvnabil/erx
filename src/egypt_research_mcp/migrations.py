from dataclasses import dataclass


@dataclass(frozen=True)
class Migration:
    version: int
    name: str
    sql: str


MIGRATIONS = (
    Migration(
        1,
        "source_collection_policy",
        """
        ALTER TABLE sources ADD COLUMN sitemap_url TEXT;
        ALTER TABLE sources ADD COLUMN collection_method TEXT NOT NULL DEFAULT 'catalog';
        ALTER TABLE sources ADD COLUMN crawl_delay_seconds REAL NOT NULL DEFAULT 1.0;
        ALTER TABLE sources ADD COLUMN content_license TEXT NOT NULL DEFAULT 'unknown';
        ALTER TABLE sources ADD COLUMN robots_policy TEXT NOT NULL DEFAULT 'respect';
        ALTER TABLE sources ADD COLUMN last_success_at TEXT;
        ALTER TABLE sources ADD COLUMN last_error_at TEXT;
        ALTER TABLE sources ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
        """,
    ),
    Migration(
        2,
        "knowledge_and_retrieval",
        """
        CREATE TABLE document_assets (
            id INTEGER PRIMARY KEY,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            media_type TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            byte_size INTEGER NOT NULL,
            page_count INTEGER,
            extracted_with TEXT NOT NULL,
            ocr_used INTEGER NOT NULL DEFAULT 0,
            storage_path TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(document_id, url, sha256)
        );

        CREATE TABLE entities (
            id INTEGER PRIMARY KEY,
            canonical_name TEXT NOT NULL,
            normalized_name TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            aliases_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            UNIQUE(normalized_name, entity_type)
        );

        CREATE TABLE document_entities (
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            mentions INTEGER NOT NULL DEFAULT 1,
            confidence REAL NOT NULL,
            PRIMARY KEY(document_id, entity_id)
        );

        CREATE TABLE events (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            occurred_at TEXT,
            event_type TEXT NOT NULL,
            location TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE event_documents (
            event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'reporting',
            PRIMARY KEY(event_id, document_id)
        );

        CREATE TABLE claims (
            id INTEGER PRIMARY KEY,
            claim_text TEXT NOT NULL,
            normalized_claim TEXT NOT NULL UNIQUE,
            claim_type TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            review_status TEXT NOT NULL DEFAULT 'unreviewed'
        );

        CREATE TABLE claim_evidence (
            claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            stance TEXT NOT NULL DEFAULT 'reports',
            quote TEXT NOT NULL DEFAULT '',
            confidence REAL NOT NULL,
            PRIMARY KEY(claim_id, document_id)
        );

        CREATE TABLE document_embeddings (
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            dimensions INTEGER NOT NULL,
            vector_json TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(document_id, provider, model)
        );

        CREATE TABLE saved_searches (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            query TEXT NOT NULL,
            filters_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            last_run_at TEXT
        );

        CREATE TABLE audit_events (
            id INTEGER PRIMARY KEY,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            subject_type TEXT NOT NULL,
            subject_id TEXT,
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL
        );

        CREATE INDEX idx_entities_name ON entities(normalized_name);
        CREATE INDEX idx_events_occurred_at ON events(occurred_at DESC);
        CREATE INDEX idx_claims_last_seen ON claims(last_seen_at DESC);
        CREATE INDEX idx_audit_events_created ON audit_events(created_at DESC);
        """,
    ),
)
