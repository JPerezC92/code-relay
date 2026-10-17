"""Shared sidecar, adapter, and query-root builders for focused tests."""

from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path
from typing import TypedDict, cast

import yaml

sys.path.insert(0, str(Path(__file__).parent))
import query_verification as qv  # noqa: E402


SCRIPTS_DIR: Path = Path(__file__).parent
FIXTURES_DIR: Path = Path(__file__).parents[1] / "fixtures" / "valid"

VALID_SOURCE_NAME: str = "incident-check.sql"
VALID_SIDECAR_NAME: str = "incident-check.verifier.yaml"
VALID_ADAPTER_NAME: str = "adapter-output.json"
VALID_VERIFIER_ID: str = "incident.incident-check.v1"
VALID_VERDICT: str = "verified"
VALID_CASE_REFERENCE: str = "CASE-EXAMPLE-0001"
REDACTED: str = "[REDACTED]"
VERIFICATION_RESULT_SET: str = "verification"

_FORBIDDEN_SCRIPT_PATTERNS: tuple[str, ...] = (
    r"(?m)^\s*import\s+(?:sqlite3|psycopg2?|pymysql|MySQLdb|sqlalchemy|asyncpg|"
    r"aiomysql|aiosqlite|pyodbc|oracledb|cx_Oracle|pymongo|redis|boto3|duckdb|"
    r"clickhouse_driver)\b",
    r"(?m)^\s*from\s+(?:sqlite3|psycopg2?|pymysql|MySQLdb|sqlalchemy|asyncpg|"
    r"aiomysql|aiosqlite|pyodbc|oracledb|cx_Oracle|pymongo|redis|boto3|duckdb|"
    r"clickhouse_driver)\b",
    r"(?m)^\s*import\s+(?:socket|requests|httpx|aiohttp|urllib3|http\.client|"
    r"urllib\.request)\b",
    r"(?m)^\s*from\s+(?:socket|requests|httpx|aiohttp|urllib3|http\.client|"
    r"urllib\.request)\b",
    r"(?m)^\s*import\s+(?:subprocess|pty|shlex)\b",
    r"(?m)^\s*from\s+(?:subprocess|pty|shlex)\b",
    r"\bsubprocess\.\w+\s*\(",
    r"\bos\.system\s*\(",
    r"\bos\.popen\s*\(",
    r"\bos\.exec\w*\s*\(",
    r"\bos\.spawn\w*\s*\(",
    r"\bshell\s*=\s*True\b",
    r"\bos\.environ\b",
    r"\bos\.getenv\s*\(",
    r"(?m)^\s*(?:import|from)\s+dotenv\b",
    r"\bre\.sub\s*\(",
    r"\.format\s*\(",
    r"\bsubstitute\s*\(",
    r"\bTemplate\s*\(",
    r"[fF]['\"]{0,3}\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH|DROP|ALTER|CREATE)\b",
    r"\+\s*['\"]\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH|DROP|ALTER|CREATE)\b",
)

_DIGEST_RE: re.Pattern[str] = re.compile(r"^sha256:[0-9a-f]{64}$")


class AdapterRow(TypedDict):
    """One normalized adapter result row for the fixture verifier."""

    verification_verdict: str
    case_reference: str
    matched_rows: int


class AdapterRowVariant(TypedDict, total=False):
    """An adapter row that can represent the evaluator's malformed test cases."""

    verification_verdict: str
    case_reference: str
    matched_rows: int | str
    extra: int


class AdapterDocument(TypedDict):
    """The valid normalized adapter output document."""

    schema_version: int
    verifier_id: str
    source_digest: str
    result_set: str
    rows: list[AdapterRow]


class AdapterVariant(TypedDict, total=False):
    """An adapter document that can represent malformed evaluator test cases."""

    schema_version: int
    verifier_id: str
    source_digest: str
    result_set: str
    rows: list[AdapterRowVariant]


class SidecarParameter(TypedDict):
    """One valid parameter declaration in the fixture sidecar."""

    name: str
    type: str
    required: bool


class SidecarSafety(TypedDict):
    """The valid read-only safety declaration in the fixture sidecar."""

    operation: str
    max_rows: int


class SidecarColumn(TypedDict):
    """One valid result-set column declaration in the fixture sidecar."""

    name: str
    type: str


class SidecarResultSet(TypedDict):
    """The valid result-set declaration in the fixture sidecar."""

    name: str
    columns: list[SidecarColumn]


class SidecarDocument(TypedDict):
    """The fixture verifier sidecar document (closed v1 shape)."""

    schema_version: int
    id: str
    team: str
    source: str
    symptoms: list[str]
    purpose: str
    parameters: list[SidecarParameter]
    safety: SidecarSafety
    result_set: SidecarResultSet
    evidence_columns: list[str]
    redact_columns: list[str]


class SidecarParameterVariant(TypedDict, total=False):
    """A parameter declaration that can represent malformed schema test cases."""

    name: str
    type: str
    required: bool
    default: int


class SidecarSafetyVariant(TypedDict, total=False):
    """A safety block that can represent malformed schema test cases."""

    operation: str
    max_rows: int
    timeout: int


class SidecarColumnVariant(TypedDict, total=False):
    """A result-set column that can represent malformed schema test cases."""

    name: str
    type: str
    nullable: bool


class SidecarResultSetVariant(TypedDict, total=False):
    """A result-set block that can represent malformed schema test cases."""

    name: str
    columns: list[SidecarColumnVariant]
    extra: int


