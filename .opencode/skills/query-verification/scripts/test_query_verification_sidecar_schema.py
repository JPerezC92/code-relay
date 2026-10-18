"""Tests for rejection of invalid closed-schema sidecar documents."""

from __future__ import annotations

import contextlib
import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import query_verification as qv  # noqa: E402
from _query_verification_testkit import (  # noqa: E402
    SidecarVariant,
    VALID_SIDECAR_NAME,
    _columns,
    _parameters,
    _read_source_text,
    _result_set,
    _safety,
    _sidecar_variant,
    _write_root,
)


class QueryVerificationSidecarSchemaTests:
    def _assert_sidecar_rejected(
        self, tmp_path: Path, sidecar: SidecarVariant, fragment: str
    ) -> None:
        root = _write_root(tmp_path, _read_source_text(), sidecar)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = qv.run_validate(str(root), str(root / VALID_SIDECAR_NAME))
        assert result == 1, stderr.getvalue()
        assert fragment in stderr.getvalue()

    @pytest.mark.parametrize(
        ("case", "fragment"),
        [
            ("unknown_sidecar", "unknown fields"),
            ("missing_sidecar", "missing required fields"),
            ("schema_version", "must be exactly 1"),
            ("empty_identifier", "non-empty string"),
            ("empty_symptoms", "non-empty list"),
            ("unknown_parameter", "unknown fields"),
            ("missing_parameter", "missing required fields"),
            ("parameter_name", "lowercase snake_case"),
            ("parameter_type", "must be one of"),
            ("duplicate_parameters", "parameter names must be unique"),
            ("unknown_safety", "unknown fields"),
            ("operation", "read_only"),
            ("max_rows", "at least 1"),
            ("unknown_result_set", "unknown fields"),
            ("result_set_name", "verification"),
            ("unknown_column", "unknown fields"),
            ("duplicate_columns", "column names must be unique"),
            ("missing_verdict_column", "verification_verdict"),
            ("duplicate_evidence", "must not contain duplicates"),
            ("evidence_outside_result", "subset of the declared columns"),
            ("redact_outside_evidence", "subset of evidence_columns"),
            ("redact_verdict", "must not include"),
            ("duplicate_redact", "must not contain duplicates"),
            ("non_incident_team", "incident"),
        ],
    )
    def test_closed_sidecar_schema_rejections(
        self, tmp_path: Path, case: str, fragment: str
    ) -> None:
        sidecar = _sidecar_variant()
        if case == "unknown_sidecar":
            sidecar["unexpected"] = True
        elif case == "missing_sidecar":
            del sidecar["purpose"]
        elif case == "schema_version":
            sidecar["schema_version"] = 2
        elif case == "empty_identifier":
            sidecar["id"] = ""
        elif case == "empty_symptoms":
            sidecar["symptoms"] = []
        elif case == "unknown_parameter":
            _parameters(sidecar)[0]["default"] = 1
        elif case == "missing_parameter":
            del _parameters(sidecar)[0]["required"]
        elif case == "parameter_name":
            _parameters(sidecar)[0]["name"] = "CaseId"
        elif case == "parameter_type":
            _parameters(sidecar)[0]["type"] = "json"
        elif case == "duplicate_parameters":
            _parameters(sidecar).append(
                {"name": "case_id", "type": "string", "required": True}
            )
        elif case == "unknown_safety":
            _safety(sidecar)["timeout"] = 5
        elif case == "operation":
            _safety(sidecar)["operation"] = "write"
        elif case == "max_rows":
            _safety(sidecar)["max_rows"] = 0
        elif case == "unknown_result_set":
            _result_set(sidecar)["extra"] = 1
        elif case == "result_set_name":
            _result_set(sidecar)["name"] = "other"
        elif case == "unknown_column":
            _columns(sidecar)[0]["nullable"] = True
        elif case == "duplicate_columns":
            _columns(sidecar).append({"name": "matched_rows", "type": "integer"})
        elif case == "missing_verdict_column":
            columns = _columns(sidecar)
            columns[:] = [
                column
                for column in columns
                if column["name"] != "verification_verdict"
            ]
        elif case == "duplicate_evidence":
            sidecar["evidence_columns"].append("verification_verdict")
        elif case == "evidence_outside_result":
            sidecar["evidence_columns"].append("nonexistent")
        elif case == "redact_outside_evidence":
            sidecar["redact_columns"].append("nonexistent")
        elif case == "redact_verdict":
            sidecar["redact_columns"].append("verification_verdict")
        elif case == "duplicate_redact":
            sidecar["redact_columns"].append("case_reference")
        elif case == "non_incident_team":
            sidecar["team"] = "dev"
        self._assert_sidecar_rejected(tmp_path, sidecar, fragment)

    def test_rejects_malformed_yaml_sidecar(self, tmp_path: Path) -> None:
        root = tmp_path / "sql"
        root.mkdir()
        (root / "incident-check.sql").write_text(
            _read_source_text(), encoding="utf-8"
        )
        sidecar_path = root / VALID_SIDECAR_NAME
        sidecar_path.write_text("key: [unclosed", encoding="utf-8")
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = qv.run_validate(str(root), str(sidecar_path))
        assert result == 1
        assert "not valid UTF-8 YAML" in stderr.getvalue()

    def test_rejects_non_mapping_sidecar_document(self) -> None:
        with pytest.raises(qv.ValidationError):
            qv.parse_sidecar_document(["not", "a", "mapping"])
