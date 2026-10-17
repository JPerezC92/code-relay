"""Tests for the runbook concurrent-session warning."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    _at,
    _fix_edge_clock,
    _header_times,
    _make_analysis,
    _patch_header,
)
from ticket_runbook_pkg.domain.rules import AnalysisHeader  # noqa: E402


def _header(analysis_dir: Path) -> AnalysisHeader:
    """Load the parsed state header from a temporary analysis set."""
    return vr.load_state_header(analysis_dir / "state.md")


class ValidateRunbookConcurrentSessionTests:
    def test_concurrent_session_warning(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2099-01-01T00:00", updated="2026-01-01T00:00"
            ),
        )
        _fix_edge_clock(monkeypatch, _at(0, 5))
        warning = vr.check_concurrent_session(_header(analysis_dir))
        assert warning is not None
        assert "CONCURRENT" in warning

    def test_concurrent_session_injected_time_warns(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2099-01-01T00:00", updated="2026-01-01T00:00"
            ),
        )
        warning = vr.check_concurrent_session(_header(analysis_dir), _at(0, 5))
        assert warning is not None
        assert "CONCURRENT" in warning

    def test_concurrent_session_injected_time_no_warning(
        self, tmp_path: Path
    ) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2099-01-01T00:00", updated="2026-01-01T00:00"
            ),
        )
        assert vr.check_concurrent_session(_header(analysis_dir), _at(1, 0)) is None

    def test_concurrent_session_boundary_exactly_ten_minutes(
        self, tmp_path: Path
    ) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2099-01-01T00:00", updated="2026-01-01T00:00"
            ),
        )
        # A delta of exactly 600s is not "< 600s".
        assert vr.check_concurrent_session(_header(analysis_dir), _at(0, 10)) is None

    def test_concurrent_session_placeholder_updated(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(sla_due="2099-01-01T00:00", updated="<now>"),
        )
        assert vr.check_concurrent_session(_header(analysis_dir), _at(0, 0)) is None
