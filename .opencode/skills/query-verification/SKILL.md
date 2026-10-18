---
name: query-verification
description: Validate an incident-owned, root-relative SQL verifier sidecar and evaluate trusted normalized adapter output offline, then write redacted digest-bound case evidence with exactly one of the verdicts verified, not_verified, or inconclusive. Use when an incident ticket needs offline verification of a reusable diagnostic query without the core skill executing SQL or holding database credentials.
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 1.0.2
  dependencies: PyYAML==6.0.3
---
<!-- core:begin -->

## Mandatory core

### What I do

Validate and evaluate one incident-owned, sidecar-defined SQL verifier entirely offline, then emit a redacted case-evidence record. The core validates local artifacts and evaluates trusted normalized output; it never connects to a database, executes SQL, reads credentials, invokes a subprocess, or holds persistent query-root configuration.

The contract is closed and incident-only. Exactly three verdicts exist: `verified`, `not_verified`, and `inconclusive`.

### When to use me

- An incident ticket has a known data symptom and a destination-owned, read-only SQL diagnostic query.
- The investigator needs a three-state, redacted, digest-bound verification record for optional investigate-step evidence.
- Cipher 🔓 (Lead Orchestrator) dispatches this skill after the ticket's symptom is classified and a root-relative verifier sidecar exists.
- Keywords: `query verification`, `verifier sidecar`, `verification_verdict`, `query-verification`, `adapter output`.

### Boundary

| Actor | Responsibility |
|---|---|
| Destination adapter | Binds the declared named parameters, executes the read-only query, and returns normalized JSON. |
| This skill | Validates the sidecar against an explicit query root, evaluates normalized output, and writes redacted evidence. |

The skill accepts no adapter command, credential, connection string, or persistent query-root setting. The `--query-root` flag is an invocation-time filesystem boundary for the current `validate` call only; it is never written to configuration or reused implicitly.

### Steps

1. Read the skill's protocol reference (see **Reference files**) and confirm the v1 boundary.
2. Validate the sidecar against its root by running the query-verification script (see **Query-verification script**) with the `validate` subcommand, passing the query root and the sidecar path (see **Example paths**).
3. On non-zero exit, stop and report the rejection reason. Do not execute the query or continue to evaluation.
4. Hand the validated sidecar to the destination-owned adapter. The adapter binds the declared named parameters from the current case and returns normalized JSON matching the shape of the adapter-output reference (see **Reference files**). That file is a shape example only — its source is not shipped, so its digest values are illustrative and cannot be reproduced by a reader.
5. Evaluate the normalized output locally by running the query-verification script (see **Query-verification script**) with the `evaluate` subcommand, passing the sidecar, the adapter output, and the evidence path.
6. Write the evidence record under the ticket's session-specific `validations/` folder using the verifier ID as the filename stem, then report the verifier ID, verdict, and digests to Cipher 🔓 (Lead Orchestrator).

### Evidence output

The evidence record matches the shape of the case-evidence reference (see **Reference files**); that file is an illustrative example whose digest values cannot be reproduced by a reader. It carries the verifier ID, exactly one verdict, the source and definition digests, the allowlisted evidence values with configured redaction applied, and a deterministic digest of the redacted record. It never carries raw adapter output, rendered SQL, parameter values, credentials, connection details, or unredacted configured identifiers.

### Safety boundaries

- Core validates and evaluates local artifacts only; the destination adapter binds and executes.
- `--query-root` is an invocation-time boundary, never persisted configuration.
- The validator rejects root escapes, non-adjacent sidecars, non-`incident` teams, non-`read_only` operations, unsafe SQL tokens, multiple statements, template markers, unbounded reads, and undeclared bindings.
- Evaluation fails closed to `inconclusive` on any missing, duplicated, malformed, mismatched, or ambiguous input.

### Examples

**Example 1 — valid incident verifier**

- The sidecar is adjacent to its root-relative `.sql` source and declares `team: incident`, `safety.operation: read_only`, named bindings, result set `verification`, a `verification_verdict` column, configured evidence columns, and configured redaction columns.
- `validate` exits 0; the adapter returns one row; `evaluate` writes evidence with verdict `verified`.

**Example 2 — unsafe definition rejected before execution**

- The source contains a statement separator, an interpolation marker, or an undeclared bind marker.
- `validate` exits non-zero; no adapter execution occurs.

**Example 3 — malformed output fails closed**

- The adapter output carries a mismatched source digest or two rows.
- `evaluate` writes evidence with verdict `inconclusive`; no raw output is retained.

### Troubleshooting

**Validator reports a root escape or non-adjacent sidecar:**
- Cause: the source path is absolute, contains traversal, resolves outside the query root, or the sidecar is not the `.sql` sibling.
- Fix: move the sidecar beside its source under the declared root and use a normalized relative POSIX source path.

**Evaluator reports `inconclusive`:**
- Cause: a digest mismatch, a wrong result-set name, zero or multiple rows, a missing or extra column, a type mismatch, or an unknown verdict value.
- Fix: re-run validation, confirm the adapter executed the exact validated source, and confirm the declared columns and the three-state verdict enum.

**Sidecar rejected for unknown or missing fields:**
- Cause: the v1 schema is closed; unknown fields and missing required fields are rejected.
- Fix: compare the sidecar against the verifier-sidecar schema reference (see **Reference files**) and remove or add the exact fields.

### Reference files

- Protocol reference: `references/protocol-v1.md`
- Adapter-output shape reference: `references/adapter-output-v1.json`
- Case-evidence shape reference: `references/case-evidence-v1.json`
- Verifier-sidecar schema reference: `references/verifier-sidecar-v1.yaml`
<!-- core:end -->

<!-- project:begin -->
## Project extensions

### Python invocation

This project's `<python>` is `python3` (never `python`; no pytest or other test framework is added).

### Query-verification script

This project's query-verification script is `python3 .opencode/skills/query-verification/scripts/query_verification.py`, invoked with the `validate` or `evaluate` subcommand.

### Example paths

This project has not declared a query-storage path for reusable verifier pairs (a parameterized `.sql` beside its `.verifier.yaml` sidecar) or identification packs. Per `knowledge/problems.md` **Operational gate**, ask the user for the destination-relative path at first use of a reusable confirming query, then record it here.

Example path shapes (query-verification protocol-v1; every path is passed explicitly at invocation):

- Query root: the directory holding the parameterized `.sql` (the sidecar sits beside it).
- Sidecar: `<query-root>/<name>.verifier.yaml`.
- Adapter output: `<ticket-folder>/validations/<name>.adapter-output.json`.
- Case-evidence output: `<ticket-folder>/validations/<name>.case-evidence.json`.

<!-- project:end -->
