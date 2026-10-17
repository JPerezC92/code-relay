"""Tests for evaluator verdicts, evidence redaction, and digest binding."""

from __future__ import annotations

import contextlib
import io
import json
import sys
from pathlib import Path
from typing import Optional, cast

sys.path.insert(0, str(Path(__file__).parent))
import query_verification as qv  # noqa: E402
from _query_verification_testkit import (  # noqa: E402
    FIXTURES_DIR,
    REDACTED,
    VALID_CASE_REFERENCE,
    VALID_VERIFIER_ID,
    VALID_VERDICT,
    VERIFICATION_RESULT_SET,
    _base_adapter,
    _copy_adapter_row,
    _load_definition,
    _load_static_adapter,
    _read_source_bytes,
    _sidecar_bytes,
)


class QueryVerificationEvaluationTests:
    def _evaluate(
        self,
        definition: Optional[qv.SidecarDefinition],
        source_bytes: Optional[bytes],
        adapter: object,
    ) -> qv.EvidenceRecord:
        return qv.build_evidence_record(
            definition, _sidecar_bytes(), source_bytes, adapter
        )

    def _assert_inconclusive(
        self, adapter: object, source_bytes: Optional[bytes]
    ) -> None:
        record = self._evaluate(_load_definition(), source_bytes, adapter)
        assert record["verdict"] == "inconclusive"
        assert record["evidence"] == {}

    def test_valid_fixture_evaluation_writes_verified_evidence(
        self, tmp_path: Path
    ) -> None:
        adapter_path = tmp_path / "adapter-output.json"
        adapter_path.write_text(json.dumps(_load_static_adapter()), encoding="utf-8")
        evidence_path = tmp_path / "evidence.json"
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = qv.run_evaluate(
                str(FIXTURES_DIR / "incident-check.verifier.yaml"),
                str(adapter_path),
                str(evidence_path),
            )
        assert result == 0, stderr.getvalue()
        record = cast(
            qv.EvidenceRecord,
            json.loads(evidence_path.read_text(encoding="utf-8")),
        )
        assert record["verdict"] == VALID_VERDICT
        assert record["verifier_id"] == VALID_VERIFIER_ID
        assert record["result_set"] == VERIFICATION_RESULT_SET
        assert record["evidence"]["verification_verdict"] == VALID_VERDICT
        assert record["evidence"]["case_reference"] == REDACTED
        assert record["evidence"]["matched_rows"] == 1
        assert set(record.keys()) == {
            "schema_version",
            "verifier_id",
            "verdict",
            "result_set",
            "source_digest",
            "definition_digest",
            "evidence",
            "evidence_digest",
        }
        assert VALID_CASE_REFERENCE not in json.dumps(record)

    def test_evaluate_verified_redacts_and_binds_digests(self) -> None:
        definition = _load_definition()
        source_bytes = _read_source_bytes()
        record = self._evaluate(definition, source_bytes, _base_adapter())
        assert record["verdict"] == "verified"
        assert record["verifier_id"] == VALID_VERIFIER_ID
        assert record["result_set"] == VERIFICATION_RESULT_SET
        assert record["source_digest"] == qv.compute_sha256_digest(source_bytes)
        assert record["definition_digest"] == qv.compute_sha256_digest(
            _sidecar_bytes()
        )
        assert record["evidence"]["case_reference"] == REDACTED
        assert record["evidence"]["matched_rows"] == 1
        assert record["evidence_digest"] == qv.compute_evidence_digest(record)
        assert VALID_CASE_REFERENCE not in json.dumps(record)

    def test_evaluate_not_verified(self) -> None:
        adapter = _base_adapter()
        adapter["rows"][0]["verification_verdict"] = "not_verified"
        record = self._evaluate(_load_definition(), _read_source_bytes(), adapter)
        assert record["verdict"] == "not_verified"
        assert record["evidence"]["verification_verdict"] == "not_verified"

    def test_evaluate_explicit_inconclusive_verdict(self) -> None:
        adapter = _base_adapter()
        adapter["rows"][0]["verification_verdict"] = "inconclusive"
        record = self._evaluate(_load_definition(), _read_source_bytes(), adapter)
        assert record["verdict"] == "inconclusive"
        assert record["evidence"]["case_reference"] == REDACTED

    def test_evaluate_unknown_verdict_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["rows"][0]["verification_verdict"] = "maybe"
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_bad_verifier_id_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["verifier_id"] = "incident.other.v1"
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_bad_source_digest_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["source_digest"] = "sha256:" + "0" * 64
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_wrong_result_set_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["result_set"] = "other"
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_zero_rows_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["rows"] = []
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_multiple_rows_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["rows"].append(_copy_adapter_row(adapter["rows"][0]))
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_missing_column_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        del adapter["rows"][0]["matched_rows"]
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_extra_column_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["rows"][0]["extra"] = 1
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_type_mismatch_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["rows"][0]["matched_rows"] = "1"
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_missing_adapter_field_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        del adapter["schema_version"]
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_wrong_adapter_schema_version_is_inconclusive(self) -> None:
        adapter = _base_adapter()
        adapter["schema_version"] = 2
        self._assert_inconclusive(adapter, _read_source_bytes())

    def test_evaluate_non_mapping_adapter_is_inconclusive(self) -> None:
        self._assert_inconclusive(["not", "a", "mapping"], _read_source_bytes())

    def test_evaluate_missing_source_bytes_is_inconclusive(self) -> None:
        self._assert_inconclusive(_base_adapter(), None)

    def test_evaluate_missing_definition_is_inconclusive(self) -> None:
        record = self._evaluate(None, _read_source_bytes(), _base_adapter())
        assert record["verdict"] == "inconclusive"
        assert record["evidence"] == {}
        assert record["verifier_id"] == VALID_VERIFIER_ID

    def test_evaluate_missing_adapter_file_writes_inconclusive(
        self, tmp_path: Path
    ) -> None:
        evidence_path = tmp_path / "evidence.json"
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            result = qv.run_evaluate(
                str(FIXTURES_DIR / "incident-check.verifier.yaml"),
                str(tmp_path / "missing-adapter.json"),
                str(evidence_path),
            )
        assert result == 0, stderr.getvalue()
        record = cast(
            qv.EvidenceRecord,
            json.loads(evidence_path.read_text(encoding="utf-8")),
        )
        assert record["verdict"] == "inconclusive"
        assert record["evidence"] == {}

    def test_evidence_digest_is_deterministic(self) -> None:
        definition = _load_definition()
        source_bytes = _read_source_bytes()
        first = self._evaluate(definition, source_bytes, _base_adapter())
        second = self._evaluate(definition, source_bytes, _base_adapter())
        assert first == second
        assert first["evidence_digest"] == second["evidence_digest"]

    def test_evidence_digest_changes_with_allowed_evidence(self) -> None:
        definition = _load_definition()
        source_bytes = _read_source_bytes()
        baseline = self._evaluate(definition, source_bytes, _base_adapter())
        changed_adapter = _base_adapter()
        changed_adapter["rows"][0]["matched_rows"] = 2
        changed = self._evaluate(definition, source_bytes, changed_adapter)
        assert changed["verdict"] == "verified"
        assert changed["evidence"]["matched_rows"] == 2
        assert baseline["evidence_digest"] != changed["evidence_digest"]

    def test_evidence_digest_changes_with_source_bytes(self) -> None:
        definition = _load_definition()
        baseline = self._evaluate(definition, _read_source_bytes(), _base_adapter())
        changed_source = _read_source_bytes() + b"\n-- changed\n"
        changed_adapter = _base_adapter()
        changed_adapter["source_digest"] = qv.compute_sha256_digest(changed_source)
        changed = self._evaluate(definition, changed_source, changed_adapter)
        assert changed["verdict"] == "verified"
        assert baseline["source_digest"] != changed["source_digest"]
        assert baseline["evidence_digest"] != changed["evidence_digest"]
