"""Tests for plan goal-to-phase dispatch tracing."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import validate_plan as vp  # noqa: E402
from _validate_plan_testkit import PHASE_AWARE_PLAN  # noqa: E402


class ValidatePlanGoalTraceTests:
    def test_goal_trace_valid_passes(self) -> None:
        assert vp.check_goal_trace(
            PHASE_AWARE_PLAN, ["phase-01-owner.md", "phase-02-owner.md"]
        ) == []

    def test_goal_trace_uncited_goal_flagged(self) -> None:
        bad = PHASE_AWARE_PLAN.replace("| out two | G2 |", "| out two | G1 |")
        assert vp.check_goal_trace(
            bad, ["phase-01-owner.md", "phase-02-owner.md"]
        ) == ["GOAL-TRACE: goal `G2` is not cited by any phase"]

    def test_goal_trace_unknown_goal_flagged(self) -> None:
        bad = PHASE_AWARE_PLAN.replace("| out two | G2 |", "| out two | G9 |")
        assert vp.check_goal_trace(
            bad, ["phase-01-owner.md", "phase-02-owner.md"]
        ) == [
            "GOAL-TRACE: dispatch row 2 cites unknown goal `G9`",
            "GOAL-TRACE: goal `G2` is not cited by any phase",
        ]

    def test_goal_trace_missing_phase_runbook_flagged(self) -> None:
        assert vp.check_goal_trace(PHASE_AWARE_PLAN, ["phase-01-owner.md"]) == [
            "GOAL-TRACE: dispatch row 2 references missing phase file "
            "`phase-02-owner.md`"
        ]

    def test_goal_trace_unreferenced_phase_file_flagged(self) -> None:
        assert vp.check_goal_trace(
            PHASE_AWARE_PLAN,
            ["phase-01-owner.md", "phase-02-owner.md", "phase-03-owner.md"],
        ) == [
            "GOAL-TRACE: phase file `phase-03-owner.md` is not referenced "
            "by the phase index"
        ]