class SidecarVariant(TypedDict, total=False):
    """A sidecar document that can represent malformed schema test cases."""

    schema_version: int
    id: str
    team: str
    source: str
    symptoms: list[str]
    purpose: str
    parameters: list[SidecarParameterVariant]
    safety: SidecarSafetyVariant
    result_set: SidecarResultSetVariant
    evidence_columns: list[str]
    redact_columns: list[str]
    unexpected: bool


def _read_source_bytes() -> bytes:
    """Return the raw bytes of the static SQL fixture."""
    return (FIXTURES_DIR / VALID_SOURCE_NAME).read_bytes()


def _read_source_text() -> str:
    """Return the UTF-8 text of the static SQL fixture."""
    return (FIXTURES_DIR / VALID_SOURCE_NAME).read_text(encoding="utf-8")


def _base_sidecar() -> SidecarDocument:
    """Return a fresh valid fixture sidecar document."""
    return {
        "schema_version": 1,
        "id": VALID_VERIFIER_ID,
        "team": "incident",
        "source": VALID_SOURCE_NAME,
        "symptoms": ["S-XX-INCIDENT-CHECK"],
        "purpose": (
            "Confirm whether the declared incident symptom is present "
            "for one case."
        ),
        "parameters": [{"name": "case_id", "type": "string", "required": True}],
        "safety": {"operation": "read_only", "max_rows": 1},
        "result_set": {
            "name": VERIFICATION_RESULT_SET,
            "columns": [
                {"name": "verification_verdict", "type": "string"},
                {"name": "case_reference", "type": "string"},
                {"name": "matched_rows", "type": "integer"},
            ],
        },
        "evidence_columns": [
            "verification_verdict",
            "case_reference",
            "matched_rows",
        ],
        "redact_columns": ["case_reference"],
    }


def _sidecar_variant() -> SidecarVariant:
    """Return a mutable deep copy of the valid sidecar fixture."""
    return cast(SidecarVariant, copy.deepcopy(_base_sidecar()))


def _parameters(sidecar: SidecarVariant) -> list[SidecarParameterVariant]:
    """Return sidecar parameters as mutable mappings."""
    return sidecar["parameters"]


def _safety(sidecar: SidecarVariant) -> SidecarSafetyVariant:
    """Return the sidecar safety block as a mutable mapping."""
    return sidecar["safety"]


def _result_set(sidecar: SidecarVariant) -> SidecarResultSetVariant:
    """Return the sidecar result-set block as a mutable mapping."""
    return sidecar["result_set"]


def _columns(sidecar: SidecarVariant) -> list[SidecarColumnVariant]:
    """Return result-set columns as mutable mappings."""
    return _result_set(sidecar)["columns"]


def _base_row() -> AdapterRow:
    """Return one valid fixture adapter row."""
    return {
        "verification_verdict": VALID_VERDICT,
        "case_reference": VALID_CASE_REFERENCE,
        "matched_rows": 1,
    }


def _base_adapter() -> AdapterVariant:
    """Return valid adapter output bound to the fixture source bytes."""
    return {
        "schema_version": 1,
        "verifier_id": VALID_VERIFIER_ID,
        "source_digest": qv.compute_sha256_digest(_read_source_bytes()),
        "result_set": VERIFICATION_RESULT_SET,
        "rows": [cast(AdapterRowVariant, _base_row())],
    }


def _copy_adapter_row(row: AdapterRowVariant) -> AdapterRowVariant:
    """Return a shallow copy of an adapter row for duplicate-row tests."""
    return cast(AdapterRowVariant, dict(row))


def _load_static_adapter() -> AdapterDocument:
    """Load adapter fixture and verify its declared source digest."""
    raw: object = json.loads(
        (FIXTURES_DIR / VALID_ADAPTER_NAME).read_text(encoding="utf-8")
    )
    if not isinstance(raw, dict):
        raise AssertionError("adapter fixture must be a JSON object")
    adapter = cast(AdapterDocument, raw)
    expected_digest = qv.compute_sha256_digest(_read_source_bytes())
    declared_digest = adapter["source_digest"]
    if declared_digest != expected_digest:
        raise AssertionError(
            "adapter fixture source_digest "
            f"{declared_digest!r} does not match the fixture source digest "
            f"{expected_digest!r}"
        )
    return adapter


def _load_definition() -> qv.SidecarDefinition:
    """Parse the valid fixture sidecar into a validated definition."""
    document = yaml.safe_load(yaml.safe_dump(dict(_base_sidecar())))
    return qv.parse_sidecar_document(document)


def _sidecar_bytes() -> bytes:
    """Return canonical UTF-8 sidecar bytes for digest tests."""
    return yaml.safe_dump(dict(_base_sidecar())).encode("utf-8")


def _write_root(
    tmp_path: Path,
    source_text: str,
    sidecar: SidecarDocument | SidecarVariant,
    source_name: str = VALID_SOURCE_NAME,
    sidecar_name: str = VALID_SIDECAR_NAME,
) -> Path:
    """Write a source/sidecar pair beneath a pytest temporary query root."""
    root = tmp_path / "sql"
    root.mkdir()
    (root / source_name).write_text(source_text, encoding="utf-8")
    (root / sidecar_name).write_text(
        yaml.safe_dump(dict(sidecar), sort_keys=True), encoding="utf-8"
    )
    return root
