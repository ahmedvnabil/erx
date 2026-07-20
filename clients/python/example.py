"""Runnable example for the ERX Python client.

Run with:

    python3 example.py

It hits the public read-only endpoints at https://erx-mcp.zad.tools .
"""

from __future__ import annotations

from erx_client import ErxClient, ErxError


def main() -> None:
    client = ErxClient()  # defaults to https://erx-mcp.zad.tools

    try:
        status = client.status()
        print("Service status:", status.get("status"))

        hits = client.search("قانون العمل", mode="hybrid", limit=5)
        print(f"\nSearch returned {hits['count']} result(s):")
        for result in hits["results"]:
            print(f"  [{result['document_id']}] {result['title']}")
            print(f"      source: {result['source_name']} ({result['source_type']})")
            print(f"      url:    {result['canonical_url']}")

        if hits["results"]:
            first_id = hits["results"][0]["document_id"]
            document = client.get_document(first_id)["document"]
            print(f"\nDocument {first_id}: {document['title']}")

        sources = client.list_sources()
        print(f"\nArchive tracks {sources['count']} source(s).")

        datasets = client.live_datasets()
        print(f"Live datasets available: {datasets['count']}")

        references = client.export_references("قانون العمل", format="ris")
        print(f"\nExported {len(references)} bytes of RIS references.")

    except ErxError as error:
        print(f"API error (status {error.status}): {error.body}")


if __name__ == "__main__":
    main()
