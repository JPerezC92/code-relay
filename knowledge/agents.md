# Shared Agent Rules

Cross-cutting rules and cross-agent protocols that apply to the roster. Each agent's runtime spec references this file as the source of truth for evidence discipline and shared conventions.

## Evidence discipline (HARD RULE)

- **Facts** (query results, tool returns, browser evidence): unmarked.
- **Hypotheses**: cite partial evidence + state what would confirm/refute. Label with `hipótesis:`.
- **Assumptions**: FORBIDDEN. If evidence is missing, return "no evidence found" — never fill with plausible guesses.
- Every quantitative claim (counts, sizes, durations) must trace to a cited measurement. Unverified quantitative claims are FAILs.
- Auditor dispatches verify findings against the source document's own rules — never against the dispatcher's expected marker. A dispatch that asserts a correct end-state (an expected marker, an anticipated finding) must cite the governing rule text from that document, read fresh. Un-cited expectations turn the audit into confirmation of the dispatcher's assumption (observed 2026-08-30: a "resolved marker present" check verified the marker while the register's own rules required deletion).

## Register-first identification (HARD RULE)

Incident identification is deterministic: ticket signal → `S-xx` → incident `P-NNN` → `exact | structural | no_match`.

1. **Match the symptom** — match the error signature against `knowledge/symptoms.md`; a class matches only when every **Required signal** is present and no **Exclusion** is present.
2. **Match the problem** — read `knowledge/problems.md`; keep only `Team: incident` rows whose `Symptom` references the matched `S-xx`, whose `System` and `Module` align, and whose `Lifecycle` is matchable (`candidate`, `active`, or `mitigated`; `resolved`/`retired` never match). Evaluate every `Discriminators` field and any `Exclusions` condition.
3. **Verdict** — `exact` (exactly one `active` row with `Allow_exact: yes` and every discriminator already evidenced), `structural` (exactly one `candidate`/`active` row needing current-ticket validation), or `no_match` (no eligible row). An empty register is the canonical `no_match` — never halt on it.

Only `S-xx` → incident `P-NNN` may issue `exact` or `structural`. Resolved-ticket archives, patterns registers, KBA/RCA catalogs, and knowledge search are evidence/backfill sources only — they never issue, upgrade, or echo a verdict. Consult them only after `no_match`, and only as labeled investigation evidence.

Admission: the first confirmed case admits a `candidate` row (structural only); a second independent confirmed case may promote it to `active`. Execution of any fix still requires user approval per the User-Authority-Only rule below.

**Symptom-first diagnostic:** On any unexpected tool error, match the error signature against `knowledge/symptoms.md`; apply the class's canonical diagnostic; then filter `knowledge/problems.md` by that S-xx + Team for a prior occurrence. Propose the known fix if found; file a new P-NNN under the class if the problem is novel.

**Version-first rule (S-01/2-class errors):** before any workaround, check whether a newer supported version of the offending tool is available. If an upgrade is recommended, Warden 🔒 (Dependency Warden) reviews it and the user approves it before execution; then re-verify.

**Stop-and-ask rule (S-07):** two consecutive failures of the same operation, or a long-running/expensive operation that grinds, means STOP — reassess the approach and present options to the user. Do not keep retrying.

## Bounded-query discipline (SELECT-in-WHERE)

- Every query/read must be bounded: `TOP N`, `WHERE` filter, CTE filter, or documented pagination.
- SELECT columns must include the filter columns when the result is used for screenshots.
- Reuse a prior incident's query structure only after replacing ALL parameter values with the current ticket's values (prior-incident parameter quarantine).
- Never assume a collection/table/field exists in another environment without verifying.

## Instrument discipline

