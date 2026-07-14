from egypt_research_mcp.models import DocumentInput, SourceInput
from egypt_research_mcp.store import ResearchStore


def test_sqlite_backup_and_restore_round_trip(tmp_path) -> None:
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()
    store.upsert_source(
        SourceInput(
            slug="backup-source",
            name="مصدر النسخ",
            url="https://example.org",
            source_type="official",
            ownership_type="government",
        )
    )
    document = store.upsert_document(
        DocumentInput(
            external_id="backup:1",
            source_slug="backup-source",
            canonical_url="https://example.org/1",
            title="وثيقة محفوظة",
            content="محتوى يجب ألا يضيع",
        )
    )
    backup_path = store.backup(tmp_path / "backups" / "snapshot.db")
    with store.connect() as connection:
        connection.execute("DELETE FROM documents WHERE id=?", (document.document_id,))

    safety_path = store.restore(backup_path)

    assert safety_path.exists()
    assert store.get_document(document.document_id).title == "وثيقة محفوظة"
    assert store.verify_backup(backup_path) == "ok"


def test_backup_rejects_corrupt_database(tmp_path) -> None:
    corrupt = tmp_path / "corrupt.db"
    corrupt.write_text("not sqlite")
    store = ResearchStore(tmp_path / "research.db")
    store.initialize()

    try:
        store.restore(corrupt)
    except ValueError as error:
        assert "valid SQLite" in str(error)
    else:
        raise AssertionError("corrupt backup was accepted")
