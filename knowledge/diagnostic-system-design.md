<!-- core:begin -->
# Diagnostic System Design

## Purpose

The implemented incident query verification is the `query-verification` OpenCode skill at `.opencode/skills/query-verification/`. It validates one incident-owned, sidecar-defined SQL verifier against an invocation-time query root and evaluates trusted normalized adapter output offline, producing a redacted, digest-bound case-evidence record with exactly one verdict: `verified`, `not_verified`, or `inconclusive`. Its normative contract is `references/protocol-v1.md` in that skill.

This living design records the approach to query verification across destination projects. The implemented incident query verification does not change the registers' paths, identifiers, schema, or runtime behavior, and it imposes no executable behavior on agents. The core skill validates and evaluates local artifacts only; a destination-owned trusted adapter binds parameters and executes the query. The core skill never connects to a database, executes SQL, reads credentials, invokes an adapter command, or holds persistent query-root configuration. Ticket-enabled destinations receive the skill and this design document during destination onboarding (clearance delivery model: a cleared source ships its core region byte-for-byte and the destination owns its project region / skills wave); incident query verification adds no root dependency, lockfile, runtime configuration, credential, or destination query-library change.

The goal is to let an incident case safely reuse a diagnostic query without placing large, project-specific SQL in the symptom or problem registers.

**Destination chooses storage:** the destination chooses and declares its base folder for reusable diagnostic queries; the shared diagnostic system defines the protocol, never the destination directory. A problem row's Evidence points to a stored verifier with `diagnostic:<destination-relative-sidecar-path>` — the pointer is the discovery mechanism for later `structural` tickets, which validate the pair with the sidecar's parent as the `--query-root` and rebind current-ticket values through the destination adapter (one query-budget slot). Pointer-based discovery does not create persistent query-root configuration.

**Identification packs:** a problem row's Evidence may also carry an optional `pack:<destination-relative-pack-path>` pointer to a reusable identification pack — a multi-statement or multi-result correlation the destination stores at its own chosen location. A pack is not a verifier: it has no sidecar, no one-row result contract, and is never validated or evaluated by `query_verification.py` or protocol-v1. A later `structural` ticket follows the `pack:` pointer first, resolving the destination-relative path and replaying the correlation with current-ticket keys under destination-owned execution; the core skill never executes or parses the pack internals. The destination chooses the pack's directory, filename, and layout; the shared diagnostic system defines the pointer and replay order only.

## Core model

The symptom and problem registers, diagnostic-query library, verifier definitions, verifiers, and case evidence have different responsibilities:

| Surface | Responsibility |
|---|---|
| `knowledge/symptoms.md` | Durable symptom classes and canonical diagnostic routing. |
| `knowledge/problems.md` | Evidence-backed recurring problem patterns, their root causes, fixes, and team ownership. |
| Destination diagnostic-query library | Large reusable diagnostic queries, such as SQL, document, or script queries. |
| Verifier definition | Machine-readable YAML metadata that links a diagnostic query to query verification. |
| Verifier | A diagnostic query together with its verifier definition. |
| Case evidence | Retained ticket/task proof from a verification execution: the verifier ID, the verdict, the bound digests, and the redacted evidence values. The implemented incident query verification does not retain raw query output. |

A verifier can establish that a symptom is present for a particular case. It does not establish a root cause unless its declared result contract directly tests that cause.

## Portability contract

The shared diagnostic system must define the protocol, not prescribe a destination's query-library layout.

Each destination project will declare one base folder containing reusable diagnostic queries. Valid examples include `sql/queries/`, `support/diagnostics/`, and `operational-data/checks/`. Within that base folder, the destination may organize files by system, module, country, product, or any other local convention.

Every diagnostic query intended to verify a symptom must have a YAML verifier definition. The implemented incident query verification requires a sidecar file beside the diagnostic query:

```text
<declared-query-root>/
  <destination-defined-subfolders>/
    Festival_DiagnosticoMonto.sql
    Festival_DiagnosticoMonto.verifier.yaml
```

The sidecar layout is required for the implemented incident query verification. A centralized YAML index remains a deferred consideration if it can preserve the same verifier-definition contract and reliably map each definition to one diagnostic query.

Not every symptom requires query verification. A symptom may require logs, browser evidence, code inspection, or another diagnostic method. A verifier definition is required only for reusable query verification.

## Implemented incident query verification contract (v1)

The implemented incident query verification is closed, incident-only, SQL-source-only, and sidecar-only. Its normative contract lives in `.opencode/skills/query-verification/references/protocol-v1.md`; the static shapes are `verifier-sidecar-v1.yaml`, `adapter-output-v1.json`, and `case-evidence-v1.json` in the same folder.

