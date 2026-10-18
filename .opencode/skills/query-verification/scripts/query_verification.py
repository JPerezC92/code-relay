"""
Validate an incident-owned SQL verifier sidecar and evaluate trusted normalized
adapter output entirely offline.

The module exposes one CLI with two subcommands::

    validate --query-root PATH --sidecar PATH
    evaluate --sidecar PATH --adapter-output PATH --evidence PATH

It never connects to a database, executes SQL, reads credentials or environment
variables, invokes a subprocess, or performs network access. Parsing, path
normalization, SQL lexical safety checks, adapter-output evaluation, redaction,
digest computation, and evidence construction are pure functions; file reads,
file writes, and CLI argument parsing live at the entry point or in clearly
named IO helpers.
"""

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path, PurePosixPath
from typing import Mapping, Optional, TypedDict

import yaml

# ---------------------------------------------------------------------------
# Protocol constants (v1, incident pilot)
# ---------------------------------------------------------------------------

_SCHEMA_VERSION: int = 1
_TEAM: str = "incident"
_RESULT_SET_NAME: str = "verification"
_VERDICT_COLUMN: str = "verification_verdict"
_VERDICT_VERIFIED: str = "verified"
_VERDICT_NOT_VERIFIED: str = "not_verified"
_VERDICT_INCONCLUSIVE: str = "inconclusive"
_VERDICTS: frozenset[str] = frozenset(
    {_VERDICT_VERIFIED, _VERDICT_NOT_VERIFIED, _VERDICT_INCONCLUSIVE}
)
_REDACTED: str = "[REDACTED]"
_SOURCE_SUFFIX: str = ".sql"
_SIDECAR_SUFFIX: str = ".verifier.yaml"
_EVIDENCE_DIGEST_FIELD: str = "evidence_digest"
_READ_ONLY_OPERATION: str = "read_only"

# Declared scalar types shared by parameters and result-set columns.
_DECLARED_TYPES: frozenset[str] = frozenset(
    {"integer", "string", "decimal", "boolean", "date"}
)

# Closed-schema key sets.
_SIDECAR_KEYS: frozenset[str] = frozenset(
    {
        "schema_version",
        "id",
        "team",
        "source",
        "symptoms",
        "purpose",
        "parameters",
        "safety",
        "result_set",
        "evidence_columns",
        "redact_columns",
    }
)
_PARAMETER_REQUIRED_KEYS: frozenset[str] = frozenset({"name", "type", "required"})
_PARAMETER_OPTIONAL_KEYS: frozenset[str] = frozenset({"redaction"})
_SAFETY_KEYS: frozenset[str] = frozenset({"operation", "max_rows"})
_RESULT_SET_KEYS: frozenset[str] = frozenset({"name", "columns"})
_COLUMN_KEYS: frozenset[str] = frozenset({"name", "type"})
_ADAPTER_KEYS: frozenset[str] = frozenset(
    {"schema_version", "verifier_id", "source_digest", "result_set", "rows"}
)

