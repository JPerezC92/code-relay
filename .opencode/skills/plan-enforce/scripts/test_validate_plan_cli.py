"""Tests for plan-directory and single-file validation entry points."""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import (  # noqa: E402
    PHASE_AWARE_PLAN,
    PHASE_ONE,
    PHASE_TWO,
    VALID_PHASE,
    VALID_PLAN,
    write_fixture,
)


class ValidatePlanCliTests:
    def test_validate_plan_dir_valid_fixture_outputs_success(
        self, tmp_path: Path
    ) -> None:
        write_fixture(tmp_path, "plan.md", VALID_PLAN)
        write_fixture(tmp_path, "phase-01-owner.md", VALID_PHASE)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            result = vp.validate_plan_dir(str(tmp_path), stories_dir=None)
        assert result == 0
        assert stdout.getvalue() == f"ok  plan: {tmp_path}  phases: 1\n"

    def test_validate_plan_dir_missing_plan_outputs_exact_diagnostic(
        self, tmp_path: Path
    ) -> None:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vp.validate_plan_dir(str(tmp_path), stories_dir=None)
        assert result == 1
        assert stderr.getvalue() == f"MISSING-FILE: {tmp_path / 'plan.md'} not found\n"

    def test_validate_plan_dir_unfilled_date_outputs_exact_diagnostic(
        self, tmp_path: Path
    ) -> None:
        write_fixture(
            tmp_path,
            "plan.md",
            VALID_PLAN.replace("2026-08-20 18:37", "YYYY-MM-DD"),
        )
        write_fixture(tmp_path, "phase-01-owner.md", VALID_PHASE)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vp.validate_plan_dir(str(tmp_path), stories_dir=None)
        assert result == 1
        assert stderr.getvalue() == "UNFILLED-TOKEN: YYYY-MM-DD\n"

    def test_validate_single_file_valid_fixture_outputs_success(
        self, tmp_path: Path
    ) -> None:
        plan_file = write_fixture(tmp_path, "plan.md", VALID_PLAN)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            result = vp.validate_single_file(str(plan_file))
        assert result == 0
        assert stdout.getvalue() == f"ok  single-file plan: {plan_file}\n"

    def test_validate_single_file_invalid_fixture_outputs_diagnostic(
        self, tmp_path: Path
    ) -> None:
        plan_file = write_fixture(
            tmp_path,
            "plan.md",
            VALID_PLAN.replace("> **Status:** active", "> **Status:** bogus"),
        )
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vp.validate_single_file(str(plan_file))
        assert result == 1
        assert stderr.getvalue() == (
            "STATUS: Status value 'bogus' not in allowed set "
            "(['active', 'completed'])\n"
        )

    def test_validate_plan_dir_phase_aware_valid_fixture_passes(
        self, tmp_path: Path
    ) -> None:
        write_fixture(tmp_path, "plan.md", PHASE_AWARE_PLAN)
        write_fixture(tmp_path, "phase-01-owner.md", PHASE_ONE)
        write_fixture(tmp_path, "phase-02-owner.md", PHASE_TWO)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            result = vp.validate_plan_dir(str(tmp_path), stories_dir=None)
        assert result == 0
        assert stdout.getvalue() == f"ok  plan: {tmp_path}  phases: 2\n"