| Element | Implemented v1 rule |
|---|---|
| Team | `team: incident` only. |
| Source | One normalized relative POSIX `.sql` path beneath the invocation-time `--query-root`. |
| Sidecar | One adjacent `.verifier.yaml` beside the source. |
| Safety | `safety.operation: read_only`; exactly one bounded result set. |
| Bindings | Declared named `:name` parameters only; no interpolation or concatenation. |
| Result set | Exactly one result set named `verification` with exactly one `verification_verdict` column. |
| Evidence | Configured `evidence_columns` retained, configured `redact_columns` replaced by `[REDACTED]`, verdict bound to verifier/source/definition digests. |
| Verdicts | Exactly `verified`, `not_verified`, or `inconclusive`. |
| Execution | The destination-owned adapter binds and executes; the core skill validates and evaluates local artifacts only. |

## Broader verifier-definition contract (deferred)

This broader shape remains a design proposal and is not implemented. Each verifier definition may eventually define at least:

| Field | Purpose |
|---|---|
| `id` | Stable, destination-unique verifier identifier. |
| `team` | Owning team for the verifier. Register team vocabulary is `incident` and `dev`; the implemented v1 verifiers accept `incident` only. |
| `source` | Diagnostic-query path relative to the destination's declared query root. |
| `symptoms` | One or more destination symptom IDs that the verifier can verify. |
| `purpose` | Short description of what the verifier proves or rules out. |
| `parameters` | Declared typed inputs, including source, requiredness, and redaction needs. |
| `assertions` | Result-set/field conditions that produce a verification verdict: verified, not-verified, or inconclusive. |
| `safety` | Operation type, required filters, and any environment preconditions. |
| `result_sets` | Named query-output result-set descriptions when a diagnostic query emits more than one output. |

Illustrative shape:

```yaml
id: incident.sb.festival-amount.v1
team: incident
source: SB/Festival_DiagnosticoMonto.sql
symptoms:
  - S-SB-FESTIVAL-AMOUNT-DIFFERENCE
purpose: Reconcile an order's persisted and reconstructed Festival amount.
parameters:
  - name: campaign_id
    type: integer
    required: true
  - name: consultant_identifier
    type: string
    required: true
    redaction: internal_identifier
  - name: country
    type: country
    required: true
    usage: connection_selection
assertions:
  - id: context-resolves
    pass_when: exactly_one_order_is_found
    on_failure: inconclusive
  - id: amount-differs
    observed_from: RS5.MontoFestivalCalculado vs RS2.MontoFestival
    pass_when: absolute_difference > 0.01
    on_pass: symptom_verified
safety:
  operation: read_only
  required_filters:
    - campaign_id
    - consultant_identifier
```

The sample is a design illustration of the deferred broader shape. The implemented incident query verification does not use `assertions`, `result_sets`, or `required_filters`; its closed v1 contract is the section above. Field names, comparison syntax, and any eventual broader schema remain to be defined before implementation.

## Query-verification flow

In the implemented incident query verification, the destination-owned adapter performs the execution step; the core skill performs only the local validate and evaluate steps. The full flow below remains the design target; steps marked **(deferred)** are not implemented by incident query verification.

```text
New incident or development case
        |
        v
Classify the observed issue to a symptom ID
        |
        v
Locate a verifier (its verifier definition and diagnostic query) for the current team, symptom, and system/module
        |
        v
Validate and supply declared case-specific parameters
        |
        v
Run the verifier's bounded read-only diagnostic query as a verification execution (destination-owned adapter)
        |
        v
Evaluate the normalized output against the declared result contract to produce a verification verdict (core skill, offline)
        |
        +-- verified ------> link to an existing problem pattern when applicable
        +-- not_verified --> investigate a different cause
        +-- inconclusive --> collect the missing evidence; do not infer a pass
```

When the same symptom appears in a future case, an agent performs a verification execution of the same verifier with that case's values. A matching result contract produces a verification verdict that verifies a recurrence of the symptom condition; it does not automatically prove that the case shares a prior problem record's root cause. The core skill never runs the query itself.

## Current two-team workflow map

This is a readable map of the shared diagnostic system's current definitions. It does not introduce new behavior. Items marked **Gap** are not yet operationally defined.

### Incident team

