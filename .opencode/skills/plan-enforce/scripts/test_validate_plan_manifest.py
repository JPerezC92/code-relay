"""Tests for equality between plan manifest and phase Writes paths."""

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
    phase_snapshot,
    write_fixture,
)


class ValidatePlanManifestTests:
    def test_manifest_equality_valid_passes(self) -> None:
        snapshots = [
            phase_snapshot("phase-01-owner.md", PHASE_ONE),
            phase_snapshot("phase-02-owner.md", PHASE_TWO),
        ]
        assert vp.check_manifest_equality(PHASE_AWARE_PLAN, snapshots) == []

    def test_manifest_missing_phase_path_flagged(self) -> None:
        bad_plan = PHASE_AWARE_PLAN.replace("| Modify | `src/b.py` |\n", "")
        snapshots = [
            phase_snapshot("phase-01-owner.md", PHASE_ONE),
            phase_snapshot("phase-02-owner.md", PHASE_TWO),
        ]
        assert vp.check_manifest_equality(bad_plan, snapshots) == [
            "MANIFEST: phase Writes path `src/b.py` is missing from the "
            "write/delete manifest"
        ]

    def test_manifest_extra_path_flagged(self) -> None:
        bad_plan = PHASE_AWARE_PLAN.replace(
            "| Modify | `src/b.py` |",
            "| Modify | `src/b.py` |\n| Add | `src/z.py` |",
        )
        snapshots = [
            phase_snapshot("phase-01-owner.md", PHASE_ONE),
            phase_snapshot("phase-02-owner.md", PHASE_TWO),
        ]
        assert vp.check_manifest_equality(bad_plan, snapshots) == [
            "MANIFEST: manifest path `src/z.py` is not declared in any phase Writes"
        ]

    def test_manifest_unknown_action_flagged(self) -> None:
        bad_plan = PHASE_AWARE_PLAN.replace(
            "| Modify | `src/a.py` |", "| Remove | `src/a.py` |"
        )
        snapshots = [
            phase_snapshot("phase-01-owner.md", PHASE_ONE),
            phase_snapshot("phase-02-owner.md", PHASE_TWO),
        ]
        assert vp.check_manifest_equality(bad_plan, snapshots) == [
            "MANIFEST: manifest row 1 action 'Remove' not in "
            "['Add', 'Delete', 'Modify']"
        ]

    def test_manifest_none_writes_need_no_manifest_section(self) -> None:
        plan = VALID_PLAN.replace(
            "## Write/delete manifest\n\n| Action | Path |\n|---|---|\n\n", ""
        )
        snapshots = [phase_snapshot("phase-01-owner.md", VALID_PHASE)]
        assert vp.check_manifest_equality(plan, snapshots) == []

    def test_validate_plan_dir_manifest_drift_fails(self, tmp_path: Path) -> None:
        write_fixture(
            tmp_path,
            "plan.md",
            PHASE_AWARE_PLAN.replace("| Modify | `src/b.py` |\n", ""),
        )
        write_fixture(tmp_path, "phase-01-owner.md", PHASE_ONE)
        write_fixture(tmp_path, "phase-02-owner.md", PHASE_TWO)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = vp.validate_plan_dir(str(tmp_path), stories_dir=None)
        assert result == 1
        assert stderr.getvalue() == (
            "MANIFEST: phase Writes path `src/b.py` is missing from the "
            "write/delete manifest\n"
        )
