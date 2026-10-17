"""Deterministic tests for the runbook SLA warning decision."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import ticket_runbook_pkg as pkg  # noqa: E402
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
    return pkg.load_state_header(analysis_dir / "state.md")


class ValidateRunbookSlaClockTests:
    def test_sla_warns_when_window_mostly_consumed(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2026-01-01T10:00", updated="2026-01-01T00:00"
            ),
        )
        warning = pkg.check_sla_clock(_header(analysis_dir), _at(9, 0))
        assert warning is not None
        assert "SLA-WARN" in warning

    def test_sla_no_warn_when_window_is_fresh(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2026-01-01T10:00", updated="2026-01-01T00:00"
            ),
        )
        assert pkg.check_sla_clock(_header(analysis_dir), _at(0, 0)) is None

    def test_sla_no_warn_at_exact_threshold(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2026-01-01T10:00", updated="2026-01-01T00:00"
            ),
        )
        # 2.5h remaining of a 10h window is exactly SLA_WARN_PCT; "<" excludes it.
        assert pkg.check_sla_clock(_header(analysis_dir), _at(7, 30)) is None

    def test_sla_placeholder_due_skips(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(sla_due="<due>", updated="2026-01-01T00:00"),
        )
        assert pkg.check_sla_clock(_header(analysis_dir), _at(9, 0)) is None

    def test_sla_placeholder_updated_skips(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(sla_due="2026-01-01T10:00", updated="<now>"),
        )
        assert pkg.check_sla_clock(_header(analysis_dir), _at(9, 0)) is None

    def test_sla_degenerate_window_skips(self, tmp_path: Path) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2026-01-01T00:00", updated="2026-01-01T10:00"
            ),
        )
        assert pkg.check_sla_clock(_header(analysis_dir), _at(12, 0)) is None

    def test_edge_helper_resolves_omitted_time(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        analysis_dir = _make_analysis(tmp_path)
        _patch_header(
            analysis_dir,
            _header_times(
                sla_due="2026-01-01T10:00", updated="2026-01-01T00:00"
            ),
        )
        _fix_edge_clock(monkeypatch, _at(9, 0))
        warning = pkg.check_sla_clock(_header(analysis_dir))
        assert warning is not None
        assert "SLA-WARN" in warning
