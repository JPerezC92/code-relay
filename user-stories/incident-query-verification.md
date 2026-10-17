<!-- core:begin -->
# User story — incident-query-verification

> **Created:** 2026-09-10
> **Title:** Incident query verification
> **Status:** active
> **version:** 1.2.1
> **Epic:** incident-diagnostics
> **Affected areas:** `.opencode/skills/query-verification/`, `.opencode/skills/ticket-runbook/`, `.opencode/agents/crucible.md`, `knowledge/`

## Persona

- An incident investigator who must establish whether a current ticket exhibits a known data symptom without guessing or exposing sensitive case data.

## Goal

- **G:** Validate a destination-owned, read-only diagnostic query definition and evaluate its trusted result without giving the shared query-verification skill database credentials or query-execution authority.
  - Done when: the query-verification skill produces a redacted, digest-bound `verified`, `not_verified`, or `inconclusive` evidence record from a root-contained incident verifier and normalized adapter output.

## Scenario

- An incident ticket has a known symptom and a destination-owned SQL diagnostic query. The investigator validates its sidecar definition, obtains normalized output from the destination's trusted adapter, and records the three-state verdict as investigate-step evidence while consuming one existing query-budget slot.

## Acceptance criteria

- ✅ **AC1:** A sidecar verifier is accepted only when it is incident-owned, adjacent to its root-contained SQL source, read-only, bounded, and uses declared named bindings.
- ✅ **AC2:** Unsafe SQL, path escapes, malformed metadata, untrusted output mismatches, and ambiguous result shapes produce a rejection or `inconclusive` verdict without query execution.
- ✅ **AC3:** The evidence record redacts configured values, binds verifier/source/definition digests to the verdict, and retains neither raw adapter output nor credentials.
- ✅ **AC4:** The optional investigate-step verifier path consumes one existing query-budget unit and never treats a verified symptom as automatic root-cause confirmation.
- ✅ **AC5:** The skill, protocol, fixtures, and the living design's shared contract are available to ticket-enabled destination projects.
- ✅ **AC6:** The shipped valid adapter-output fixture is independently protocol-valid and its source digest is guarded against fixture/source drift.
- ✅ **AC7:** Reusable verifier persistence is destination-selected: the destination chooses its query-storage location, the problem row's Evidence records a pointer to the sidecar, and a later structural match replays the pair with current-ticket parameters under the same protocol (schema unchanged, one query-budget slot).
- ✅ **AC8:** The diagnostic-query protocol remains the only sidecar contract — one read-only SELECT, one row, three-state verdict. Identification packs use a separate Evidence pointer and are not evaluated by the diagnostic evaluator.

## Proof

- AC1 → `.opencode/skills/query-verification/references/protocol-v1.md` `## 3. Verifier layout`, `## 4. Sidecar contract (closed)`, `## 5. Named bindings`, and `## 6. Source safety rules` · `.opencode/skills/query-verification/scripts/test_query_verification_paths.py` `QueryVerificationPathTests`
- AC2 → `.opencode/skills/query-verification/scripts/test_query_verification_sql_safety.py` `QueryVerificationSqlSafetyTests` · `.opencode/skills/query-verification/scripts/test_query_verification_sidecar_schema.py` `QueryVerificationSidecarSchemaTests` · `.opencode/skills/query-verification/scripts/test_query_verification.py` `QueryVerificationEvaluationTests` inconclusive cases
- AC3 → `.opencode/skills/query-verification/scripts/test_query_verification.py` `test_evaluate_verified_redacts_and_binds_digests` · `.opencode/skills/query-verification/references/protocol-v1.md` `## 9. Case evidence contract (closed)` and `## 10. Deterministic digests`
- AC4 → `.opencode/skills/ticket-runbook/SKILL.md` `### Optional verifier route (investigate step)` · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_step_mode.py` `ValidateRunbookStepModeTests` · `.opencode/skills/ticket-runbook/scripts/test_validate_runbook_header_budgets.py` `test_query_budget_compared_to_denominator`
- AC5 → `.opencode/skills/query-verification/references/protocol-v1.md` `## 3. Verifier layout` · `.opencode/skills/query-verification/scripts/test_query_verification_fixtures.py` `QueryVerificationFixtureTests` · `knowledge/diagnostic-system-design.md` `## Purpose`
- AC6 → `.opencode/skills/query-verification/scripts/test_query_verification.py` `test_valid_fixture_evaluation_writes_verified_evidence` · `.opencode/skills/query-verification/scripts/_query_verification_testkit.py` `_load_static_adapter` · `.opencode/skills/query-verification/scripts/test_query_verification_fixtures.py` `test_valid_fixture_trio_passes_validation`
- AC7 → `knowledge/diagnostic-system-design.md` `## Portability contract` · `knowledge/problems.md` `## Entry format` → Evidence
- AC8 → `.opencode/skills/query-verification/references/protocol-v1.md` `## 6. Source safety rules`, `## 7. Adapter output contract (closed)`, and `## 8. Verdict semantics` · `.opencode/skills/ticket-runbook/SKILL.md` `### Optional verifier route (investigate step)` · `knowledge/problems.md` `## Entry format`

## Constraints

- The shared query-verification skill never connects to a database and never executes a diagnostic query — because the skill must not acquire production credentials or query-execution authority.
- The protocol is sidecar-only and incident-only; Dev workflow integration and centralized catalogs are out of scope — because this incident-only route is deliberately narrow and auditable.
- A verified symptom is never automatic root-cause confirmation — because symptom presence and cause are different claims.
- Identification packs use a separate Evidence pointer and are not evaluated by the diagnostic evaluator — because a multi-statement correlation is not a single-query protocol-v1 verdict.
- The shipped adapter-output fixture's source digest is asserted against its SQL fixture — because a drifted fixture silently proves nothing.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
