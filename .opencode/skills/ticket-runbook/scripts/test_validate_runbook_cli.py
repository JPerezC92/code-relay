"""Tests for runbook validator command-line mode selection."""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import validate_runbook as vr  # noqa: E402


class ValidateRunbookCliTests:
    @pytest.mark.parametrize(
        "conflicting_mode",
        [["--close-out"], ["--scaffold"], ["--step", "identify"]],
    )
    def test_cli_modes_are_mutually_exclusive(
        self, conflicting_mode: list[str]
    ) -> None:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            with pytest.raises(SystemExit) as raised:
                vr._build_parser().parse_args(
                    ["ticket", "--pre-close", *conflicting_mode]
                )
        assert raised.value.code == 2
        assert "not allowed with argument" in stderr.getvalue()

    def test_parser_accepts_every_prior_mode(self) -> None:
        parser = vr._build_parser()
        assert parser.parse_args(["analysis"]).analysis_dir == "analysis"
        assert parser.parse_args(["analysis", "--scaffold"]).scaffold
        assert parser.parse_args(["analysis", "--step", "identify"]).step == "identify"
        assert parser.parse_args(["ticket", "--close-out"]).close_out
