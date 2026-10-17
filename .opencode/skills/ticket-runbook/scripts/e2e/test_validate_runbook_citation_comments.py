"""End-to-end citation tests for instructional HTML comments at close time."""

from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
import validate_runbook as vr  # noqa: E402
from _ticket_runbook_testkit import (  # noqa: E402
    _append_ticket_text,
    _appended_citation,
    _commented_citation,
    _pre_close_ticket_dir,
    _ticket_dir,
)


class ValidateRunbookCitationCommentTests:
    @pytest.mark.parametrize(
        "multiline", [False, True], ids=["single-line", "multi-line"]
    )
    def test_commented_path_ignored_in_pre_close(
        self, tmp_path: Path, multiline: bool
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        _append_ticket_text(
            ticket_dir / "ticket_999999.md",
            _commented_citation(multiline=multiline),
        )
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert snapshot["missing_ticket_paths"] == []
        assert snapshot["unsafe_ticket_paths"] == []
        assert vr.evaluate_pre_close(snapshot, []) == []
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 0

    @pytest.mark.parametrize(
        "multiline", [False, True], ids=["single-line", "multi-line"]
    )
    def test_commented_path_ignored_in_close_out(
        self, tmp_path: Path, multiline: bool
    ) -> None:
        ticket_dir = _ticket_dir(tmp_path)
        _append_ticket_text(
            ticket_dir / "ticket_999999.md",
            _commented_citation(multiline=multiline),
        )
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert snapshot["missing_image_paths"] == []
        assert vr.evaluate_close_out(snapshot) == []
        assert vr.validate_close_out(str(ticket_dir), str(tmp_path)) == 0

    def test_active_missing_citation_beside_comment_fails(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        ticket_file = ticket_dir / "ticket_999999.md"
        _append_ticket_text(ticket_file, _commented_citation())
        _append_ticket_text(
            ticket_file, _appended_citation("screenshots/active_missing.png")
        )
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert "screenshots/active_missing.png" in snapshot["missing_ticket_paths"]
        pre_close = vr.evaluate_pre_close(snapshot, [])
        assert any("PRE-CLOSE-7" in item for item in pre_close), pre_close
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 1

    @pytest.mark.parametrize(
        "build_citation",
        [lambda root: "../outside.png", lambda root: str(root / "outside.png")],
        ids=["escaping", "absolute"],
    )
    def test_active_unsafe_citation_beside_comment_fails(
        self, tmp_path: Path, build_citation: Callable[[Path], str]
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (tmp_path / "outside.png").write_text("x", encoding="utf-8")
        citation = build_citation(tmp_path)
        ticket_file = ticket_dir / "ticket_999999.md"
        _append_ticket_text(ticket_file, _commented_citation(multiline=True))
        _append_ticket_text(ticket_file, _appended_citation(citation))
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert citation in snapshot["unsafe_ticket_paths"]
        pre_close = vr.evaluate_pre_close(snapshot, [])
        assert any("PRE-CLOSE-6" in item for item in pre_close), pre_close
        close_out = vr.evaluate_close_out(snapshot)
        assert any("CLOSE-5" in item for item in close_out), close_out
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 1

    def test_active_directory_citation_beside_comment_fails(
        self, tmp_path: Path
    ) -> None:
        ticket_dir = _pre_close_ticket_dir(tmp_path)
        (ticket_dir / "screenshots" / "frames").mkdir()
        ticket_file = ticket_dir / "ticket_999999.md"
        _append_ticket_text(ticket_file, _commented_citation())
        _append_ticket_text(ticket_file, _appended_citation("screenshots/frames"))
        snapshot = vr.load_close_out_snapshot(ticket_dir)
        assert snapshot["unsafe_ticket_paths"] == []
        assert "screenshots/frames" in snapshot["missing_ticket_paths"]
        pre_close = vr.evaluate_pre_close(snapshot, [])
        assert any("PRE-CLOSE-7" in item for item in pre_close), pre_close
        assert vr.validate_pre_close(str(ticket_dir), str(tmp_path)) == 1