# Lexical source-safety keyword sets.
_MUTATING_KEYWORDS: frozenset[str] = frozenset(
    {
        "INSERT",
        "UPDATE",
        "DELETE",
        "MERGE",
        "UPSERT",
        "CREATE",
        "ALTER",
        "DROP",
        "TRUNCATE",
        "RENAME",
        "GRANT",
        "REVOKE",
        "EXEC",
        "EXECUTE",
        "CALL",
        "INTO",
        "OUTFILE",
        "DUMPFILE",
        "LOAD_FILE",
    }
)
_TRANSACTION_KEYWORDS: frozenset[str] = frozenset(
    {"BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "TRANSACTION"}
)
_LOCKING_PATTERNS: tuple[str, ...] = (
    r"\bFOR\s+UPDATE\b",
    r"\bFOR\s+SHARE\b",
    r"\bFOR\s+NO\s+KEY\s+UPDATE\b",
    r"\bFOR\s+KEY\s+SHARE\b",
    r"\bLOCK\s+TABLE\b",
    r"\bSKIP\s+LOCKED\b",
    r"\bNOWAIT\b",
    r"\bLOCKING\b",
)
_TEMPLATE_MARKERS: tuple[str, ...] = (
    "{{",
    "}}",
    "${",
    "#{",
    "{%",
    "%}",
    "<%",
    "%>",
    "%(",
    "[%",
    "%]",
)

_SNAKE_CASE_RE: re.Pattern[str] = re.compile(r"^[a-z][a-z0-9_]*$")
_NAMED_BIND_RE: re.Pattern[str] = re.compile(r"(?<!:):([A-Za-z_][A-Za-z0-9_]*)")
_DOLLAR_BIND_RE: re.Pattern[str] = re.compile(r"\$(?:\d+|[A-Za-z_]\w*|\$)")
_AT_BIND_RE: re.Pattern[str] = re.compile(r"@[A-Za-z_]\w*")
_QUESTION_BIND_RE: re.Pattern[str] = re.compile(r"\?")
_BOUND_RE: re.Pattern[str] = re.compile(r"\b(WHERE|LIMIT|TOP|FETCH)\b", re.IGNORECASE)
_FIRST_KEYWORD_RE: re.Pattern[str] = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Structured data shapes
# ---------------------------------------------------------------------------


class ParameterDefinition(TypedDict):
    """A validated named binding declared by a verifier sidecar."""

    name: str
    type: str
    required: bool
    redaction: str


class ColumnDefinition(TypedDict):
    """A validated result-set column declared by a verifier sidecar."""

    name: str
    type: str


class SafetyDefinition(TypedDict):
    """The validated read-only safety block of a verifier sidecar."""

    operation: str
    max_rows: int


class SidecarDefinition(TypedDict):
    """A fully validated, closed v1 verifier sidecar definition."""

    schema_version: int
    id: str
    team: str
    source: str
    symptoms: list[str]
    purpose: str
    parameters: list[ParameterDefinition]
    safety: SafetyDefinition
    result_set_name: str
    columns: list[ColumnDefinition]
    evidence_columns: list[str]
    redact_columns: list[str]


class EvidenceRecord(TypedDict):
    """The closed, redacted case-evidence record produced by evaluation."""

    schema_version: int
    verifier_id: str
    verdict: str
    result_set: str
    source_digest: str
    definition_digest: str
    evidence: dict[str, object]
    evidence_digest: str


class ValidationError(ValueError):
    """Raised when a sidecar, source, or adapter input fails v1 validation."""


# ---------------------------------------------------------------------------
# Pure digest and canonicalization helpers
# ---------------------------------------------------------------------------


def compute_sha256_digest(data: bytes) -> str:
    """Return the ``sha256:``-prefixed lowercase hex digest of ``data``."""
    return "sha256:" + hashlib.sha256(data).hexdigest()


def compute_evidence_digest(record: Mapping[str, object]) -> str:
    """Return the deterministic digest of an evidence record.

    The record's own ``evidence_digest`` field is excluded. The payload is
    serialized with sorted keys and compact separators before hashing.
    """
    payload = {
        key: value for key, value in record.items() if key != _EVIDENCE_DIGEST_FIELD
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def value_matches_type(value: object, type_name: str) -> bool:
    """Return whether a normalized JSON value matches a declared column type."""
    if type_name == "string":
        return isinstance(value, str)
    if type_name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if type_name == "decimal":
        return (
            isinstance(value, str)
            or (isinstance(value, (int, float)) and not isinstance(value, bool))
        )
    if type_name == "boolean":
        return isinstance(value, bool)
    if type_name == "date":
        return isinstance(value, str)
    return False


# ---------------------------------------------------------------------------
# Pure path-shape helpers
# ---------------------------------------------------------------------------


def normalize_source_path(source: str) -> str:
    """Return the normalized relative POSIX ``.sql`` path, or raise."""
    if not source:
        raise ValidationError("source must be a non-empty path")
    if "\\" in source:
        raise ValidationError("source must use POSIX path separators")
    if source.startswith("/"):
        raise ValidationError("source must be relative to the query root")
    parts = source.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValidationError(
            "source must be a normalized path without '.' or '..' segments"
        )
    if not source.endswith(_SOURCE_SUFFIX):
        raise ValidationError("source must end with '.sql'")
    return source


def derive_sidecar_relative_path(source: str) -> str:
    """Return the adjacent sidecar path for a normalized ``.sql`` source."""
    return source[: -len(_SOURCE_SUFFIX)] + _SIDECAR_SUFFIX


def derive_adjacent_source_path(
    sidecar_path: Path, declared_source: str
) -> Optional[Path]:
    """Return the adjacent source path for a sidecar, or ``None`` if unproven.

    The source is the sidecar's sibling: the sidecar filename minus
    ``.verifier.yaml`` plus ``.sql``. The declared source basename must match
    that sibling name.
    """
    name = sidecar_path.name
    if not name.endswith(_SIDECAR_SUFFIX):
        return None
    stem = name[: -len(_SIDECAR_SUFFIX)]
    declared_name = PurePosixPath(declared_source).name
    if declared_name != stem + _SOURCE_SUFFIX:
        return None
    return sidecar_path.with_name(stem + _SOURCE_SUFFIX)


# ---------------------------------------------------------------------------
# Pure lexical SQL safety checks
# ---------------------------------------------------------------------------


def strip_sql_literals_and_comments(sql: str) -> str:
    """Blank out SQL string literals and comments, preserving positions.

    Handles single-quoted strings, double-quoted identifiers, ``--`` line
    comments, and ``/* ... */`` block comments. The returned string has the
    same length as the input so downstream keyword scanning never matches
    inside a literal or comment.
    """
    result: list[str] = []
    index = 0
    length = len(sql)
    while index < length:
        char = sql[index]
        following = sql[index + 1] if index + 1 < length else ""
        if char == "-" and following == "-":
            while index < length and sql[index] != "\n":
                result.append(" ")
                index += 1
            continue
        if char == "/" and following == "*":
            result.append(" ")
            result.append(" ")
            index += 2
            while index < length and not (
                sql[index] == "*" and index + 1 < length and sql[index + 1] == "/"
            ):
                result.append(" ")
                index += 1
            if index < length:
                result.append(" ")
                result.append(" ")
                index += 2
            continue
        if char == "'" or char == '"':
            quote = char
            result.append(" ")
            index += 1
            while index < length:
                if sql[index] == quote:
                    if index + 1 < length and sql[index + 1] == quote:
                        result.append(" ")
                        result.append(" ")
                        index += 2
                        continue
                    result.append(" ")
                    index += 1
                    break
                result.append(" ")
                index += 1
            continue
        result.append(char)
        index += 1
    return "".join(result)


def check_source_safety(
    sql: str,
    declared_parameter_names: set[str],
    required_parameter_names: set[str],
) -> None:
    """Run conservative lexical safety checks on one SQL source.

    Raises ``ValidationError`` on the first violation. The source is never
    executed, rendered, or substituted.
    """
    code = strip_sql_literals_and_comments(sql)
    trimmed = code.strip()
    if not trimmed:
        raise ValidationError("source is empty after removing comments")

    for marker in _TEMPLATE_MARKERS:
        if marker in code:
            raise ValidationError(
                f"source contains an interpolation or template marker: {marker!r}"
            )
    if _QUESTION_BIND_RE.search(code):
        raise ValidationError("source contains a positional bind marker '?'")
    if _DOLLAR_BIND_RE.search(code):
        raise ValidationError("source contains a dollar bind marker")
    if _AT_BIND_RE.search(code):
        raise ValidationError("source contains a non-':' bind marker")
    if "||" in code:
        raise ValidationError("source contains the string concatenation operator '||'")

    single_statement = trimmed
    if single_statement.endswith(";"):
        single_statement = single_statement[:-1].rstrip()
    if ";" in single_statement:
        raise ValidationError(
            "source contains a statement separator or more than one statement"
        )

    if _FIRST_KEYWORD_RE.match(code) is None:
        raise ValidationError("source must begin with SELECT or WITH")

    for keyword in sorted(_MUTATING_KEYWORDS):
        if re.search(rf"\b{keyword}\b", code, re.IGNORECASE):
            raise ValidationError(f"source contains an unsafe keyword: {keyword!r}")
    for keyword in sorted(_TRANSACTION_KEYWORDS):
        if re.search(rf"\b{keyword}\b", code, re.IGNORECASE):
            raise ValidationError(
                f"source contains a transaction keyword: {keyword!r}"
            )
    for pattern in _LOCKING_PATTERNS:
        if re.search(pattern, code, re.IGNORECASE):
            raise ValidationError("source contains a transaction locking clause")

    if _BOUND_RE.search(code) is None:
        raise ValidationError(
            "source is unbounded: no WHERE, LIMIT, TOP, or FETCH clause"
        )

    tokens = set(_NAMED_BIND_RE.findall(code))
    undeclared = tokens - declared_parameter_names
    if undeclared:
        raise ValidationError(
            f"source uses undeclared bind markers: {sorted(undeclared)}"
        )
    missing = required_parameter_names - tokens
    if missing:
        raise ValidationError(
            f"source is missing required bind markers: {sorted(missing)}"
        )


# ---------------------------------------------------------------------------
# Pure sidecar parsing (closed schema)
# ---------------------------------------------------------------------------


def require_mapping(value: object, context: str) -> Mapping[str, object]:
    """Return ``value`` as a mapping or raise ``ValidationError``."""
    if not isinstance(value, dict):
        raise ValidationError(f"{context} must be a mapping")
    return value


def require_exact_keys(
    mapping: Mapping[str, object],
    required: frozenset[str],
    optional: frozenset[str],
    context: str,
) -> None:
    """Enforce a closed-schema key set on ``mapping``."""
    keys = set(mapping.keys())
    missing = required - keys
    unknown = keys - required - optional
    if missing:
        raise ValidationError(f"{context} is missing required fields: {sorted(missing)}")
    if unknown:
        raise ValidationError(f"{context} contains unknown fields: {sorted(unknown)}")


def require_string(value: object, context: str, allow_empty: bool = False) -> str:
    """Return ``value`` as a string or raise ``ValidationError``."""
    if not isinstance(value, str):
        raise ValidationError(f"{context} must be a string")
    if not allow_empty and value == "":
        raise ValidationError(f"{context} must be a non-empty string")
    return value


def require_integer(value: object, context: str) -> int:
    """Return ``value`` as an integer (excluding booleans) or raise."""
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValidationError(f"{context} must be an integer")
    return value


def require_boolean(value: object, context: str) -> bool:
    """Return ``value`` as a boolean or raise ``ValidationError``."""
    if not isinstance(value, bool):
        raise ValidationError(f"{context} must be a boolean")
    return value


def require_list(value: object, context: str) -> list[object]:
    """Return ``value`` as a list or raise ``ValidationError``."""
    if not isinstance(value, list):
        raise ValidationError(f"{context} must be a list")
    return value


def parse_string_list(
    value: object, context: str, allow_empty: bool
) -> list[str]:
    """Parse a list of non-empty strings from a closed-schema field."""
    items = require_list(value, context)
    if not allow_empty and not items:
        raise ValidationError(f"{context} must be a non-empty list")
    parsed: list[str] = []
    for index, item in enumerate(items):
        parsed.append(require_string(item, f"{context}[{index}]"))
    return parsed


def parse_parameter(value: object, index: int) -> ParameterDefinition:
    """Parse one closed-schema parameter object."""
    context = f"parameters[{index}]"
    mapping = require_mapping(value, context)
    require_exact_keys(
        mapping, _PARAMETER_REQUIRED_KEYS, _PARAMETER_OPTIONAL_KEYS, context
    )
    name = require_string(mapping["name"], f"{context}.name")
    if _SNAKE_CASE_RE.match(name) is None:
        raise ValidationError(f"{context}.name must be lowercase snake_case")
    parameter_type = require_string(mapping["type"], f"{context}.type")
    if parameter_type not in _DECLARED_TYPES:
        raise ValidationError(
            f"{context}.type must be one of {sorted(_DECLARED_TYPES)}"
        )
    required = require_boolean(mapping["required"], f"{context}.required")
    redaction = ""
    if "redaction" in mapping:
        redaction = require_string(mapping["redaction"], f"{context}.redaction")
    return {
        "name": name,
        "type": parameter_type,
        "required": required,
        "redaction": redaction,
    }


def parse_column(value: object, index: int) -> ColumnDefinition:
    """Parse one closed-schema result-set column object."""
    context = f"result_set.columns[{index}]"
    mapping = require_mapping(value, context)
    require_exact_keys(mapping, _COLUMN_KEYS, frozenset(), context)
    name = require_string(mapping["name"], f"{context}.name")
    if _SNAKE_CASE_RE.match(name) is None:
        raise ValidationError(f"{context}.name must be lowercase snake_case")
    column_type = require_string(mapping["type"], f"{context}.type")
    if column_type not in _DECLARED_TYPES:
        raise ValidationError(
            f"{context}.type must be one of {sorted(_DECLARED_TYPES)}"
        )
    return {"name": name, "type": column_type}


def parse_safety(value: object) -> SafetyDefinition:
    """Parse the closed-schema read-only safety block."""
    context = "safety"
    mapping = require_mapping(value, context)
    require_exact_keys(mapping, _SAFETY_KEYS, frozenset(), context)
    operation = require_string(mapping["operation"], "safety.operation")
    if operation != _READ_ONLY_OPERATION:
        raise ValidationError("safety.operation must be exactly 'read_only'")
    max_rows = require_integer(mapping["max_rows"], "safety.max_rows")
    if max_rows < 1:
        raise ValidationError("safety.max_rows must be at least 1")
    return {"operation": operation, "max_rows": max_rows}


def parse_result_set(value: object) -> tuple[str, list[ColumnDefinition]]:
    """Parse the single closed-schema ``verification`` result set."""
    context = "result_set"
    mapping = require_mapping(value, context)
    require_exact_keys(mapping, _RESULT_SET_KEYS, frozenset(), context)
    name = require_string(mapping["name"], "result_set.name")
    if name != _RESULT_SET_NAME:
        raise ValidationError(f"result_set.name must be exactly {_RESULT_SET_NAME!r}")
    raw_columns = require_list(mapping["columns"], "result_set.columns")
    if not raw_columns:
        raise ValidationError("result_set.columns must be non-empty")
    columns = [
        parse_column(column, index) for index, column in enumerate(raw_columns)
    ]
    names = [column["name"] for column in columns]
    if len(set(names)) != len(names):
        raise ValidationError("result_set column names must be unique")
    if names.count(_VERDICT_COLUMN) != 1:
        raise ValidationError(
            f"result_set must declare exactly one {_VERDICT_COLUMN!r} column"
        )
    return name, columns


def parse_sidecar_document(document: object) -> SidecarDefinition:
    """Parse and validate a closed v1 verifier sidecar document.

    Raises ``ValidationError`` on any unknown, missing, wrong-typed, or
    inconsistent field.
    """
    mapping = require_mapping(document, "sidecar")
    require_exact_keys(mapping, _SIDECAR_KEYS, frozenset(), "sidecar")

    schema_version = require_integer(
        mapping["schema_version"], "sidecar.schema_version"
    )
    if schema_version != _SCHEMA_VERSION:
        raise ValidationError(
            f"sidecar.schema_version must be exactly {_SCHEMA_VERSION}"
        )
    identifier = require_string(mapping["id"], "sidecar.id")
    team = require_string(mapping["team"], "sidecar.team")
    if team != _TEAM:
        raise ValidationError(f"sidecar.team must be exactly {_TEAM!r}")
    source = normalize_source_path(require_string(mapping["source"], "sidecar.source"))
    symptoms = parse_string_list(mapping["symptoms"], "sidecar.symptoms", False)
    purpose = require_string(mapping["purpose"], "sidecar.purpose")

    raw_parameters = require_list(mapping["parameters"], "sidecar.parameters")
    parameters = [
        parse_parameter(parameter, index)
        for index, parameter in enumerate(raw_parameters)
    ]
    parameter_names = [parameter["name"] for parameter in parameters]
    if len(set(parameter_names)) != len(parameter_names):
        raise ValidationError("sidecar parameter names must be unique")

    safety = parse_safety(mapping["safety"])
    result_set_name, columns = parse_result_set(mapping["result_set"])
    column_names = {column["name"] for column in columns}

    evidence_columns = parse_string_list(
        mapping["evidence_columns"], "sidecar.evidence_columns", False
    )
    if len(set(evidence_columns)) != len(evidence_columns):
        raise ValidationError("sidecar.evidence_columns must not contain duplicates")
    if not set(evidence_columns).issubset(column_names):
        raise ValidationError(
            "sidecar.evidence_columns must be a subset of the declared columns"
        )
    if _VERDICT_COLUMN not in evidence_columns:
        raise ValidationError(
            f"sidecar.evidence_columns must include {_VERDICT_COLUMN!r}"
        )

    redact_columns = parse_string_list(
        mapping["redact_columns"], "sidecar.redact_columns", True
    )
    if len(set(redact_columns)) != len(redact_columns):
        raise ValidationError("sidecar.redact_columns must not contain duplicates")
    if not set(redact_columns).issubset(set(evidence_columns)):
        raise ValidationError(
            "sidecar.redact_columns must be a subset of evidence_columns"
        )
    if _VERDICT_COLUMN in redact_columns:
        raise ValidationError(
            f"sidecar.redact_columns must not include {_VERDICT_COLUMN!r}"
        )

    return {
        "schema_version": schema_version,
        "id": identifier,
        "team": team,
        "source": source,
        "symptoms": symptoms,
        "purpose": purpose,
        "parameters": parameters,
        "safety": safety,
        "result_set_name": result_set_name,
        "columns": columns,
        "evidence_columns": evidence_columns,
        "redact_columns": redact_columns,
    }


# ---------------------------------------------------------------------------
# Pure adapter-output evaluation and evidence construction
# ---------------------------------------------------------------------------


def adapter_verifier_id(adapter: object) -> str:
    """Return the adapter's ``verifier_id`` when it is a non-empty string."""
    if isinstance(adapter, dict):
        candidate = adapter.get("verifier_id")
        if isinstance(candidate, str) and candidate != "":
            return candidate
    return ""


def match_adapter_row(
    definition: SidecarDefinition,
    adapter: Mapping[str, object],
    expected_source_digest: str,
) -> Optional[Mapping[str, object]]:
    """Return the single matching adapter row, or ``None`` when inconclusive.

    Enforces the closed adapter envelope, the verifier ID, the source digest,
    the result-set name, exactly one row, the exact declared columns, declared
    value types, and a verdict value in the three-state enum.
    """
    if set(adapter.keys()) != _ADAPTER_KEYS:
        return None
    schema_version = adapter.get("schema_version")
    if (
        not isinstance(schema_version, int)
        or isinstance(schema_version, bool)
        or schema_version != _SCHEMA_VERSION
    ):
        return None
    if adapter.get("verifier_id") != definition["id"]:
        return None
    if adapter.get("source_digest") != expected_source_digest:
        return None
    if adapter.get("result_set") != _RESULT_SET_NAME:
        return None
    rows = adapter.get("rows")
    if not isinstance(rows, list) or len(rows) != 1:
        return None
    row = rows[0]
    if not isinstance(row, dict):
        return None
    column_names = [column["name"] for column in definition["columns"]]
    if set(row.keys()) != set(column_names):
        return None
    for column in definition["columns"]:
        if not value_matches_type(row.get(column["name"]), column["type"]):
            return None
    verdict_value = row.get(_VERDICT_COLUMN)
    if not isinstance(verdict_value, str) or verdict_value not in _VERDICTS:
        return None
    return row


def build_redacted_evidence(
    definition: SidecarDefinition, row: Mapping[str, object]
) -> dict[str, object]:
    """Build the allowlisted evidence map with configured redaction applied."""
    redact = set(definition["redact_columns"])
    evidence: dict[str, object] = {}
    for column_name in definition["evidence_columns"]:
        if column_name in redact:
            evidence[column_name] = _REDACTED
        else:
            evidence[column_name] = row.get(column_name)
    return evidence


def build_evidence_record(
    definition: Optional[SidecarDefinition],
    sidecar_bytes: bytes,
    source_bytes: Optional[bytes],
    adapter: object,
) -> EvidenceRecord:
    """Build the closed redacted evidence record.

    Any missing, malformed, ambiguous, or mismatched input yields the
    ``inconclusive`` verdict with an empty evidence map. Raw adapter output,
    rendered SQL, and unredacted configured values are never emitted.
    """
    definition_digest = compute_sha256_digest(sidecar_bytes)
    source_digest = (
        compute_sha256_digest(source_bytes)
        if source_bytes is not None
        else compute_sha256_digest(b"")
    )
    verifier_id = (
        definition["id"] if definition is not None else adapter_verifier_id(adapter)
    )
    verdict = _VERDICT_INCONCLUSIVE
    evidence: dict[str, object] = {}
    if definition is not None and source_bytes is not None and isinstance(adapter, dict):
        row = match_adapter_row(definition, adapter, source_digest)
        if row is not None:
            verdict = str(row[_VERDICT_COLUMN])
            evidence = build_redacted_evidence(definition, row)
    record: EvidenceRecord = {
        "schema_version": _SCHEMA_VERSION,
        "verifier_id": verifier_id,
        "verdict": verdict,
        "result_set": _RESULT_SET_NAME,
        "source_digest": source_digest,
        "definition_digest": definition_digest,
        "evidence": evidence,
        "evidence_digest": "",
    }
    record["evidence_digest"] = compute_evidence_digest(record)
    return record


# ---------------------------------------------------------------------------
# IO helpers (file access and path resolution only)
# ---------------------------------------------------------------------------


def parse_yaml_text(text: str) -> object:
    """Parse a YAML document from text with ``yaml.safe_load`` (pure)."""
    return yaml.safe_load(text)


def parse_json_text(text: str) -> object:
    """Parse a JSON document from text (pure)."""
    return json.loads(text)


def resolve_query_root(query_root: str) -> Path:
    """Resolve the invocation-time query root, requiring an existing directory."""
    root = Path(query_root).resolve()
    if not root.is_dir():
        raise ValidationError(
            f"query root is not an existing directory: {query_root}"
        )
    return root


def resolve_beneath_root(root: Path, relative_posix: str) -> Path:
    """Resolve a normalized relative path, rejecting any escape from the root."""
    candidate = (root / relative_posix).resolve()
    if not candidate.is_relative_to(root):
        raise ValidationError(
            f"path resolves outside the query root: {relative_posix}"
        )
    return candidate


def write_evidence_record(path: Path, record: EvidenceRecord) -> None:
    """Write the redacted evidence record as UTF-8 JSON at the IO boundary."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(record, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Subcommand entry points
# ---------------------------------------------------------------------------


def run_validate(query_root: str, sidecar: str) -> int:
    """Validate one sidecar and its adjacent root-contained source.

    Returns ``0`` on success and ``1`` on any rejection.
    """
    try:
        root = resolve_query_root(query_root)
        sidecar_path = Path(sidecar)
        if not sidecar_path.is_file():
            raise ValidationError(f"sidecar not found or not a file: {sidecar}")

        sidecar_bytes = sidecar_path.read_bytes()
        try:
            document = parse_yaml_text(sidecar_bytes.decode("utf-8"))
        except (UnicodeDecodeError, yaml.YAMLError) as exc:
            raise ValidationError(f"sidecar is not valid UTF-8 YAML: {exc}") from exc
        definition = parse_sidecar_document(document)

        source_rel = definition["source"]
        expected_sidecar_rel = derive_sidecar_relative_path(source_rel)

        sidecar_resolved = sidecar_path.resolve()
        if not sidecar_resolved.is_relative_to(root):
            raise ValidationError("sidecar resolves outside the query root")
        actual_sidecar_rel = sidecar_resolved.relative_to(root).as_posix()
        if actual_sidecar_rel != expected_sidecar_rel:
            raise ValidationError(
                "sidecar is not adjacent to its source: "
                f"expected {expected_sidecar_rel!r}, found {actual_sidecar_rel!r}"
            )

        source_path = resolve_beneath_root(root, source_rel)
        if not source_path.is_file():
            raise ValidationError(f"source not found or not a file: {source_rel}")
        source_bytes = source_path.read_bytes()
        try:
            source_text = source_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValidationError(f"source is not valid UTF-8: {exc}") from exc

        declared_names = {
            parameter["name"] for parameter in definition["parameters"]
        }
        required_names = {
            parameter["name"]
            for parameter in definition["parameters"]
            if parameter["required"]
        }
        check_source_safety(source_text, declared_names, required_names)
    except ValidationError as exc:
        print(f"VALIDATION-ERROR: {exc}", file=sys.stderr)
        return 1

    print(
        f"ok  validate: {definition['id']}  "
        f"source={source_rel}  sidecar={actual_sidecar_rel}"
    )
    return 0


def run_evaluate(sidecar: str, adapter_output: str, evidence: str) -> int:
    """Evaluate normalized adapter output and write redacted evidence.

    Malformed or ambiguous input never raises: it is recorded as
    ``inconclusive``. Returns ``1`` only when the evidence file cannot be
    written.
    """
    sidecar_path = Path(sidecar)
    adapter_path = Path(adapter_output)
    evidence_path = Path(evidence)

    sidecar_bytes = b""
    try:
        sidecar_bytes = sidecar_path.read_bytes()
    except OSError:
        sidecar_bytes = b""

    definition: Optional[SidecarDefinition] = None
    if sidecar_bytes:
        try:
            document = parse_yaml_text(sidecar_bytes.decode("utf-8"))
        except (UnicodeDecodeError, yaml.YAMLError):
            document = None
        if document is not None:
            try:
                definition = parse_sidecar_document(document)
            except ValidationError:
                definition = None

    source_bytes: Optional[bytes] = None
    if definition is not None:
        source_path = derive_adjacent_source_path(sidecar_path, definition["source"])
        if source_path is not None and source_path.is_file():
            try:
                source_bytes = source_path.read_bytes()
            except OSError:
                source_bytes = None

    adapter: object = None
    try:
        adapter = parse_json_text(adapter_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        adapter = None

    record = build_evidence_record(
        definition, sidecar_bytes, source_bytes, adapter
    )

    try:
        write_evidence_record(evidence_path, record)
    except OSError as exc:
        print(f"EVIDENCE-WRITE-ERROR: {exc}", file=sys.stderr)
        return 1

    print(
        f"ok  evaluate: verifier_id={record['verifier_id']} "
        f"verdict={record['verdict']} evidence={evidence}"
    )
    return 0


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser with the two v1 subcommands."""
    parser = argparse.ArgumentParser(
        prog="query_verification",
        description=(
            "Validate an incident-owned SQL verifier sidecar and evaluate "
            "normalized adapter output offline. This tool never executes SQL, "
            "reads credentials, opens a network connection, or invokes a "
            "subprocess."
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser(
        "validate",
        help="Validate one sidecar and its adjacent root-contained source.",
    )
    validate_parser.add_argument(
        "--query-root",
        required=True,
        help="Invocation-time filesystem boundary for this validation call only.",
    )
    validate_parser.add_argument(
        "--sidecar",
        required=True,
        help="Path to the adjacent .verifier.yaml sidecar.",
    )

    evaluate_parser = subparsers.add_parser(
        "evaluate",
        help="Evaluate normalized adapter output and write redacted evidence.",
    )
    evaluate_parser.add_argument(
        "--sidecar",
        required=True,
        help="Path to the validated adjacent .verifier.yaml sidecar.",
    )
    evaluate_parser.add_argument(
        "--adapter-output",
        required=True,
        help="Path to normalized adapter-output JSON.",
    )
    evaluate_parser.add_argument(
        "--evidence",
        required=True,
        help="Path where the redacted case-evidence JSON is written.",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    """Run the CLI and return the process exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "validate":
        return run_validate(args.query_root, args.sidecar)
    if args.command == "evaluate":
        return run_evaluate(args.sidecar, args.adapter_output, args.evidence)
    parser.error(f"unknown command: {args.command!r}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
