# Operations

## Production sequence

1. Copy `.env.example` to `.env` and set the public reverse proxy separately.
2. Build with `docker compose build`.
3. Initialize and seed with `docker compose run --rm egypt-research egypt-research-mcp seed`.
4. Run the first collection and local knowledge index.
5. Start the service behind HTTPS with `docker compose up -d`.
6. Monitor `/readyz` and scrape `/metrics`.

## Collection schedule

Run `deploy/collect-and-index.sh` every six hours. The script creates and verifies a
SQLite online backup before collection, then refreshes the local knowledge index.
The included systemd timer is an example for a Linux host and must use the actual
checkout path.

## Recovery

```bash
egypt-research-mcp verify-backup --input backups/snapshot.db
egypt-research-mcp --database data/research.db restore --input backups/snapshot.db --yes
```

Restore always creates a `pre-restore` safety copy of the live database first.

## Reverse proxy

Terminate TLS at Caddy, Traefik, or nginx. Proxy `/`, `/api/v1/*`, and `/mcp` to
port 8000. Keep `/metrics` private to the monitoring network. For multiple app
replicas, replace the in-process rate limiter with a shared proxy or Redis limit
and place SQLite on a single writer node.

## Public release

The tag workflow creates signed-by-GitHub release artifacts. Publishing to PyPI,
GHCR, and the official MCP Registry should only happen after the public repository,
package namespace, and production HTTPS endpoint are fixed; registry versions are
immutable.
