"""Tests for the valid static fixture trio and adapter result shape."""

from __future__ import annotations

import contextlib
import io
import json
import re
import sys
from pathlib import Path
from typing import cast

sys.path.insert(0, str(Path(__file__).parent))
import query_verification as qv  # noqa: E402
from _query_verification_testkit import (  # noqa: E402
    AdapterDocument,
    FIXTURES_DIR,
    VALID_ADAPTER_NAME,
    VALID_VERIFIER_ID,
    VALID_VERDICT,
    VERIFICATION_RESULT_SET,
    _DIGEST_RE,
)


class QueryVerificationFixtureTests:
    def test_valid_fixture_trio_passes_validation(self) -> None:
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = qv.run_validate(
                str(FIXTURES_DIR),
                str(FIXTURES_DIR / "incident-check.verifier.yaml"),
            )
        assert result == 0, stderr.getvalue()
        assert VALID_VERIFIER_ID in stdout.getvalue()

    def test_static_adapter_fixture_shape(self) -> None:
        raw = cast(
            AdapterDocument,
            json.loads(
                (FIXTURES_DIR / VALID_ADAPTER_NAME).read_text(encoding="utf-8")
            ),
        )
        assert set(raw.keys()) == {
            "schema_version",
            "verifier_id",
            "source_digest",
            "result_set",
            "rows",
        }
        assert raw["schema_version"] == 1
        assert raw["verifier_id"] == VALID_VERIFIER_ID
        assert raw["result_set"] == VERIFICATION_RESULT_SET
        assert re.search(_DIGEST_RE, raw["source_digest"])
        assert len(raw["rows"]) == 1
        assert raw["rows"][0] == {
            "verification_verdict": VALID_VERDICT,
            "case_reference": "CASE-EXAMPLE-0001",
            "matched_rows": 1,
        }
