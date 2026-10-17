# Query Verification Protocol — v1 (incident pilot)

> **Status:** Normative for the implemented incident-only pilot.
> **Scope:** Local validation of one incident-owned SQL verifier sidecar and local evaluation of one normalized adapter result.
> **Non-goal:** This protocol never grants the core database credentials, query execution, command invocation, network access, or persistent query-root configuration.

## 1. Actors and trust boundary

| Actor | Owns | Does not own |
|---|---|---|
| Core skill | Reading local files beneath an invocation-time query root; parsing the sidecar; lexical source-safety checks; evaluating normalized output; writing redacted evidence. | Database connections, SQL execution, credentials, adapter invocation, network access, subprocesses. |
| Destination adapter | Binding declared named parameters, executing the read-only query, and returning normalized JSON. | The protocol schema, evidence redaction, or digest computation. |

The core skill accepts no adapter command, credential, connection string, endpoint, or persistent query-root configuration. The only query-root input is the `--query-root` flag supplied to one `validate` invocation; it is never written to a configuration file or reused implicitly. The core never renders or substitutes a parameter value.

## 2. CLI surface

| Subcommand | Required flags | Purpose |
|---|---|---|
| `validate` | `--query-root`, `--sidecar` | Validate one sidecar and its adjacent root-contained source. |
| `evaluate` | `--sidecar`, `--adapter-output`, `--evidence` | Evaluate normalized output and write redacted evidence. |

`validate` exits non-zero on any rejection. `evaluate` never raises for malformed input; it records `inconclusive`.

## 3. Verifier layout

A verifier is one `.sql` source plus one adjacent sidecar in the same directory. The sidecar is the verifier definition and its filename is the source stem plus `.verifier.yaml`.

| Element | Rule |
|---|---|
| Query root | Supplied at invocation time with `--query-root`; the validation boundary for this call only. |
| Source | Normalized relative POSIX path ending in `.sql`, resolved strictly beneath the query root. |
| Sidecar | Adjacent to the source; root-relative path is the source path with `.verifier.yaml` replacing `.sql`. |
| Adjacency | The sidecar and its source share a directory; a source without its sibling sidecar, or a sidecar without its sibling source, is rejected. |
| Containment | Absolute paths, traversal segments, and symlink escapes outside the root are rejected. |

## 4. Sidecar contract (closed)

Unknown fields are rejected. Missing or wrong-typed required fields are rejected.

| Field | Type | Required | Rule |
|---|---|---|---|
| `schema_version` | integer | yes | Exactly `1`. |
| `id` | string | yes | Stable, non-empty verifier identifier. |
| `team` | string | yes | Exactly `incident`. |
| `source` | string | yes | Normalized relative POSIX path ending in `.sql`, beneath the query root. |
| `symptoms` | list of strings | yes | Non-empty. |
| `purpose` | string | yes | Non-empty. |
| `parameters` | list of parameter objects | yes | May be empty; declares every named binding. |
| `safety` | object | yes | See section 4.2. |
| `result_set` | object | yes | Exactly one result set, named `verification`. See section 4.3. |
| `evidence_columns` | list of strings | yes | Non-empty subset of declared columns; includes `verification_verdict`. |
| `redact_columns` | list of strings | yes | Subset of `evidence_columns`; excludes `verification_verdict`; may be empty. |

### 4.1 Parameter object

| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | yes | Lowercase snake_case; unique across the sidecar. |
| `type` | string | yes | One of `integer`, `string`, `decimal`, `boolean`, `date`. |
| `required` | boolean | yes | Whether the current case must supply it. |
| `redaction` | string | no | Optional redaction class label for the parameter value. |

### 4.2 Safety object

| Field | Type | Required | Rule |
|---|---|---|---|
| `operation` | string | yes | Exactly `read_only`. |
| `max_rows` | integer | yes | At least `1`; the v1 result contract is exactly one row. |

