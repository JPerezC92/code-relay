"""Tests for durable ticket-set close-out readiness and collapse."""

from __future__ import annotations

import contextlib
import io
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import _pre_close_ticket_dir, _ticket_dir  # noqa: E402


class ValidateRunbookCloseOutTests:
    def test_close_out_pass(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert vr.evaluate_close_out(snapshot) == []
        assert vr.validate_close_out(str(ticket_dir), str(ticket_dir)) == 0

    def test_close_out_working_files_remain(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path, with_working=True)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        violations = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-1" in item for item in violations), violations
        assert vr.validate_close_out(str(ticket_dir), str(ticket_dir)) == 1

    def test_close_out_response_draft_remains(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path, with_draft=True)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        violations = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-2" in item for item in violations), violations

    def test_close_out_missing_durable_dirs(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path, with_dirs=False)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        violations = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-3" in item for item in violations), violations
        assert any("CLOSE-4" in item for item in violations), violations

    def test_close_out_missing_ticket(self, tmp_path: Path) -> None:
        ticket_dir = tmp_path / "ticket"
        ticket_dir.mkdir()
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert any("CLOSE-0" in item for item in vr.evaluate_close_out(snapshot))
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_close_out(str(ticket_dir), str(ticket_dir))
        assert result == 2
        assert "CLOSE-SKIPPED" in stderr.getvalue()

    def test_close_out_rejects_multiple_ticket_records(self, tmp_path: Path) -> None:
        ticket_dir = _ticket_dir(tmp_path)
        source = ticket_dir / "ticket_999999.md"
        (ticket_dir / "ticket_111111.md").write_bytes(source.read_bytes())
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        violations = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-6" in item for item in violations), violations
        assert vr.validate_close_out(str(ticket_dir), str(tmp_path)) == 1

    def test_close_out_fails_before_and_passes_after_collapse(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        assert vr.validate_close_out(str(ticket_dir), str(tmp_path)) == 1
        shutil.rmtree(ticket_dir / "analysis")
        (ticket_dir / "response-draft.md").unlink()
        assert vr.validate_close_out(str(ticket_dir), str(tmp_path)) == 0
