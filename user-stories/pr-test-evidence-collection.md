<!-- core:begin -->
# User story — pr-test-evidence-collection

> **Created:** 2026-10-13
> **Title:** PR test evidence collection
> **Status:** active
> **version:** 1.1.0
> **Epic:** developer-tooling
> **Affected areas:** `.opencode/agents/inquisitor.md`, `.opencode/agents/herald.md`, `AGENTS.md`, `.opencode/skills/git-pr/SKILL.md`, `knowledge/agents.md`

## Persona

- A maintainer whose pull request has reached the review boundary and whose declared test plan must be executed and evidenced without a serial bottleneck or conflicting edits to the PR body.

## Goal

- **G:** Test-plan items at the PR boundary are resolved through accepted current evidence or agent-owned verification; remaining independent checks run concurrently, and every item's evidence lands in the PR body through exactly one active evidence writer.
  - Done when: sufficient evidence bound to the reviewed head is reused; remaining independent ready checks overlap while ordered checks show their reason; agents obtain accessible inputs and ask through the coordinator only for exact user-only input they cannot obtain; each row names its actual executor, action/input, and PR identity; evidence and matching checkboxes are persisted together once per collection join and live-verified; later authorized prose corrections are serialized outside that join; and the gate derives from verified evidence and checkbox states.

## Scenario

- A PR carries several independent unchecked test-plan items that still require execution: their executors run concurrently and one writer records a single consolidated evidence set before the verdict returns.
- Some items depend on each other or compete for the same workspace: they run in order and the ordering reason is visible.
- Boundary review work is large: read-only review slices run concurrently as separate instances, their findings are consolidated, and the PR body is written once per evidence-collection join.
- An item's command has no grant holder: it is reported unroutable for reassignment or an explicit manual/optional decision, and no ungranted role executes it.
- The user requests a checkbox update and sufficient verification evidence already applies to the exact item and immutable head: the evidence is accepted without redundant execution, then the evidence writer persists and live-verifies the matching row and tick. The request alone is not a passing result.
- A check needs input: its responsible agent obtains all accessible evidence first. Only an exact input unavailable to that agent reaches the user through the coordinator; ownership of the remaining check stays with the responsible executor.
- A genuinely performed manual check supplies observed evidence rather than a shell command: the row records the literal action/input and actual executor without inventing a command. A manual/optional designation without a result is not a verified tick.
- Evidence is incomplete, stale, or contradicted: only the actual gap is addressed, and the item remains unresolved until sufficient applicable evidence exists. A later authorized non-evidence prose correction takes exclusive ownership only after the evidence writer releases the body.

## Acceptance criteria

- ✅ **AC1 — Concurrent executor dispatch:** Independent ready test-plan items are dispatched to their grant-holding executors concurrently; items that must run in order carry a visible dependency or shared-resource reason.
- ✅ **AC2 — Executor attribution:** Every executed item records the executor that actually ran it; the PR body's evidence is recorded and verified by a role that never executes the items itself.
- ✅ **AC3 — Single PR-body writer:** Exactly one active writer records evidence rows and checkbox states in the PR body; workers never write concurrently, and a later authorized prose correction requires an explicit serialized handoff outside the completed evidence join.
- ✅ **AC4 — Complete evidence rows:** Each evidence row records the exact test-plan item, PR number, immutable head and review scope, literal performed action and input, observed verdict output, and actual executor; the executed command is included when applicable and never invented for a manual observation.
- ✅ **AC5 — Manifest-gated execution:** An item disposition and dispatch manifest distinguishes accepted existing evidence from required execution and maps remaining work to its executor, expected outcome, and dependency group; validated results converge on one evidence-and-checkbox write followed by a live reread.
- ✅ **AC6 — Parallel read-only review:** Cross-cutting review work may run as concurrent read-only instances whose findings are consolidated by one coordinator; review instances never write the PR body.
- ✅ **AC7 — Unroutable items fail closed:** An item whose command no granted executor may run is marked unroutable and blocks the gate until it receives a legitimate reassignment or explicit manual/optional disposition; a designation alone is not performed verification evidence or a verified tick.
- ✅ **AC8 — Live body verification:** After every PR-body write the writer re-reads the live body; a stale, divergent, or changed-head read blocks the gate instead of overwriting.
- ✅ **AC9 — Evidence-derived gate:** The gate verdict reflects the collected evidence and checkbox states, and a verified item left unticked blocks handoff completion.
- ✅ **AC10 — Agent-owned verification:** Agents remain responsible for obtaining accessible inputs and carrying out assigned checks; the user is asked through the coordinator only for the exact input the responsible agent cannot obtain.
- ✅ **AC11 — Applicable evidence reuse:** Sufficient evidence applicable to the exact item and reviewed immutable head is reused without redundant execution or repeated user requests; stale, incomplete, or contradicted evidence remains unresolved until the actual gap is addressed.

