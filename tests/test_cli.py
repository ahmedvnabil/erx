from egypt_research_mcp import cli


def test_cli_initializes_seeds_and_reports_status(tmp_path, capsys) -> None:
    database = str(tmp_path / "research.db")

    assert cli.main(["--database", database, "init"]) == 0
    assert cli.main(["--database", database, "seed"]) == 0
    assert cli.main(["--database", database, "status", "--json"]) == 0

    output = capsys.readouterr().out
    assert "Initialized" in output
    assert "Seeded" in output
    assert '"eipr"' in output


def test_cli_rejects_unknown_ingestion_source(tmp_path, capsys) -> None:
    result = cli.main(
        [
            "--database",
            str(tmp_path / "research.db"),
            "ingest",
            "--source",
            "missing-source",
        ]
    )

    assert result == 2
    assert "unknown_or_unconfigured_source" in capsys.readouterr().out


def test_cli_runs_selected_transport(tmp_path, monkeypatch) -> None:
    runs = []

    class FakeMCP:
        def run(self, transport):
            runs.append(transport)

    monkeypatch.setattr(cli, "create_mcp", lambda *args, **kwargs: FakeMCP())

    result = cli.main(
        [
            "--database",
            str(tmp_path / "research.db"),
            "serve",
            "--transport",
            "stdio",
        ]
    )

    assert result == 0
    assert runs == ["stdio"]


def test_cli_exits_cleanly_when_server_is_interrupted(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(cli, "create_app", lambda *args, **kwargs: object())
    monkeypatch.setattr(
        cli.uvicorn, "run", lambda *args, **kwargs: (_ for _ in ()).throw(KeyboardInterrupt)
    )

    result = cli.main(
        ["--database", str(tmp_path / "research.db"), "serve", "--transport", "http"]
    )

    assert result == 130


def test_ingest_parser_accepts_full_text_mode() -> None:
    args = cli.build_parser().parse_args(["ingest", "--full-text"])

    assert args.full_text is True


def test_cli_parser_exposes_collection_index_and_recovery_commands() -> None:
    ingest = cli.build_parser().parse_args(
        ["ingest", "--channel", "sitemap", "--max-urls", "25"]
    )
    index = cli.build_parser().parse_args(["index", "--provider", "local"])
    restore = cli.build_parser().parse_args(
        ["restore", "--input", "snapshot.db", "--yes"]
    )

    assert ingest.channel == "sitemap"
    assert ingest.max_urls == 25
    assert index.provider == "local"
    assert restore.yes is True
