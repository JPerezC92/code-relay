"""Tests for clock acquisition and warning propagation in use cases."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[2]))
import ticket_runbook_pkg as pkg  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    _make_analysis,
    _patch_header,
    _short_window_scenario,
)
from ticket_runbook_pkg.domain.rules import ModeFindings  # noqa: E402


class _FakeClock:
    """Deterministic clock double that counts every acquisition."""

    def __init__(self, timestamp: datetime) -> None:
        self._timestamp = timestamp
        self.calls = 0

    def __call__(self) -> datetime:
        self.calls += 1
        return self._timestamp


def _execute(
    use_case: str, clock: _FakeClock, analysis_dir: Path
) -> ModeFindings:
    """Run one injected use case over a temporary analysis set."""
    header = pkg.load_state_header(analysis_dir / "state.md")
    step_contents = pkg.load_step_file_contents(analysis_dir)
    if use_case == "analysis":
        return pkg.ValidateAnalysis(clock).execute(
            header, step_contents, str(analysis_dir)
        )
    if use_case == "scaffold":
        return pkg.ValidateScaffold(clock).execute(
            header, step_contents, str(analysis_dir)
        )
    return pkg.ValidateStep(clock).execute(
        header, step_contents, "identify", str(analysis_dir)
    )


class ValidateRunbookClockInjectionTests:
    @pytest.mark.parametrize("use_case", ["analysis", "scaffold", "step"])
    def test_use_case_acquires_one_timestamp_and_warns(
        self, tmp_path: Path, use_case: str
    ) -> None:
        overrides, now = _short_window_scenario()
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(analysis_dir, overrides)
        clock = _FakeClock(now)

        findings = _execute(use_case, clock, analysis_dir)

        assert clock.calls == 1
        assert any("SLA-WARN" in warning for warning in findings["warnings"])
        assert any("CONCURRENT" in warning for warning in findings["warnings"])