| Step | Current flow | Outcome |
|---|---|---|
| 1 | New incident ticket | Ticket is read through the destination ticket tool. |
| 2 | Classify the observed issue | Match it to a symptom class in `knowledge/symptoms.md` (Required signals present, no Exclusion). |
| 3 | Identify register-first | Filter `knowledge/problems.md` to `Team: incident` rows by symptom + system + module + lifecycle, and evaluate every discriminator and exclusion. The ticket archive, patterns, KBA/RCA, and knowledge search are evidence-only, consulted after `no_match` — they never issue a verdict. |
| 4A | Exact match | Cite the matched `active` `P-NNN` and the known solution; request approval before applying it. |
| 4B | Structural or no match | Create the working analysis (`analysis/`) and have Investigator 🔍 (Incident Investigator) validate the inherited hypothesis (`structural`) or fresh hypotheses (`no_match`). |
| 5 | Confirmed incident evidence | Ledger 📒 (Record Keeper) records the ticket evidence; Quill 🪶 (Note Drafter) prepares the response. |
| 6 | New recurring problem | **Gap:** Scribe ✍️ (Docs & Problems Manager) owns the register by rule, but the complete Markdown `P-NNN` create/update and deduplication handoff is not defined. |
| 7 | Confirmed product defect | **Gap:** no defined handoff starts the Dev plan and implementation flow. |

### Development team

| Step | Current flow | Outcome |
|---|---|---|
| 1 | Dev issue found | The issue may come from an audit, dependency/configuration failure, build/test failure, or application defect. |
| 2 | Classify an unexpected tool error | Shared rules direct the agent to match a symptom class and search `Team: dev` records. |
| 3 | Begin programming work | `plan-enforce` creates a plan before Forge 🔨 (Implementer) writes code. |
| 4 | Implement and verify | Forge 🔨 (Implementer) implements; the applicable architect/test gates review the change. |
| 5 | Release flow | Herald 📯 (Release Manager) handles authorized Git work; Inquisitor 🔎 (PR Reviewer) reviews the PR boundary. |
| 6 | Search or reuse known Dev problems | **Gap:** `plan-enforce` and Forge 🔨 (Implementer) do not currently enforce the `Team: dev` symptom/problem lookup. |
| 7 | File a new Dev problem | **Gap:** shared rules require filing a novel `P-NNN`, but no Dev-specific owner, handoff, or enrichment lifecycle defines how a `Team: dev` record is created and maintained. |

### Intended shared query-verification path

| Start | Find | Verify | Result |
|---|---|---|---|
| Incident ticket (implemented incident query verification) | Symptom ID, team, system/module | Verifier (its verifier definition and destination-owned diagnostic query) with current-case parameters bound by the destination adapter | Verification verdict: `verified`, `not_verified`, or `inconclusive` |
| Dev issue (deferred) | Symptom ID, team, system/module | Verifier with current-case parameters | Verification verdict: `verified`, `not_verified`, or `inconclusive` |

When the verification verdict is `verified`, the agent may link to an existing problem record and recommend its recorded fix. It must not apply a fix or claim root-cause equivalence without the required evidence and approval. The implemented incident query verification covers the incident row only; the Dev row is deferred.

## Register interaction

This query-verification design augments rather than replaces the existing registers:

- A symptom entry may reference one or more verifier IDs as part of its canonical diagnostic routing.
- A problem record may cite a verifier ID only after case evidence confirms a recurring root-cause pattern.
- A ticket/task retains the verifier evidence record from its verification execution: the verifier ID, the verdict, the source and definition digests, and the redacted evidence values. Raw query output, rendered SQL, parameter values, and credentials are not retained by incident query verification.
- A new problem record is not created merely because a verifier exists or a symptom is observed.
- Repeated cases that satisfy the same root-cause evidence enrich or link to the existing problem record instead of creating duplicates.

## Verification and evidence constraints

The implemented incident query verification retains the existing shared query safeguards in `knowledge/agents.md`:

- Queries are bounded and include relevant filter fields in their evidence projection.
- The target schema and environment are verified before use by the destination adapter; the core skill performs lexical safety checks only.
- Values from a prior ticket are never copied into a new case; all parameters come from the current case and are bound by the destination adapter.
- A verifier definition must declare whether its diagnostic query is read-only. Destructive or mutating scripts are never verifiers; incident query verification rejects any `safety.operation` other than `read_only`.
- Parameter rendering is typed and controlled; unbounded text interpolation and dynamic SQL concatenation are not accepted, and the core never renders a parameter value.
- A reusable diagnostic query does not retain customer-specific query output. Incident query verification retains only the redacted, digest-bound evidence record; raw output belongs to destination policy.
- The verdict is exactly `verified`, `not_verified`, or `inconclusive`; missing, zero, or multiple context rows and any malformed or mismatched input produce `inconclusive`, never a silent pass.
<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
