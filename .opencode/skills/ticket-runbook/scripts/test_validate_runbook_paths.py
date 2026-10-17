"""Tests for ticket-relative path citations across pre-close and close-out."""

from __future__ import annotations

import contextlib
import io
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    REPO_RELATIVE_IMAGE,
    _cite_repo_relative_spelling,
    _pre_close_ticket_dir,
    _ticket_dir,
)


class ValidateRunbookPathCitationTests:
    def test_pre_close_rejects_missing_cited_path(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (ticket_dir / "screenshots" / "01_source_entity.png").unlink()
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any("PRE-CLOSE-7" in item for item in violations), violations

    def test_pre_close_rejects_cited_path_outside_ticket_root(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (tmp_path / "outside.png").write_text("x", encoding="utf-8")
        ticket_file = ticket_dir / "ticket_999999.md"
        ticket_file.write_text(
            ticket_file.read_text(encoding="utf-8").replace(
                "screenshots/01_source_entity.png", "../outside.png"
            ),
            encoding="utf-8",
        )
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any("PRE-CLOSE-6" in item for item in violations), violations

    def test_ticket_relative_cited_path_passes_pre_close(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert snapshot["unsafe_ticket_paths"] == []
        assert snapshot["missing_ticket_paths"] == []
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 0

    def test_ticket_relative_cited_path_passes_close_out(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert snapshot["missing_image_paths"] == []
        assert vr.validate_close_out(str(ticket_dir), str(ticket_dir)) == 0

    def test_repo_relative_spelling_fails_pre_close(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        _cite_repo_relative_spelling(tmp_path, ticket_dir / "ticket_999999.md")
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert (ticket_dir / "screenshots" / "01_source_entity.png").is_file()
        assert (tmp_path / REPO_RELATIVE_IMAGE).is_file()
        assert snapshot["unsafe_ticket_paths"] == []
        violations = vr.evaluate_pre_close(snapshot, [])
        assert any("PRE-CLOSE-7" in item for item in violations), violations
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_pre_close(str(ticket_dir), str(tmp_path))
        assert result == 1
        assert "PRE-CLOSE-7" in stderr.getvalue()

    def test_repo_relative_spelling_fails_close_out(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path)
        _cite_repo_relative_spelling(tmp_path, ticket_dir / "ticket_999999.md")
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert (ticket_dir / "screenshots" / "01_source_entity.png").is_file()
        assert (tmp_path / REPO_RELATIVE_IMAGE).is_file()
        violations = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-5" in item for item in violations), violations
        assert vr.validate_close_out(str(ticket_dir), str(tmp_path)) == 1

    def test_close_out_rejects_parent_escape_via_close_5(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path)
        (tmp_path / "outside.png").write_text("x", encoding="utf-8")
        ticket_file = ticket_dir / "ticket_999999.md"
        ticket_file.write_text(
            ticket_file.read_text(encoding="utf-8").replace(
                "screenshots/01_source_entity.png", "../outside.png"
            ),
            encoding="utf-8",
        )
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert snapshot["unsafe_ticket_paths"] == ["../outside.png"]
        violations = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-5" in item for item in violations), violations
        assert vr.validate_close_out(str(ticket_dir), str(tmp_path)) == 1

    def test_directory_citation_fails_pre_close_and_close_out(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (ticket_dir / "screenshots" / "frames").mkdir()
        ticket_file = ticket_dir / "ticket_999999.md"
        ticket_file.write_text(
            ticket_file.read_text(encoding="utf-8").replace(
                "screenshots/01_source_entity.png", "screenshots/frames"
            ),
            encoding="utf-8",
        )
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert (ticket_dir / "screenshots" / "frames").is_dir()
        assert snapshot["unsafe_ticket_paths"] == []
        pre_close = vr.evaluate_pre_close(snapshot, [])
        assert any("PRE-CLOSE-7" in item for item in pre_close), pre_close
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 1
        shutil.rmtree(ticket_dir / "analysis")
        (ticket_dir / "response-draft.md").unlink()
        close_out = vr.evaluate_close_out(vr.load_close_out_snapshot(ticket_dir))
        assert any("CLOSE-5" in item for item in close_out), close_out
        assert vr.validate_close_out(str(ticket_dir), str(tmp_path)) == 1

    def test_close_out_missing_image_path(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path, image_exists=False)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        violations = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-5" in item for item in violations), violations
