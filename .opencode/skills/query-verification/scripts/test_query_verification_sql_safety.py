"""Tests for lexical safety rejection of unsafe SQL source text."""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import query_verification as qv  # noqa: E402
from _query_verification_testkit import (  # noqa: E402
    VALID_SIDECAR_NAME,
    _base_sidecar,
    _write_root,
)


class QueryVerificationSqlSafetyTests:
    def _assert_source_rejected(
        self, tmp_path: Path, source_text: str, fragment: str
    ) -> None:
        root = _write_root(tmp_path, source_text, _base_sidecar())
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = qv.run_validate(str(root), str(root / VALID_SIDECAR_NAME))
        assert result == 1, stderr.getvalue()
        assert fragment in stderr.getvalue()

    @pytest.mark.parametrize(
        ("source_text", "fragment"),
        [
            ("SELECT 1", "unbounded"),
            (
                "WITH removed AS (DELETE FROM incident_events "
                "WHERE case_id = :case_id RETURNING case_id) "
                "SELECT verification_verdict FROM removed",
                "unsafe keyword",
            ),
            (
                "CREATE TABLE incident_events_copy AS "
                "SELECT 1",
                "must begin with SELECT or WITH",
            ),
            (
                "SELECT verification_verdict FROM incident_events "
                "WHERE case_id = :case_id AND COMMIT IS NULL",
                "transaction keyword",
            ),
            (
                "SELECT verification_verdict FROM incident_events "
                "WHERE case_id = :case_id FOR SHARE",
                "locking clause",
            ),
            ("SELECT 1 WHERE case_id = :case_id; SELECT 2", "statement separator"),
            (
                "SELECT 1 WHERE case_id = {{case_id}}",
                "interpolation or template marker",
            ),
            ("SELECT 1 WHERE case_id = ${case_id}", "interpolation or template marker"),
            (
                "SELECT 1 WHERE case_id = :case_id AND other = :undeclared",
                "undeclared bind markers",
            ),
            ("SELECT 1 WHERE 1 = 1", "missing required bind markers"),
            ("SELECT 1 WHERE case_id = ?", "positional bind marker"),
            ("SELECT 1 WHERE case_id = $1", "dollar bind marker"),
            ("SELECT 1 WHERE case_id = @case_id", "non-':' bind marker"),
            (
                "SELECT 1 WHERE case_id = :case_id || 'x'",
                "string concatenation",
            ),
        ],
    )
    def test_unsafe_source_is_rejected(
        self, tmp_path: Path, source_text: str, fragment: str
    ) -> None:
        self._assert_source_rejected(tmp_path, source_text, fragment)
