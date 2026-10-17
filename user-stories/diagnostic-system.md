<!-- core:begin -->
# User story — diagnostic-system

> **Created:** 2026-10-14
> **Title:** Diagnostic system
> **Status:** active
> **version:** 1.0.0
> **Epic:** incident-diagnostics
> **Affected areas:** `knowledge/symptoms.md`, `knowledge/problems.md`, `knowledge/diagnostic-system-design.md`

## Persona

- A team agent on incident or dev work who must classify an observed issue, identify a known problem, verify it with reusable evidence, and file or enrich a problem record — without guessing and without placing payloads in the registers.

## Goal

- **G:** Diagnosis is one durable-knowledge loop shared by both teams — symptom class → problem pattern → verdict — with reusable verifiers proving symptoms and redacted case evidence retained; the registers stay thin (pointers and verdicts, never payloads), and the system's living design ships its shared contract while keeping refinement state local.
  - Done when: the catalog classifies observed signatures; identification issues its verdicts from the register only; verification yields exactly three verdicts from read-only bounded input and retains only redacted, digest-bound evidence; the registers hold pointers and verdicts only; and the living design carries the system name and delivers its shared contract while the source project's refinement state stays home.

## Scenario

- An incident case arrives with a known symptom class and a destination-owned diagnostic query. The agent classifies the observation, identifies register-first, validates the sidecar verifier, obtains normalized output from the destination's trusted adapter, records the three-state verdict as evidence, and files or enriches the problem record.
- The incident route composes the `register-first-incident-identification` contract (`exact`, `structural`, `no_match`) and the `incident-query-verification` contract (`verified`, `not_verified`, `inconclusive`); the second establishes symptom evidence, not a second identification matcher or automatic root-cause confirmation.
- A dev issue runs the same loop with its team's rows; team ownership is recorded on every problem row.
- A destination receives the system's catalog, register, and living design; its filed rows and refinements survive every core update.

## Acceptance criteria

- ✅ **AC1 — Core model:** The symptom catalog, the problem register, the destination query library, verifier definitions, verifiers, and case evidence each have one declared responsibility; registers hold pointers and verdicts, never query payloads or result tables.
- ✅ **AC2 — Register interaction:** Verification attaches to the registers only as routing and evidence references: symptoms may route through verifiers, problems may cite them only after case evidence confirms a recurring root-cause pattern, repeated cases enrich existing records instead of duplicating them, and no problem record is created merely because a verifier exists or a symptom is observed.
- ✅ **AC3 — Portability:** The destination declares its diagnostic-query storage; the system defines the protocol and pointer semantics, never the destination's layout.
- ✅ **AC4 — Evidence invariants:** Every verification on either team is read-only and bounded, yields exactly one of `verified`, `not_verified`, or `inconclusive`, and retains only redacted, digest-bound evidence; a verified symptom is never automatic root-cause confirmation.
- ⬜ **AC5 — Two-team loop:** Both teams run the same loop — classify, identify register-first, verify, file or enrich — with team ownership recorded on every problem row.
- ✅ **AC6 — Naming:** The system and its living design are named for the business predicate *diagnostic system* rather than for one mechanism the system contains, and the living design document carries the system name.
- ✅ **AC7 — Living-design companion:** The living design delivers the shared approach — model, contracts, flow, register interaction, constraints — and keeps the source project's refinement state local; destinations receive the contract and never the source's refinement state.

## Proof

- AC1 → `knowledge/diagnostic-system-design.md` `## Core model` · semantic review
- AC2 → `knowledge/diagnostic-system-design.md` `## Register interaction` · `knowledge/problems.md` `## Rules`
- AC3 → `knowledge/diagnostic-system-design.md` `## Portability contract`
- AC4 → `knowledge/diagnostic-system-design.md` `## Verification and evidence constraints` · `knowledge/agents.md` `### Bounded-query discipline (SELECT-in-WHERE)`
- AC5 → `knowledge/diagnostic-system-design.md` `## Current two-team workflow map`
- AC6 → `knowledge/diagnostic-system-design.md` document title · `knowledge/agents.md` `### Artifact naming (HARD RULE)` · naming review
- AC7 → `knowledge/diagnostic-system-design.md` core/project region split, `## Purpose`, `## Core model`, and `## Portability contract`

## Constraints

- The registers carry pointers and verdicts, never inlined SQL or result tables — because the destination owns storage and the registers must stay thin.
- The destination owns its diagnostic-query layout — because the system defines protocol and pointer semantics, not storage.
- A verified symptom is never root-cause confirmation — because symptom presence and cause are different claims.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
