"""Tests for phase-file structure and its canonical verification table."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import VALID_PHASE, write_fixture  # noqa: E402


class ValidatePlanPhaseStructureTests:
    def test_valid_phase_file_passes(self, tmp_path: Path) -> None:
        phase = write_fixture(tmp_path, "phase-01-x.md", VALID_PHASE)
        assert vp.check_phase_file(phase) == []

    def test_missing_phase_file_returns_exact_diagnostic(self, tmp_path: Path) -> None:
        phase = tmp_path / "phase-01-owner.md"
        assert vp.check_phase_file(phase) == [f"MISSING-FILE: {phase} not found"]

    def test_missing_phase_section_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path, "phase-01-x.md", VALID_PHASE.replace("## Gate", "## Not Gate")
        )
        assert vp.check_phase_file(phase) == [
            "MISSING-SECTION: phase-01-x.md is missing ## Gate"
        ]

    def test_missing_phase_label_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace("> **Owner:**", "> **NotOwner:**"),
        )
        assert vp.check_phase_file(phase) == [
            "MISSING-LABEL: phase-01-x.md is missing **Owner:**"
        ]

    def test_missing_verify_commands_section_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace("## Verify commands", "## Not Verify"),
        )
        assert vp.check_phase_file(phase) == [
            "MISSING-SECTION: phase-01-x.md is missing ## Verify commands",
            "VERIFY-TABLE: phase-01-x.md is missing the ## Verify commands section",
        ]

    def test_verify_table_absent_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace(
                "| Executor | Command |\n|---|---|\n"
                "| Test Executor | `python3 sample.py` |\n",
                "",
            ),
        )
        assert vp.check_phase_file(phase) == [
            "VERIFY-TABLE: phase-01-x.md has no Executor/Command table"
        ]

    def test_verify_table_wrong_header_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace("| Executor | Command |", "| Runner | Command |"),
        )
        assert vp.check_phase_file(phase) == [
            "VERIFY-TABLE: phase-01-x.md table header must be exactly "
            "`Executor` then `Command`"
        ]

    def test_verify_table_extra_column_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace(
                "| Executor | Command |", "| Executor | Command | Notes |"
            ),
        )
        assert vp.check_phase_file(phase) == [
            "VERIFY-TABLE: phase-01-x.md table header must be exactly "
            "`Executor` then `Command`"
        ]

    def test_verify_table_header_only_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace("| Test Executor | `python3 sample.py` |\n", ""),
        )
        assert vp.check_phase_file(phase) == [
            "VERIFY-TABLE: phase-01-x.md table has no data rows"
        ]

    def test_verify_table_empty_executor_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace(
                "| Test Executor | `python3 sample.py` |",
                "|  | `python3 sample.py` |",
            ),
        )
        assert vp.check_phase_file(phase) == [
            "VERIFY-TABLE: phase-01-x.md data row 1 has an empty `Executor` cell"
        ]

    def test_verify_table_empty_command_flagged(self, tmp_path: Path) -> None:
        phase = write_fixture(
            tmp_path,
            "phase-01-x.md",
            VALID_PHASE.replace(
                "| Test Executor | `python3 sample.py` |", "| Test Executor |  |"
            ),
        )
        assert vp.check_phase_file(phase) == [
            "VERIFY-TABLE: phase-01-x.md data row 1 has an empty `Command` cell"
        ]
