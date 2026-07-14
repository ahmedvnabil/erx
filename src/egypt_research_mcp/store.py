from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterator

from .models import (
    Citation,
    ClaimEvidenceRecord,
    ClaimRecord,
    CrawlRun,
    DocumentAssetInput,
    DocumentInput,
    DocumentRecord,
    EntityRecord,
    EventDocumentRecord,
    EventRecord,
    SearchResult,
    SavedSearchRecord,
    SourceInput,
    SourceRecord,
    StoryDocument,
    StoryRecord,
    TimelineItem,
    UpsertResult,
)
from .migrations import MIGRATIONS
from .clustering import headline_tokens, similarity
from .normalization import normalize_arabic, tokenize_query
from .schema import SCHEMA


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(value: datetime | None) -> str | None:
    return value.astimezone(UTC).isoformat() if value else None


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


class ResearchStore:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    applied_at TEXT NOT NULL
                )
                """
            )
            applied = {
                int(row["version"])
                for row in connection.execute("SELECT version FROM schema_migrations")
            }
            for migration in MIGRATIONS:
                if migration.version in applied:
                    continue
                version = migration.version
                name = migration.name.replace("'", "''")
                applied_at = _iso(_now())
                connection.executescript(
                    f"""
                    BEGIN IMMEDIATE;
                    {migration.sql}
                    INSERT INTO schema_migrations (version, name, applied_at)
                    VALUES ({version}, '{name}', '{applied_at}');
                    COMMIT;
                    """
                )

    def backup(self, destination: str | Path) -> Path:
        destination = Path(destination)
        if not self.path.exists():
            raise ValueError(f"Database does not exist: {self.path}")
        if self.path.resolve() == destination.resolve():
            raise ValueError("Backup destination must differ from the live database")
        destination.parent.mkdir(parents=True, exist_ok=True)
        source = sqlite3.connect(self.path)
        target = sqlite3.connect(destination)
        try:
            source.backup(target)
            target.commit()
        finally:
            target.close()
            source.close()
        self.verify_backup(destination)
        return destination

    @staticmethod
    def verify_backup(path: str | Path) -> str:
        path = Path(path)
        if not path.is_file():
            raise ValueError(f"Backup does not exist: {path}")
        try:
            connection = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            try:
                result = connection.execute("PRAGMA integrity_check").fetchone()[0]
            finally:
                connection.close()
        except sqlite3.DatabaseError as error:
            raise ValueError("Backup is not a valid SQLite database") from error
        if result != "ok":
            raise ValueError(f"Backup integrity check failed: {result}")
        return str(result)

    def restore(self, source: str | Path) -> Path:
        source = Path(source)
        self.verify_backup(source)
        timestamp = _now().strftime("%Y%m%dT%H%M%SZ")
        safety_path = self.path.with_name(
            f"{self.path.stem}.pre-restore-{timestamp}.db"
        )
        if self.path.exists():
            self.backup(safety_path)
        else:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        backup_connection = sqlite3.connect(source)
        live_connection = sqlite3.connect(self.path)
        try:
            backup_connection.backup(live_connection)
            live_connection.commit()
        finally:
            live_connection.close()
            backup_connection.close()
        self.verify_backup(self.path)
        return safety_path

    def upsert_source(self, source: SourceInput) -> int:
        now = _iso(_now())
        collection_method = source.collection_method
        if collection_method == "catalog":
            if source.feed_url and source.sitemap_url:
                collection_method = "hybrid"
            elif source.feed_url:
                collection_method = "rss"
            elif source.sitemap_url:
                collection_method = "sitemap"
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO sources (
                    slug, name, url, source_type, ownership_type, language,
                    feed_url, sitemap_url, collection_method, crawl_delay_seconds,
                    content_license, robots_policy, active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(slug) DO UPDATE SET
                    name=excluded.name, url=excluded.url,
                    source_type=excluded.source_type,
                    ownership_type=excluded.ownership_type,
                    language=excluded.language, feed_url=excluded.feed_url,
                    sitemap_url=excluded.sitemap_url,
                    collection_method=excluded.collection_method,
                    crawl_delay_seconds=excluded.crawl_delay_seconds,
                    content_license=excluded.content_license,
                    robots_policy=excluded.robots_policy,
                    active=excluded.active, updated_at=excluded.updated_at
                """,
                (
                    source.slug,
                    source.name,
                    source.url,
                    source.source_type,
                    source.ownership_type,
                    source.language,
                    source.feed_url,
                    source.sitemap_url,
                    collection_method,
                    source.crawl_delay_seconds,
                    source.content_license,
                    source.robots_policy,
                    int(source.active),
                    now,
                    now,
                ),
            )
            row = connection.execute(
                "SELECT id FROM sources WHERE slug = ?", (source.slug,)
            ).fetchone()
            return int(row["id"])

    def list_sources(self) -> list[SourceRecord]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT s.*, COUNT(d.id) AS document_count
                FROM sources s
                LEFT JOIN documents d ON d.source_id = s.id
                GROUP BY s.id
                ORDER BY s.name
                """
            ).fetchall()
        return [self._source_record(row) for row in rows]

    def get_source(self, slug: str) -> SourceRecord | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT s.*, COUNT(d.id) AS document_count
                FROM sources s
                LEFT JOIN documents d ON d.source_id = s.id
                WHERE s.slug = ? GROUP BY s.id
                """,
                (slug,),
            ).fetchone()
        return self._source_record(row) if row else None

    def update_source_health(self, slug: str, status: str) -> None:
        now = _iso(_now())
        with self.connect() as connection:
            if status == "healthy":
                cursor = connection.execute(
                    """
                    UPDATE sources SET health_status=?, last_crawled_at=?,
                        last_success_at=?, consecutive_failures=0, updated_at=?
                    WHERE slug=?
                    """,
                    (status, now, now, now, slug),
                )
            elif status == "failed":
                cursor = connection.execute(
                    """
                    UPDATE sources SET health_status=?, last_crawled_at=?,
                        last_error_at=?, consecutive_failures=consecutive_failures + 1,
                        updated_at=? WHERE slug=?
                    """,
                    (status, now, now, now, slug),
                )
            else:
                cursor = connection.execute(
                    """
                    UPDATE sources SET health_status=?, last_crawled_at=?, updated_at=?
                    WHERE slug=?
                    """,
                    (status, now, now, slug),
                )
            if cursor.rowcount == 0:
                raise ValueError(f"Unknown source: {slug}")

    def start_crawl_run(self, source_slug: str) -> int:
        now = _iso(_now())
        with self.connect() as connection:
            source = connection.execute(
                "SELECT id FROM sources WHERE slug = ?", (source_slug,)
            ).fetchone()
            if source is None:
                raise ValueError(f"Unknown source: {source_slug}")
            cursor = connection.execute(
                "INSERT INTO crawl_runs (source_id, started_at, status) VALUES (?, ?, ?)",
                (source["id"], now, "running"),
            )
            return int(cursor.lastrowid)

    def finish_crawl_run(
        self,
        run_id: int,
        *,
        status: str,
        items_found: int = 0,
        items_saved: int = 0,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> None:
        finished = _now()
        with self.connect() as connection:
            row = connection.execute(
                "SELECT started_at FROM crawl_runs WHERE id = ?", (run_id,)
            ).fetchone()
            if row is None:
                raise ValueError(f"Unknown crawl run: {run_id}")
            started = _dt(row["started_at"])
            duration_ms = int((finished - started).total_seconds() * 1000)
            connection.execute(
                """
                UPDATE crawl_runs SET finished_at=?, status=?, items_found=?,
                    items_saved=?, error_code=?, error_message=?, duration_ms=?
                WHERE id=?
                """,
                (
                    _iso(finished),
                    status,
                    items_found,
                    items_saved,
                    error_code,
                    error_message,
                    duration_ms,
                    run_id,
                ),
            )

    def list_crawl_runs(
        self, source_slug: str | None = None, limit: int = 50
    ) -> list[CrawlRun]:
        condition = "WHERE s.slug = ?" if source_slug else ""
        params: list[object] = [source_slug] if source_slug else []
        params.append(max(1, min(limit, 500)))
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT r.*, s.slug AS source_slug
                FROM crawl_runs r JOIN sources s ON s.id = r.source_id
                {condition} ORDER BY r.started_at DESC LIMIT ?
                """,
                params,
            ).fetchall()
        return [
            CrawlRun(
                id=int(row["id"]),
                source_slug=row["source_slug"],
                started_at=_dt(row["started_at"]),
                finished_at=_dt(row["finished_at"]),
                status=row["status"],
                items_found=int(row["items_found"]),
                items_saved=int(row["items_saved"]),
                error_code=row["error_code"],
                error_message=row["error_message"],
                duration_ms=row["duration_ms"],
            )
            for row in rows
        ]

    def upsert_document(self, document: DocumentInput) -> UpsertResult:
        snapshot = json.dumps(
            [document.title, document.excerpt, document.content],
            ensure_ascii=False,
            separators=(",", ":"),
        )
        content_hash = hashlib.sha256(snapshot.encode()).hexdigest()
        topics_json = json.dumps(document.topics, ensure_ascii=False)
        now_dt = _now()
        now = _iso(now_dt)
        with self.connect() as connection:
            source = connection.execute(
                "SELECT id FROM sources WHERE slug = ?", (document.source_slug,)
            ).fetchone()
            if source is None:
                raise ValueError(f"Unknown source: {document.source_slug}")
            current = connection.execute(
                "SELECT id, content_hash FROM documents WHERE external_id = ? OR canonical_url = ?",
                (document.external_id, document.canonical_url),
            ).fetchone()
            created_version = current is None or current["content_hash"] != content_hash
            if current is None:
                cursor = connection.execute(
                    """
                    INSERT INTO documents (
                        external_id, source_id, canonical_url, title, excerpt, content,
                        published_at, event_at, archived_at, document_type, topics_json,
                        language, content_hash, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        document.external_id,
                        source["id"],
                        document.canonical_url,
                        document.title,
                        document.excerpt,
                        document.content,
                        _iso(document.published_at),
                        _iso(document.event_at),
                        now,
                        document.document_type,
                        topics_json,
                        document.language,
                        content_hash,
                        now,
                        now,
                    ),
                )
                document_id = int(cursor.lastrowid)
            else:
                document_id = int(current["id"])
                connection.execute(
                    """
                    UPDATE documents SET source_id=?, canonical_url=?, title=?, excerpt=?,
                        content=?, published_at=?, event_at=?, document_type=?, topics_json=?,
                        language=?, content_hash=?, updated_at=? WHERE id=?
                    """,
                    (
                        source["id"],
                        document.canonical_url,
                        document.title,
                        document.excerpt,
                        document.content,
                        _iso(document.published_at),
                        _iso(document.event_at),
                        document.document_type,
                        topics_json,
                        document.language,
                        content_hash,
                        now,
                        document_id,
                    ),
                )
            if created_version:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO document_versions (
                        document_id, content_hash, title, excerpt, content, captured_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        document_id,
                        content_hash,
                        document.title,
                        document.excerpt,
                        document.content,
                        now,
                    ),
                )
            connection.execute("DELETE FROM documents_fts WHERE document_id = ?", (document_id,))
            connection.execute(
                "INSERT INTO documents_fts VALUES (?, ?, ?, ?, ?)",
                (
                    document_id,
                    normalize_arabic(document.title),
                    normalize_arabic(document.excerpt),
                    normalize_arabic(document.content),
                    normalize_arabic(" ".join(document.topics)),
                ),
            )
        return UpsertResult(document_id=document_id, created_version=created_version)

    def version_count(self, document_id: int) -> int:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS count FROM document_versions WHERE document_id = ?",
                (document_id,),
            ).fetchone()
        return int(row["count"])

    def upsert_document_asset(self, asset: DocumentAssetInput) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO document_assets (
                    document_id, url, media_type, sha256, byte_size, page_count,
                    extracted_with, ocr_used, storage_path, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(document_id, url, sha256) DO UPDATE SET
                    page_count=excluded.page_count,
                    extracted_with=excluded.extracted_with,
                    ocr_used=excluded.ocr_used,
                    storage_path=excluded.storage_path
                """,
                (
                    asset.document_id,
                    asset.url,
                    asset.media_type,
                    asset.sha256,
                    asset.byte_size,
                    asset.page_count,
                    asset.extracted_with,
                    int(asset.ocr_used),
                    asset.storage_path,
                    _iso(_now()),
                ),
            )
            if cursor.lastrowid:
                return int(cursor.lastrowid)
            row = connection.execute(
                """
                SELECT id FROM document_assets
                WHERE document_id=? AND url=? AND sha256=?
                """,
                (asset.document_id, asset.url, asset.sha256),
            ).fetchone()
            return int(row["id"])

    def reset_document_knowledge(self, document_id: int) -> None:
        with self.connect() as connection:
            connection.execute(
                "DELETE FROM document_entities WHERE document_id=?", (document_id,)
            )
            connection.execute(
                "DELETE FROM claim_evidence WHERE document_id=?", (document_id,)
            )

    def purge_orphan_knowledge(self) -> None:
        with self.connect() as connection:
            connection.execute(
                "DELETE FROM claims WHERE id NOT IN (SELECT claim_id FROM claim_evidence)"
            )
            connection.execute(
                "DELETE FROM entities WHERE id NOT IN (SELECT entity_id FROM document_entities)"
            )
            connection.execute(
                "DELETE FROM events WHERE id NOT IN (SELECT event_id FROM event_documents)"
            )

    def link_entity(
        self,
        document_id: int,
        canonical_name: str,
        entity_type: str,
        *,
        mentions: int,
        confidence: float,
        aliases: list[str] | None = None,
    ) -> int:
        normalized = normalize_arabic(canonical_name)
        now = _iso(_now())
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO entities (
                    canonical_name, normalized_name, entity_type, aliases_json, created_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(normalized_name, entity_type) DO UPDATE SET
                    canonical_name=excluded.canonical_name,
                    aliases_json=excluded.aliases_json
                """,
                (
                    canonical_name,
                    normalized,
                    entity_type,
                    json.dumps(aliases or [], ensure_ascii=False),
                    now,
                ),
            )
            entity = connection.execute(
                "SELECT id FROM entities WHERE normalized_name=? AND entity_type=?",
                (normalized, entity_type),
            ).fetchone()
            entity_id = int(entity["id"])
            connection.execute(
                """
                INSERT INTO document_entities (document_id, entity_id, mentions, confidence)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(document_id, entity_id) DO UPDATE SET
                    mentions=excluded.mentions, confidence=excluded.confidence
                """,
                (document_id, entity_id, mentions, confidence),
            )
        return entity_id

    def list_entities(
        self, *, document_id: int | None = None, limit: int = 100
    ) -> list[EntityRecord]:
        condition = "WHERE de.document_id=?" if document_id is not None else ""
        params: list[object] = [document_id] if document_id is not None else []
        params.append(max(1, min(limit, 500)))
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT e.*, SUM(de.mentions) AS mentions,
                       COUNT(DISTINCT de.document_id) AS document_count
                FROM entities e JOIN document_entities de ON de.entity_id=e.id
                {condition}
                GROUP BY e.id ORDER BY document_count DESC, mentions DESC
                LIMIT ?
                """,
                params,
            ).fetchall()
        return [
            EntityRecord(
                id=int(row["id"]),
                canonical_name=row["canonical_name"],
                entity_type=row["entity_type"],
                aliases=json.loads(row["aliases_json"]),
                mentions=int(row["mentions"]),
                document_count=int(row["document_count"]),
            )
            for row in rows
        ]

    def upsert_claim(
        self,
        document_id: int,
        claim_text: str,
        *,
        claim_type: str = "reported_statement",
        stance: str = "reports",
        confidence: float = 0.75,
    ) -> int:
        normalized = normalize_arabic(claim_text)
        now = _iso(_now())
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO claims (
                    claim_text, normalized_claim, claim_type, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(normalized_claim) DO UPDATE SET last_seen_at=excluded.last_seen_at
                """,
                (claim_text, normalized, claim_type, now, now),
            )
            claim = connection.execute(
                "SELECT id FROM claims WHERE normalized_claim=?", (normalized,)
            ).fetchone()
            claim_id = int(claim["id"])
            connection.execute(
                """
                INSERT INTO claim_evidence (
                    claim_id, document_id, stance, quote, confidence
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(claim_id, document_id) DO UPDATE SET
                    stance=excluded.stance, quote=excluded.quote,
                    confidence=excluded.confidence
                """,
                (claim_id, document_id, stance, claim_text, confidence),
            )
        return claim_id

    def list_claims(
        self, *, document_id: int | None = None, limit: int = 100
    ) -> list[ClaimRecord]:
        condition = "WHERE ce.document_id=?" if document_id is not None else ""
        params: list[object] = [document_id] if document_id is not None else []
        params.append(max(1, min(limit, 500)))
        with self.connect() as connection:
            claims = connection.execute(
                f"""
                SELECT DISTINCT c.* FROM claims c
                JOIN claim_evidence ce ON ce.claim_id=c.id
                {condition} ORDER BY c.last_seen_at DESC LIMIT ?
                """,
                params,
            ).fetchall()
            result: list[ClaimRecord] = []
            for claim in claims:
                evidence = connection.execute(
                    """
                    SELECT ce.*, d.title, d.canonical_url, s.name AS source_name
                    FROM claim_evidence ce
                    JOIN documents d ON d.id=ce.document_id
                    JOIN sources s ON s.id=d.source_id
                    WHERE ce.claim_id=? ORDER BY ce.confidence DESC
                    """,
                    (claim["id"],),
                ).fetchall()
                result.append(
                    ClaimRecord(
                        id=int(claim["id"]),
                        claim_text=claim["claim_text"],
                        claim_type=claim["claim_type"],
                        first_seen_at=_dt(claim["first_seen_at"]),
                        last_seen_at=_dt(claim["last_seen_at"]),
                        review_status=claim["review_status"],
                        evidence=[
                            ClaimEvidenceRecord(
                                document_id=int(row["document_id"]),
                                title=row["title"],
                                source_name=row["source_name"],
                                canonical_url=row["canonical_url"],
                                stance=row["stance"],
                                quote=row["quote"],
                                confidence=float(row["confidence"]),
                            )
                            for row in evidence
                        ],
                    )
                )
        return result

    def upsert_event_for_document(
        self,
        document_id: int,
        *,
        title: str,
        summary: str,
        occurred_at: datetime | None,
        event_type: str,
        location: str | None,
    ) -> int:
        now = _iso(_now())
        with self.connect() as connection:
            existing = connection.execute(
                "SELECT event_id FROM event_documents WHERE document_id=?",
                (document_id,),
            ).fetchone()
            if existing:
                event_id = int(existing["event_id"])
                connection.execute(
                    """
                    UPDATE events SET title=?, summary=?, occurred_at=?,
                        event_type=?, location=? WHERE id=?
                    """,
                    (title, summary, _iso(occurred_at), event_type, location, event_id),
                )
            else:
                cursor = connection.execute(
                    """
                    INSERT INTO events (
                        title, summary, occurred_at, event_type, location, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (title, summary, _iso(occurred_at), event_type, location, now),
                )
                event_id = int(cursor.lastrowid)
                connection.execute(
                    "INSERT INTO event_documents (event_id, document_id) VALUES (?, ?)",
                    (event_id, document_id),
                )
        return event_id

    def list_events(
        self, *, document_id: int | None = None, limit: int = 100
    ) -> list[EventRecord]:
        condition = "WHERE ed.document_id=?" if document_id is not None else ""
        params: list[object] = [document_id] if document_id is not None else []
        params.append(max(1, min(limit, 500)))
        with self.connect() as connection:
            events = connection.execute(
                f"""
                SELECT DISTINCT e.* FROM events e
                JOIN event_documents ed ON ed.event_id=e.id
                {condition}
                ORDER BY COALESCE(e.occurred_at, e.created_at) DESC LIMIT ?
                """,
                params,
            ).fetchall()
            result: list[EventRecord] = []
            for event in events:
                documents = connection.execute(
                    """
                    SELECT ed.role, d.id, d.title, d.canonical_url,
                           s.name AS source_name
                    FROM event_documents ed
                    JOIN documents d ON d.id=ed.document_id
                    JOIN sources s ON s.id=d.source_id
                    WHERE ed.event_id=?
                    """,
                    (event["id"],),
                ).fetchall()
                result.append(
                    EventRecord(
                        id=int(event["id"]),
                        title=event["title"],
                        summary=event["summary"],
                        occurred_at=_dt(event["occurred_at"]),
                        event_type=event["event_type"],
                        location=event["location"],
                        documents=[
                            EventDocumentRecord(
                                document_id=int(row["id"]),
                                title=row["title"],
                                source_name=row["source_name"],
                                canonical_url=row["canonical_url"],
                                role=row["role"],
                            )
                            for row in documents
                        ],
                    )
                )
        return result

    def upsert_embedding(
        self,
        document_id: int,
        *,
        provider: str,
        model: str,
        vector: list[float],
        content_hash: str,
    ) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO document_embeddings (
                    document_id, provider, model, dimensions, vector_json,
                    content_hash, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(document_id, provider, model) DO UPDATE SET
                    dimensions=excluded.dimensions,
                    vector_json=excluded.vector_json,
                    content_hash=excluded.content_hash,
                    created_at=excluded.created_at
                """,
                (
                    document_id,
                    provider,
                    model,
                    len(vector),
                    json.dumps(vector, separators=(",", ":")),
                    content_hash,
                    _iso(_now()),
                ),
            )

    def list_embeddings(
        self,
        *,
        provider: str,
        model: str,
        source_types: list[str] | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 20_000,
    ) -> list[tuple[int, list[float]]]:
        conditions = ["e.provider=?", "e.model=?"]
        params: list[object] = [provider, model]
        if source_types:
            placeholders = ",".join("?" for _ in source_types)
            conditions.append(f"s.source_type IN ({placeholders})")
            params.extend(source_types)
        if date_from:
            conditions.append(
                "date(COALESCE(d.event_at, d.published_at, d.archived_at)) >= date(?)"
            )
            params.append(date_from)
        if date_to:
            conditions.append(
                "date(COALESCE(d.event_at, d.published_at, d.archived_at)) <= date(?)"
            )
            params.append(date_to)
        params.append(max(1, min(limit, 50_000)))
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT e.document_id, e.vector_json FROM document_embeddings e
                JOIN documents d ON d.id=e.document_id
                JOIN sources s ON s.id=d.source_id
                WHERE {" AND ".join(conditions)}
                ORDER BY d.updated_at DESC LIMIT ?
                """,
                params,
            ).fetchall()
        return [(int(row["document_id"]), json.loads(row["vector_json"])) for row in rows]

    def list_document_ids(self, *, limit: int = 10_000) -> list[int]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT id FROM documents ORDER BY id LIMIT ?",
                (max(1, min(limit, 100_000)),),
            ).fetchall()
        return [int(row["id"]) for row in rows]

    def save_search(
        self,
        name: str,
        query: str,
        filters: dict[str, str | int | bool | list[str]] | None = None,
    ) -> SavedSearchRecord:
        name = name.strip()
        query = query.strip()
        if not 2 <= len(name) <= 200:
            raise ValueError("Saved search name must be between 2 and 200 characters")
        if not 2 <= len(query) <= 1_000:
            raise ValueError("Saved search query must be between 2 and 1000 characters")
        filters_json = json.dumps(filters or {}, ensure_ascii=False, separators=(",", ":"))
        now = _iso(_now())
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO saved_searches (name, query, filters_json, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    query=excluded.query, filters_json=excluded.filters_json
                """,
                (name, query, filters_json, now),
            )
            row = connection.execute(
                "SELECT * FROM saved_searches WHERE name=?", (name,)
            ).fetchone()
        return self._saved_search_record(row)

    def list_saved_searches(self, *, limit: int = 100) -> list[SavedSearchRecord]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM saved_searches ORDER BY created_at DESC LIMIT ?",
                (max(1, min(limit, 500)),),
            ).fetchall()
        return [self._saved_search_record(row) for row in rows]

    @staticmethod
    def _saved_search_record(row: sqlite3.Row) -> SavedSearchRecord:
        return SavedSearchRecord(
            id=int(row["id"]),
            name=row["name"],
            query=row["query"],
            filters=json.loads(row["filters_json"]),
            created_at=_dt(row["created_at"]),
            last_run_at=_dt(row["last_run_at"]),
        )

    def assign_story(self, document_id: int, threshold: float = 0.45) -> int:
        with self.connect() as connection:
            document = connection.execute(
                "SELECT title, COALESCE(published_at, archived_at) AS seen_at "
                "FROM documents WHERE id = ?",
                (document_id,),
            ).fetchone()
            if document is None:
                raise ValueError(f"Unknown document: {document_id}")
            existing = connection.execute(
                "SELECT story_id FROM story_documents WHERE document_id = ?",
                (document_id,),
            ).fetchone()
            if existing:
                return int(existing["story_id"])

            tokens = headline_tokens(document["title"])
            candidates = connection.execute(
                """
                SELECT * FROM stories
                WHERE datetime(last_seen_at) BETWEEN datetime(?, '-7 days')
                    AND datetime(?, '+7 days')
                ORDER BY last_seen_at DESC LIMIT 500
                """,
                (document["seen_at"], document["seen_at"]),
            ).fetchall()
            best = None
            best_score = threshold
            for candidate in candidates:
                score = similarity(tokens, frozenset(json.loads(candidate["tokens_json"])))
                if score >= best_score:
                    best, best_score = candidate, score

            seen_at = document["seen_at"]
            if best is None:
                cursor = connection.execute(
                    """
                    INSERT INTO stories (title, tokens_json, first_seen_at, last_seen_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        document["title"],
                        json.dumps(sorted(tokens), ensure_ascii=False),
                        seen_at,
                        seen_at,
                    ),
                )
                story_id = int(cursor.lastrowid)
            else:
                story_id = int(best["id"])
                connection.execute(
                    """
                    UPDATE stories SET first_seen_at=MIN(first_seen_at, ?),
                        last_seen_at=MAX(last_seen_at, ?) WHERE id=?
                    """,
                    (seen_at, seen_at, story_id),
                )
            connection.execute(
                "INSERT INTO story_documents (story_id, document_id) VALUES (?, ?)",
                (story_id, document_id),
            )
            return story_id

    def list_stories(self, limit: int = 20) -> list[StoryRecord]:
        with self.connect() as connection:
            stories = connection.execute(
                """
                SELECT st.*, COUNT(sd.document_id) AS document_count,
                    COUNT(DISTINCT d.source_id) AS source_count
                FROM stories st
                JOIN story_documents sd ON sd.story_id = st.id
                JOIN documents d ON d.id = sd.document_id
                GROUP BY st.id ORDER BY st.last_seen_at DESC LIMIT ?
                """,
                (max(1, min(limit, 100)),),
            ).fetchall()
            if not stories:
                return []
            story_ids = [int(story["id"]) for story in stories]
            placeholders = ",".join("?" for _ in story_ids)
            rows = connection.execute(
                f"""
                SELECT sd.story_id, d.id, d.title, d.canonical_url, d.published_at,
                    s.slug AS source_slug, s.name AS source_name
                FROM story_documents sd
                JOIN documents d ON d.id = sd.document_id
                JOIN sources s ON s.id = d.source_id
                WHERE sd.story_id IN ({placeholders})
                ORDER BY d.published_at DESC
                """,
                story_ids,
            ).fetchall()
        documents_by_story: dict[int, list[StoryDocument]] = {
            story_id: [] for story_id in story_ids
        }
        for row in rows:
            documents_by_story[int(row["story_id"])].append(
                StoryDocument(
                    document_id=int(row["id"]),
                    source_slug=row["source_slug"],
                    source_name=row["source_name"],
                    title=row["title"],
                    canonical_url=row["canonical_url"],
                    published_at=_dt(row["published_at"]),
                )
            )
        return [
            StoryRecord(
                id=int(story["id"]),
                title=story["title"],
                first_seen_at=_dt(story["first_seen_at"]),
                last_seen_at=_dt(story["last_seen_at"]),
                document_count=int(story["document_count"]),
                source_count=int(story["source_count"]),
                documents=documents_by_story[int(story["id"])],
            )
            for story in stories
        ]

    def search(
        self,
        query: str,
        *,
        limit: int = 20,
        source_types: list[str] | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[SearchResult]:
        limit = max(1, min(limit, 100))
        tokens = tokenize_query(query)
        conditions: list[str] = []
        params: list[object] = []
        join = ""
        rank = "0"
        if tokens:
            join = "JOIN documents_fts f ON f.document_id = d.id"
            conditions.append("documents_fts MATCH ?")
            params.append(" AND ".join(f'"{token}"' for token in tokens))
            rank = "bm25(documents_fts)"
        if source_types:
            placeholders = ",".join("?" for _ in source_types)
            conditions.append(f"s.source_type IN ({placeholders})")
            params.extend(source_types)
        if date_from:
            conditions.append("date(COALESCE(d.event_at, d.published_at, d.archived_at)) >= date(?)")
            params.append(date_from)
        if date_to:
            conditions.append("date(COALESCE(d.event_at, d.published_at, d.archived_at)) <= date(?)")
            params.append(date_to)
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        ordering = "rank, d.published_at DESC" if tokens else "d.published_at DESC"
        params.append(limit)
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT d.*, s.slug AS source_slug, s.name AS source_name,
                       s.source_type, {rank} AS rank
                FROM documents d
                JOIN sources s ON s.id = d.source_id
                {join}
                {where}
                ORDER BY {ordering}
                LIMIT ?
                """,
                params,
            ).fetchall()
        return [self._search_result(row) for row in rows]

    def get_document(self, document_id: int) -> DocumentRecord | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT d.*, s.slug AS source_slug, s.name AS source_name, s.source_type
                FROM documents d JOIN sources s ON s.id = d.source_id WHERE d.id = ?
                """,
                (document_id,),
            ).fetchone()
        if row is None:
            return None
        result = self._search_result(row)
        return DocumentRecord(**result.model_dump(), content=row["content"])

    def get_document_by_url(self, canonical_url: str) -> DocumentRecord | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT d.*, s.slug AS source_slug, s.name AS source_name, s.source_type
                FROM documents d JOIN sources s ON s.id = d.source_id
                WHERE d.canonical_url = ?
                """,
                (canonical_url,),
            ).fetchone()
        if row is None:
            return None
        result = self._search_result(row)
        return DocumentRecord(**result.model_dump(), content=row["content"])

    def timeline(self, query: str, limit: int = 100) -> list[TimelineItem]:
        results = self.search(query, limit=limit)
        items: list[TimelineItem] = []
        for result in results:
            if result.event_at:
                occurred_at, basis = result.event_at, "event_at"
            elif result.published_at:
                occurred_at, basis = result.published_at, "published_at"
            else:
                occurred_at, basis = result.archived_at, "archived_at"
            items.append(
                TimelineItem(
                    document_id=result.document_id,
                    occurred_at=occurred_at,
                    date_basis=basis,
                    title=result.title,
                    source_name=result.source_name,
                    citation=result.citation,
                )
            )
        return sorted(items, key=lambda item: item.occurred_at)

    def documents_on_date(self, value: str, limit: int = 100) -> list[SearchResult]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT d.*, s.slug AS source_slug, s.name AS source_name, s.source_type
                FROM documents d JOIN sources s ON s.id = d.source_id
                WHERE date(COALESCE(d.published_at, d.archived_at)) = date(?)
                ORDER BY COALESCE(d.published_at, d.archived_at) DESC LIMIT ?
                """,
                (value, max(1, min(limit, 100))),
            ).fetchall()
        return [self._search_result(row) for row in rows]

    @staticmethod
    def _source_record(row: sqlite3.Row) -> SourceRecord:
        return SourceRecord(
            slug=row["slug"],
            name=row["name"],
            url=row["url"],
            source_type=row["source_type"],
            ownership_type=row["ownership_type"],
            language=row["language"],
            feed_url=row["feed_url"],
            sitemap_url=row["sitemap_url"],
            collection_method=row["collection_method"],
            crawl_delay_seconds=float(row["crawl_delay_seconds"]),
            content_license=row["content_license"],
            robots_policy=row["robots_policy"],
            last_success_at=_dt(row["last_success_at"]),
            last_error_at=_dt(row["last_error_at"]),
            consecutive_failures=int(row["consecutive_failures"]),
            active=bool(row["active"]),
            health_status=row["health_status"],
            last_crawled_at=_dt(row["last_crawled_at"]),
            document_count=int(row["document_count"]),
        )

    @staticmethod
    def _search_result(row: sqlite3.Row) -> SearchResult:
        published_at = _dt(row["published_at"])
        archived_at = _dt(row["archived_at"])
        citation = Citation(
            title=row["title"],
            source_name=row["source_name"],
            url=row["canonical_url"],
            published_at=published_at,
            archived_at=archived_at,
        )
        return SearchResult(
            document_id=int(row["id"]),
            external_id=row["external_id"],
            source_slug=row["source_slug"],
            source_name=row["source_name"],
            source_type=row["source_type"],
            title=row["title"],
            excerpt=row["excerpt"],
            canonical_url=row["canonical_url"],
            published_at=published_at,
            event_at=_dt(row["event_at"]),
            archived_at=archived_at,
            document_type=row["document_type"],
            topics=json.loads(row["topics_json"]),
            citation=citation,
        )
