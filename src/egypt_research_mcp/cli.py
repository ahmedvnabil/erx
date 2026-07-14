from __future__ import annotations

import argparse
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Sequence

import uvicorn

from .bootstrap import seed_catalog
from .collection import SitemapIngestor
from .ingestion import FeedIngestor
from .knowledge import KnowledgeIndexer
from .retrieval import GeminiEmbeddingProvider, LocalEmbeddingProvider
from .server import create_mcp
from .store import ResearchStore
from .web import create_app


def _database_path(value: str | None) -> Path:
    return Path(value or os.getenv("EGYPT_RESEARCH_DB", "data/research.db"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="egypt-research-mcp")
    parser.add_argument("--database", help="SQLite database path")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init", help="Initialize the database")
    commands.add_parser("seed", help="Seed the Egyptian source catalog")

    ingest = commands.add_parser("ingest", help="Archive configured RSS feeds")
    ingest.add_argument("--source", action="append", help="Source slug; repeat as needed")
    ingest.add_argument(
        "--full-text", action="store_true", help="Fetch article pages when permitted"
    )
    ingest.add_argument(
        "--channel", choices=("auto", "rss", "sitemap"), default="auto"
    )
    ingest.add_argument("--max-urls", type=int, default=100)

    index = commands.add_parser("index", help="Build entities, events, claims and embeddings")
    index.add_argument("--provider", choices=("local", "gemini"), default="local")
    index.add_argument("--limit", type=int, default=10_000)

    backup = commands.add_parser("backup", help="Create and verify an online SQLite backup")
    backup.add_argument("--output", help="Backup database path")

    verify = commands.add_parser("verify-backup", help="Run SQLite integrity checks")
    verify.add_argument("--input", required=True, help="Backup database path")

    restore = commands.add_parser("restore", help="Restore a verified SQLite backup")
    restore.add_argument("--input", required=True, help="Backup database path")
    restore.add_argument("--yes", action="store_true", help="Confirm replacement")

    status = commands.add_parser("status", help="Print source collection status")
    status.add_argument("--json", action="store_true", help="Emit JSON")

    serve = commands.add_parser("serve", help="Run the MCP server")
    serve.add_argument("--transport", choices=("stdio", "http"), default="http")
    serve.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"))
    serve.add_argument("--port", type=int, default=int(os.getenv("PORT", "8000")))
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    store = ResearchStore(_database_path(args.database))

    if args.command == "backup":
        output = args.output or (
            "backups/research-"
            + datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
            + ".db"
        )
        path = store.backup(output)
        print(json.dumps({"status": "ok", "backup": str(path)}))
        return 0
    if args.command == "verify-backup":
        result = store.verify_backup(args.input)
        print(json.dumps({"status": result, "backup": args.input}))
        return 0
    if args.command == "restore":
        if not args.yes:
            print(json.dumps({"error": "restore_requires_yes"}))
            return 2
        safety_path = store.restore(args.input)
        print(
            json.dumps(
                {"status": "ok", "restored": args.input, "safety_backup": str(safety_path)}
            )
        )
        return 0

    store.initialize()

    if args.command == "init":
        print(f"Initialized {store.path}")
        return 0
    if args.command == "seed":
        count = seed_catalog(store)
        print(f"Seeded {count} sources")
        return 0
    if args.command == "ingest":
        seed_catalog(store)
        selected = set(args.source or [])
        def configured(source) -> bool:
            if args.channel == "rss":
                return bool(source.feed_url)
            if args.channel == "sitemap":
                return bool(source.sitemap_url)
            return bool(source.feed_url or source.sitemap_url)

        sources = [
            source
            for source in store.list_sources()
            if source.active and configured(source) and (not selected or source.slug in selected)
        ]
        if selected:
            known = {source.slug for source in sources}
            missing = selected - known
            if missing:
                print(
                    json.dumps(
                        {"error": "unknown_or_unconfigured_source", "sources": sorted(missing)},
                        ensure_ascii=False,
                    )
                )
                return 2
        feed_ingestor = FeedIngestor(store, full_text=args.full_text)
        sitemap_ingestor = SitemapIngestor(store)
        reports = []
        for source in sources:
            if args.channel in {"auto", "rss"} and source.feed_url:
                reports.append(feed_ingestor.ingest_source(source.slug))
            if args.channel in {"auto", "sitemap"} and source.sitemap_url:
                reports.append(
                    sitemap_ingestor.ingest_source(source.slug, max_urls=args.max_urls)
                )
        print(json.dumps([report.model_dump(mode="json") for report in reports], ensure_ascii=False, indent=2))
        return 1 if any(report.status == "failed" for report in reports) else 0
    if args.command == "index":
        if args.provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY", "")
            if not api_key:
                print(json.dumps({"error": "GEMINI_API_KEY_is_required"}))
                return 2
            provider = GeminiEmbeddingProvider(api_key=api_key)
        else:
            provider = LocalEmbeddingProvider()
        reports = KnowledgeIndexer(store, embedding_provider=provider).backfill(
            limit=args.limit
        )
        print(
            json.dumps(
                {
                    "indexed": len(reports),
                    "entities": sum(report.entities for report in reports),
                    "claims": sum(report.claims for report in reports),
                    "events": sum(report.events for report in reports),
                    "provider": provider.provider,
                    "model": provider.model,
                },
                ensure_ascii=False,
            )
        )
        return 0
    if args.command == "status":
        sources = store.list_sources()
        data = [source.model_dump(mode="json") for source in sources]
        if args.json:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            for source in sources:
                print(
                    f"{source.slug:30} {source.health_status:10} "
                    f"{source.document_count:5} {source.name}"
                )
        return 0
    if args.command == "serve":
        seed_catalog(store)
        try:
            if args.transport == "stdio":
                create_mcp(store, host=args.host, port=args.port).run(transport="stdio")
            else:
                app = create_app(store, host=args.host, port=args.port)
                uvicorn.run(app, host=args.host, port=args.port)
            return 0
        except KeyboardInterrupt:
            return 130
    raise RuntimeError(f"Unsupported command: {args.command}")
