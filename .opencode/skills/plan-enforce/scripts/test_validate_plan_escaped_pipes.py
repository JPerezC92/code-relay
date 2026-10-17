"""Regression tests: escaped pipes inside table cells are not cell boundaries."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import VALID_PHASE, write_fixture  # noqa: E402

_COMMAND_ROW = "| Test Executor | `python3 sample.py` |"


class ValidatePlanEscapedPipesTests:
    def test_verify_table_escaped_pipe_stays_two_cells(self) -> None:
        content = VALID_PHASE.replace(
            _COMMAND_ROW,
            "| Test Executor | `grep -E 'a\\|b' sample.txt` |",
        )
        assert vp.check_phase_verify_table("phase-01-x.md", content) == []

    def test_verify_table_multiple_escaped_pipes_stay_two_cells(self) -> None:
        content = VALID_PHASE.replace(
            _COMMAND_ROW,
            "| Crucible 🔥 (Test Architect) | `sed 's/\\|/ /g; s/x\\|y/z/' f` |",
        )
        assert vp.check_phase_verify_table("phase-01-x.md", content) == []

    def test_phase_file_with_escaped_pipe_command_passes(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace(
                _COMMAND_ROW,
                "| Test Executor | `grep -E 'a\\|b' sample.txt` |",
            ),
        )
        assert vp.check_phase_file(phase) == []

    def test_unescaped_extra_pipe_still_splits_into_three_cells(self) -> None:
        content = VALID_PHASE.replace(
            _COMMAND_ROW,
            "| Test Executor | `python3 sample.py` | stray |",
        )
        assert vp.check_phase_verify_table("phase-01-x.md", content) == [
            "VERIFY-TABLE: phase-01-x.md data row 1 must have exactly two cells "
            "(`Executor`, `Command`)"
        ]
