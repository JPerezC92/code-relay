"""Tests for strict validation of an explicitly selected analysis step."""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    STEP_FILES,
    _filled_step,
    _make_analysis,
)


class ValidateRunbookStepModeTests:
    def test_step_flag_on_present_step(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path, STEP_FILES)
        assert vr.validate_step(str(analysis_dir), "investigate") == 0

    def test_filled_investigate_keeps_sidecar_command_examples(
        self, tmp_path: Path
    ) -> None:
        sidecar_cli = (
            "<python> .opencode/skills/query-verification/scripts/"
            "query_verification.py validate --query-root <sidecar-parent-dir> "
            "--sidecar <sidecar-path>"
        )
        analysis_dir = _make_analysis(tmp_path, phase="investigate")
        investigate = analysis_dir / "02-investigate.md"
        investigate.write_text(
            _filled_step("02-investigate.md") + "\n" + sidecar_cli + "\n",
            encoding="utf-8",
        )
        assert vr.validate_step(str(analysis_dir), "investigate") == 0

    def test_unfilled_output_fill_fails_step_investigate(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path, phase="investigate")
        investigate = analysis_dir / "02-investigate.md"
        investigate.write_text(
            _filled_step("02-investigate.md") + "\n<fill>\n",
            encoding="utf-8",
        )
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_step(str(analysis_dir), "investigate")
        assert result == 1
        assert "UNFILLED-TOKEN: <fill>" in stderr.getvalue()

    def test_step_flag_on_missing_step(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path, STEP_FILES[:1])
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_step(str(analysis_dir), "synthesize")
        assert result == 1
        assert "STEP-NOT-WRITTEN" in stderr.getvalue()

    def test_completed_step_token_fails_strict_validation(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path, phase="identify")
        identify = analysis_dir / "01-identify.md"
        identify.write_text(
            identify.read_text(encoding="utf-8") + "\n<unfilled-completed>\n",
            encoding="utf-8",
        )
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vr.validate_step(str(analysis_dir), "identify")
        assert result == 1
        assert stderr.getvalue() == (
            "UNFILLED-TOKEN: <unfilled-completed> in 01-identify.md\n"
        )
