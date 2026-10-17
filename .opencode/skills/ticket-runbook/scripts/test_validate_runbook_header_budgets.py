"""Tests for runbook state-header enums, counters, and kill-switch budgets."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    _make_analysis,
    _patch_header,
)


class ValidateRunbookHeaderBudgetTests:
    def test_hypothesis_cap_violation(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            {
                "Hypotheses-outstanding": (
                    f"{vr.KILL_MAX_HYPOTHESES + 1}/{vr.KILL_MAX_HYPOTHESES}"
                )
            },
        )
        header = vr.load_state_header(analysis_dir / "state.md")
        assert vr.check_kill_switches(header) == [
            "KILL-1: hypothesis cap exceeded (4 > 3)"
        ]

    def test_query_budget_violation(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            {"Query-budget": f"{vr.KILL_MAX_QUERIES + 1}/{vr.KILL_MAX_QUERIES}"},
        )
        header = vr.load_state_header(analysis_dir / "state.md")
        assert vr.check_kill_switches(header) == [
            "KILL-2: query budget exhausted (7 > 6)"
        ]

    @pytest.mark.parametrize(
        ("budget", "expected"),
        [
            ("6/6", []),
            ("7/6", ["KILL-2: query budget exhausted (7 > 6)"]),
            ("7/7", []),
            ("14/14", []),
        ],
    )
    def test_query_budget_compared_to_denominator(
        self, tmp_path: Path, budget: str, expected: list[str]
    ) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(analysis_dir, {"Query-budget": budget})
        header = vr.load_state_header(analysis_dir / "state.md")
        assert vr.check_kill_switches(header) == expected

    def test_rerun_violation(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            {"Same-query-reruns": f"{vr.KILL_MAX_RERUNS + 1}/{vr.KILL_MAX_RERUNS}"},
        )
        header = vr.load_state_header(analysis_dir / "state.md")
        assert vr.check_kill_switches(header) == [
            "KILL-3: re-run cap exceeded (3 > 2)"
        ]

    def test_identification_verdict_invalid_enum(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(analysis_dir, {"identification_verdict": "bogus"})
        header = vr.load_state_header(analysis_dir / "state.md")
        assert vr.check_identification_verdict(header) == [
            "VERDICT-1: identification_verdict value 'bogus' not in "
            "allowed set (exact, no_match, pending, structural)"
        ]

    def test_phase_invalid_enum(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(analysis_dir, {"Phase": "not-a-phase"})
        header = vr.load_state_header(analysis_dir / "state.md")
        assert vr.check_phase(header) == [
            "PHASE-ERROR: Phase value 'not-a-phase' not in allowed set "
            "(identify, investigate, synthesize)"
        ]
