"""Tests for runbook scaffold and working-analysis structure validation."""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    STEP_FILES,
    _copy_initialized_scaffold,
    _fill_template_identify,
    _make_analysis,
    _patch_header,
    _state_md,
)


class ValidateRunbookStructureTests:
    def test_copied_scaffold_passes_scaffold_validation(self, tmp_path: Path) -> None:
        analysis_dir = _copy_initialized_scaffold(tmp_path)
        assert vr.validate_scaffold(str(analysis_dir)) == 0

    def test_copied_scaffold_rejects_malformed_phase(self, tmp_path: Path) -> None:
        analysis_dir = _copy_initialized_scaffold(tmp_path)
        _patch_header(analysis_dir, {"Phase": "not-a-phase"})
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_scaffold(str(analysis_dir))
        assert result == 1
        assert stderr.getvalue() == (
            "PHASE-ERROR: Phase value 'not-a-phase' not in allowed set "
            "(identify, investigate, synthesize)\n"
        )

    def test_copied_scaffold_rejects_missing_step(self, tmp_path: Path) -> None:
        analysis_dir = _copy_initialized_scaffold(tmp_path)
        (analysis_dir / "02-investigate.md").unlink()
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_scaffold(str(analysis_dir))
        assert result == 1
        assert "MISSING-STEP: 02-investigate.md" in stderr.getvalue()

    def test_default_ignores_future_template_tokens(self, tmp_path: Path) -> None:
        analysis_dir = _copy_initialized_scaffold(tmp_path)
        _fill_template_identify(analysis_dir)
        assert vr.validate(str(analysis_dir)) == 0

    def test_default_rejects_structural_defect_in_present_future_step(
        self, tmp_path: Path
    ) -> None:
        analysis_dir = _copy_initialized_scaffold(tmp_path)
        _fill_template_identify(analysis_dir)
        investigate = analysis_dir / "02-investigate.md"
        investigate.write_text(
            investigate.read_text(encoding="utf-8").replace(
                "## Gate", "## Requirements", 1
            ),
            encoding="utf-8",
        )
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate(str(analysis_dir))
        assert result == 1
        assert stderr.getvalue() == (
            "MISSING-SECTION: 02-investigate.md is missing ## Gate\n"
        )

    def test_completed_step_token_fails_default_validation(
        self, tmp_path: Path
    ) -> None:
        analysis_dir = _copy_initialized_scaffold(tmp_path)
        _fill_template_identify(analysis_dir)
        identify = analysis_dir / "01-identify.md"
        identify.write_text(
            identify.read_text(encoding="utf-8") + "\n<unfilled-completed>\n",
            encoding="utf-8",
        )
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate(str(analysis_dir))
        assert result == 1
        assert stderr.getvalue() == (
            "UNFILLED-TOKEN: <unfilled-completed> in 01-identify.md\n"
        )

    def test_valid_analysis_passes(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        assert vr.validate(str(analysis_dir)) == 0

    def test_missing_step_file(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        (analysis_dir / "02-investigate.md").unlink()
        violations, warnings = vr.check_step_files_exist(
            vr.load_step_file_contents(analysis_dir), str(analysis_dir)
        )
        assert violations == [
            "MISSING-STEP: 02-investigate.md not found in " f"{analysis_dir}"
        ]
        assert warnings == []

    def test_missing_section_in_step_file(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        path = analysis_dir / "02-investigate.md"
        path.write_text(
            path.read_text(encoding="utf-8").replace("## Gate", "## Not Gate"),
            encoding="utf-8",
        )
        findings = vr.check_step_files_have_required_sections(
            vr.load_step_file_contents(analysis_dir)
        )
        assert findings == [("02-investigate.md", "## Gate")]

    def test_unfilled_token_flagged(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        path = analysis_dir / "01-identify.md"
        path.write_text(
            path.read_text(encoding="utf-8") + "\n<fill>\n", encoding="utf-8"
        )
        findings = vr.check_step_files_have_required_sections(
            vr.load_step_file_contents(analysis_dir)
        )
        assert findings == [("01-identify.md", "UNFILLED-TOKEN: <fill>")]

    def test_state_html_comment_is_not_unfilled_token(self) -> None:
        comment = (
            "<!-- Query-budget is used/limit, default 6; "
            "exhausted when used equals limit. -->"
        )
        assert vr._check_step_body_fill_markers(
            _state_md() + "\n" + comment + "\n", "state.md"
        ) == []

    def test_leftover_fill_token_in_state_is_flagged(self) -> None:
        assert vr._check_step_body_fill_markers(
            _state_md() + "\n<unfinished>\n", "state.md"
        ) == [("state.md", "UNFILLED-TOKEN: <unfinished>")]

    def test_partial_analysis_default_passes_with_warning(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path, STEP_FILES[:2], phase="investigate")
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate(str(analysis_dir))
        assert result == 0
        assert "INCOMPLETE-ANALYSIS" in stderr.getvalue()