### 4.3 Result set object

| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | string | yes | Exactly `verification`. |
| `columns` | list of column objects | yes | Non-empty; each column has `name` and `type`. |

Column `type` is one of `string`, `integer`, `decimal`, `boolean`, `date`. Column names are lowercase snake_case and unique. Exactly one column is named `verification_verdict`. No second result set is permitted.

## 5. Named bindings

The source uses the `:name` bind marker. The validator extracts every `:name` token and requires an exact match with the declared parameter names: no undeclared token and no missing required parameter. Positional markers, interpolation markers, template markers, and parameter string concatenation are rejected. The core never renders or substitutes a parameter value.

## 6. Source safety rules

The validator performs lexical checks only; it never executes the source.

| Rule | Rejection trigger |
|---|---|
| Single statement | A statement separator or more than one statement. |
| Read-only statement | A first keyword other than `SELECT` or `WITH`, or any DDL/DML keyword. |
| No transaction or locking | Transaction control, savepoints, or locking clauses. |
| No interpolation | Interpolation or template markers. |
| Bounded read | No `WHERE`, `LIMIT`, `TOP`, or `FETCH` bound. |
| Declared bindings only | A `:name` token that is not a declared parameter. |
| Source type | A source that is not a `.sql` file. |

## 7. Adapter output contract (closed)

Normalized output is a JSON object with these required fields.

| Field | Type | Rule |
|---|---|---|
| `schema_version` | integer | Exactly `1`. |
| `verifier_id` | string | Must equal the validated sidecar `id`. |
| `source_digest` | string | `sha256:` plus 64 lowercase hex characters; must equal the digest of the adjacent source bytes. |
| `result_set` | string | Exactly `verification`. |
| `rows` | list | Exactly one object. |

The single row object has exactly the declared column names as keys. Unknown keys, missing keys, and type mismatches make the result `inconclusive`. The row must contain `verification_verdict` with one of the three verdict values.

## 8. Verdict semantics

| Verdict | Meaning |
|---|---|
| `verified` | The declared symptom condition is present for this case. |
| `not_verified` | The declared symptom condition is absent for this case. |
| `inconclusive` | The condition cannot be established, or the input is missing, ambiguous, or malformed. |

Only these three values are valid. Any other value makes the result `inconclusive`. A `verified` verdict is symptom evidence only; it never establishes root-cause equivalence or authorizes a fix.

## 9. Case evidence contract (closed)

The evidence record is a JSON object with these required fields.

| Field | Type | Rule |
|---|---|---|
| `schema_version` | integer | Exactly `1`. |
| `verifier_id` | string | The validated verifier identifier. |
| `verdict` | string | One of the three verdicts. |
| `result_set` | string | Exactly `verification`. |
| `source_digest` | string | Digest of the source bytes that were evaluated. |
| `definition_digest` | string | Digest of the sidecar bytes. |
| `evidence` | object | Allowlisted columns; every `redact_columns` value is replaced by `[REDACTED]`. |
| `evidence_digest` | string | Deterministic digest of the redacted record. |

The evidence record never contains raw adapter output, rendered SQL, parameter values, credentials, connection details, or unredacted configured columns.

## 10. Deterministic digests

- `source_digest`: SHA-256 of the source file bytes.
- `definition_digest`: SHA-256 of the sidecar file bytes.
- `evidence_digest`: SHA-256 of a canonical serialization of the evidence record with sorted keys and compact separators, excluding `evidence_digest` itself.

Digests are rendered as `sha256:` followed by 64 lowercase hexadecimal characters.

## 11. Out of scope for v1

- Dev-team verifiers, Dev workflow integration, and problem-record lifecycle.
- External adapter execution, adapter commands, credentials, and connection strings.
- Centralized verifier discovery or a central index.
- Non-SQL sources, multiple result sets, and a general assertion language.
- Persistent query-root configuration.