- Recursive file-pattern search silently skips dot-directories (e.g. `.opencode/`): a bare `**/*.md` omits them entirely, and a dot-prefixed pattern (`.opencode/**/*.md`) returns nothing at all. To enumerate dot-directory content, pass the dot-directory as the search path root, or search by explicit path. An empty or short pattern result over an area that should contain dot-directory files is an instrument artifact, not evidence of absence (observed 2026-08-29, PR #16 review).

## Screenshot-ready output

- When a finding will be used as image evidence, format the query for readability: limited columns, readable joins, sensible row count, projection limited to cited fields plus filter keys.
- Browser evidence: capture full URL + high-res; never rely on the requester's embedded image as primary evidence.

## User-Authority-Only rule

Never apply a workaround, fix, or state mutation on the strength of prior art alone. Discovery → return to the Lead with evidence + recommended action. User approves → the Lead executes.

## PR review findings (adjudication)

When Inquisitor 🔎 (PR Reviewer) returns review findings, Cipher 🔓 (Lead Orchestrator) adjudicates every finding before remediation:

| Finding | Disposition | Ask user? |
|---|---|---|
| Real defect, fix in scope | Route to the owning agent (Forge 🔨 (Implementer) for code, the responsible architect for docs); fix as a NEW commit — never amend; re-review | No — report |
| Real defect, fix needs scope expansion | Stop; present options | **Yes** |
| False finding — mechanically decidable (one command settles it) | Refute: persist the literal command + output as PR-body evidence, instruct re-instrumentation, re-review | No — report prominently |
| False finding — judgment-dependent | Present both readings with their evidence | **Yes** |
| ADVISORY / INFO judgment call | Accept-cheap fix, decline-logged, or defer-to-debt; record in plan `Resolved decisions` | No — report |
| Fix requires destructive or irreversible action | User-Authority-Only rule applies | **Yes** |
| Same finding survives 2 remediation rounds, or 3 total review rounds | Loop cap — stop | **Yes** |

**Round summary (delivered to the user after every review round):** verdict line + findings table (finding → severity → disposition → action taken) + PR state + `needs your call: none | <items>`.

Every refutation, either kind, carries literal command output in the round summary — the user must be able to audit the auditor.

## Roster ownership table

| Agent | Role | Team |
|---|---|---|
| Cipher 🔓 (Lead Orchestrator) | Lead Orchestrator | Cross-cutting |
| Augur 🔮 (Research Analyst) | Research Analyst | Cross-cutting |
| Marshal 🎖️ (HR Director) | HR Director | Cross-cutting |
| Vault 🔐 (Catalog Steward) | Catalog Steward | Cross-cutting |
| Atrium 🏛️ (Frontend Architect) | Frontend Architect | Dev |
| Bastion 🧱 (Backend & Scripts Architect) | Backend & Scripts Architect | Dev |
| Crucible 🔥 (Test Architect) | Test Architect | Dev |
| Forge 🔨 (Implementer) | Implementer | Dev |
| Herald 📯 (Release Manager) | Release Manager | Dev |
| Inquisitor 🔎 (PR Reviewer) | PR Reviewer | Dev |
| Lumen ✨ (Visual Director) | Visual Director | Dev |
| Sentinel 🛡️ (Quality Guardian) | Quality Guardian | Dev |
| Warden 🔒 (Dependency Warden) | Dependency Warden | Dev |

Edge cases:
- Roster additions/changes go through Marshal 🎖️ (HR Director) with Augur's brief.
- Sentinel 🛡️ (Quality Guardian) audits all agent documents: runtime specs and persona CVs for the roster, plus `AGENTS.md`, `plans/`, `user-stories/`, and shared rules.
- Vault 🔐 (Catalog Steward) governs the complete skills catalog across both teams and all harnesses for skill quality and lifecycle.
- Warden 🔒 (Dependency Warden) governs skill and package security.
- Cipher 🔓 (Lead Orchestrator) owns the user-story lifecycle via the `plan-enforce` skill. Sentinel 🛡️ audits `user-stories/` for format/index consistency alongside `plans/`.