## Proof

- AC1 → `.opencode/agents/inquisitor.md` `##### Dispatch protocol (round-based: manifest → concurrent fan-out → single-writer join)` rounds 1–2
- AC2 → `.opencode/agents/inquisitor.md` `##### Dispatch protocol (round-based: manifest → concurrent fan-out → single-writer join)` round 2 · `##### PR-body evidence boundary` executor field
- AC3 → `.opencode/agents/inquisitor.md` `##### PR-body evidence boundary` single writer · `.opencode/agents/herald.md` `#### Authorized factual prose correction` observed-release handoff · `.opencode/skills/git-pr/SKILL.md` `### Post-PR evidence contract` execution-ownership handoff · walkthrough 2026-10-16: prose correction only after observed evidence-writer release
- AC4 → `.opencode/agents/inquisitor.md` `##### PR-body evidence boundary` · `.opencode/skills/git-pr/SKILL.md` `### Post-PR evidence contract` manual-actions clause · walkthrough 2026-10-16: manual item reused with literal action/observed result/executor and no invented command
- AC5 → `.opencode/agents/inquisitor.md` `##### Dispatch protocol` rounds 1–3 and `##### Evidence intake and classification` · `.opencode/skills/git-pr/SKILL.md` `### Post-PR evidence contract` atomic join · walkthrough 2026-10-16: sufficient/stale/execution-needed classified, only gaps entered the manifest, one atomic rows+ticks write
- AC6 → `.opencode/agents/inquisitor.md` `##### Dispatch protocol (round-based: manifest → concurrent fan-out → single-writer join)` round 2
- AC7 → `.opencode/agents/inquisitor.md` `##### Edge cases` UNROUTABLE item + `#### Dispatch Command Families` no-match row · walkthrough 2026-10-16: unroutable item stays unchecked, returns [BLOCK], designation alone never ticks
- AC8 → `.opencode/agents/inquisitor.md` `##### Dispatch protocol (round-based: manifest → concurrent fan-out → single-writer join)` round 3
- AC9 → `.opencode/agents/inquisitor.md` `##### Dispatch protocol (round-based: manifest → concurrent fan-out → single-writer join)` round 3 · `.opencode/skills/git-pr/SKILL.md` `### Post-PR evidence contract` execution-ownership handoff
- AC10 → `.opencode/agents/inquisitor.md` `##### Evidence intake and classification` agent-responsibility bullet · `knowledge/agents.md` `### Register-first identification (HARD RULE)` question-routing rule · walkthrough 2026-10-16: only the exact unobtainable input is escalated, never the whole plan
- AC11 → `.opencode/agents/inquisitor.md` `##### Evidence intake and classification` sufficient/stale rows · walkthrough 2026-10-16: sufficient head-bound evidence reused without rerun; stale evidence re-executed at the current head

## Constraints

- Exactly one active writer owns the PR body — because concurrent writers produce an inconsistent audit surface and race the live verification.
- Concurrency grants no new authority; existing roles, grants, and required gates remain governing — because a fan-out must not bypass role boundaries.
- A test-plan item stays unchecked until evidence of its performed check exists, including an actually performed manual check where applicable; an instruction or manual/optional designation alone is insufficient — because an unexecuted test plan is not a result.
- The reviewing role holds no execution grant — because the gate that judges evidence must not produce it.
- Evidence rows keep verdict-only observed output — because raw dumps bury the audit surface.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
