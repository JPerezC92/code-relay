"""Tests for no-argument package-level use-case compatibility."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
import ticket_runbook_pkg as pkg  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    _at,
    _fix_edge_clock,
    _make_analysis,
)


class ValidateRunbookClockCompatibilityTests:
    def test_package_classes_construct_without_arguments(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _fix_edge_clock(monkeypatch, _at(0, 5))
        header = pkg.load_state_header(analysis_dir / "state.md")
        step_contents = pkg.load_step_file_contents(analysis_dir)
        assert isinstance(
            pkg.ValidateAnalysis().execute(header, step_contents, str(analysis_dir)),
            dict,
        )
        assert isinstance(
            pkg.ValidateScaffold().execute(header, step_contents, str(analysis_dir)),
            dict,
        )
        assert isinstance(
            pkg.ValidateStep().execute(
                header, step_contents, "identify", str(analysis_dir)
            ),
            dict,
        )
