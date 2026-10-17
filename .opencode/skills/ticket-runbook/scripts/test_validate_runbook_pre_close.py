"""Tests for pre-close readiness of the working and durable ticket set."""

from __future__ import annotations

import contextlib
import io
import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    _filesystem_bytes,
    _patch_header,
    _pre_close_ticket_dir,
)


class ValidateRunbookPreCloseTests:
    def test_state_html_comment_is_not_unfilled_token_in_pre_close(
        self, tmp_path: Path
    ) -> None:
        comment = (
            "<!-- Query-budget is used/limit, default 6; "
            "exhausted when used equals limit. -->"
        )
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        state = ticket_dir / "analysis" / "state.md"
        state.write_text(
            state.read_text(encoding="utf-8") + "\n" + comment + "\n",
            encoding="utf-8",
        )
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 0

    def test_pre_close_rejects_leftover_fill_token_in_state(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        state = ticket_dir / "analysis" / "state.md"
        state.write_text(
            state.read_text(encoding="utf-8") + "\n<unfinished>\n",
            encoding="utf-8",
        )
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any(
            "UNFILLED-TOKEN: <unfinished>" in item for item in violations
        ), violations
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_pre_close(str(ticket_dir), str(tmp_path))
        assert result == 1
        assert "UNFILLED-TOKEN: <unfinished>" in stderr.getvalue()

    def test_pre_close_passes_pure_and_public_validation(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert vr.evaluate_pre_close(snapshot, []) == []
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 0

    def test_pre_close_is_byte_for_byte_non_mutating(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        before = _filesystem_bytes(ticket_dir)
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 0
        assert _filesystem_bytes(ticket_dir) == before

    def test_pre_close_rejects_zero_ticket_records(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (ticket_dir / "ticket_999999.md").unlink()
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_pre_close(str(ticket_dir), str(tmp_path))
        assert result == 1
        assert "PRE-CLOSE-0" in stderr.getvalue()

    def test_pre_close_rejects_multiple_ticket_records(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        source = ticket_dir / "ticket_999999.md"
        (ticket_dir / "ticket_111111.md").write_bytes(source.read_bytes())
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert snapshot["ticket_file_names"] == ["ticket_111111.md", "ticket_999999.md"]
        violations = vr.evaluate_pre_close(snapshot, [])
        assert any("PRE-CLOSE-1" in item for item in violations), violations
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_pre_close(str(ticket_dir), str(tmp_path))
        assert result == 1
        assert "PRE-CLOSE-1" in stderr.getvalue()

    def test_pre_close_rejects_missing_or_unexpected_analysis_file(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        analysis_dir = ticket_dir / "analysis"
        (analysis_dir / "02-investigate.md").unlink()
        (analysis_dir / "04-unexpected.md").write_text("unexpected", encoding="utf-8")
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any(
            "required analysis file missing: 02-investigate.md" in item
            for item in violations
        ), violations
        assert any(
            "unexpected analysis file present: 04-unexpected.md" in item
            for item in violations
        ), violations

    def test_pre_close_rejects_missing_response_draft(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (ticket_dir / "response-draft.md").unlink()
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert "PRE-CLOSE-3: response-draft.md not found" in violations

    @pytest.mark.parametrize(
        ("directory", "code"),
        [("screenshots", "PRE-CLOSE-4"), ("validations", "PRE-CLOSE-5")],
    )
    def test_pre_close_rejects_each_missing_durable_directory(
        self, tmp_path: Path, directory: str, code: str
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        shutil.rmtree(ticket_dir / directory)
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any(code in item for item in violations), violations

    def test_pre_close_rejects_unparseable_ticket_record(self, tmp_path: Path) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (ticket_dir / "ticket_999999.md").write_text(
            "not frontmatter", encoding="utf-8"
        )
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any("PRE-CLOSE-8" in item for item in violations), violations

    def test_pre_close_rejects_identification_register_mismatch(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path, verdict="exact", known="[P-001]")
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any("VERDICT-4" in item for item in violations), violations

    def test_pre_close_requires_completed_synthesize_state(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        _patch_header(ticket_dir / "analysis", {"Phase": "investigate"})
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert "PRE-CLOSE-10: state.md Phase must be 'synthesize'" in violations

    @pytest.mark.parametrize(
        ("case", "expected"),
        [
            ("token", "UNFILLED-TOKEN"),
            ("counter", "KILL-2"),
            ("section", "MISSING-SECTION"),
        ],
    )
    def test_pre_close_reuses_token_counter_and_section_checks(
        self, tmp_path: Path, case: str, expected: str
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        analysis_dir = ticket_dir / "analysis"
        if case == "token":
            target = analysis_dir / "03-synthesize.md"
            target.write_text(
                target.read_text(encoding="utf-8") + "\n<unfinished>\n",
                encoding="utf-8",
            )
        elif case == "counter":
            _patch_header(analysis_dir, {"Query-budget": "7/6"})
        else:
            target = analysis_dir / "03-synthesize.md"
            target.write_text(
                target.read_text(encoding="utf-8").replace("## Gate", "## Not Gate"),
                encoding="utf-8",
            )
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert any(expected in item for item in violations), violations

    def test_pre_close_accepts_authorized_raised_query_budget(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        _patch_header(ticket_dir / "analysis", {"Query-budget": "14/14"})
        violations = vr.evaluate_pre_close(vr.load_close_out_snapshot(ticket_dir), [])
        assert not any("KILL-2" in item for item in violations), violations
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 0

    def test_pre_close_rejects_query_budget_over_denominator(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        _patch_header(ticket_dir / "analysis", {"Query-budget": "7/6"})
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_pre_close(str(ticket_dir), str(tmp_path))
        assert result == 1
        assert "KILL-2" in stderr.getvalue()
