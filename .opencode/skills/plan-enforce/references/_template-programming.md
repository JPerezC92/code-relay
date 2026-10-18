# Plan — <task subject>

> **Status:** active
> **Started:** YYYY-MM-DD HH:MM
> **Subject:** <one-line task description>
> **Layout:** subfolder pattern

## Context

> Why is this being done? What prompted it? What is the intended outcome?

- Prompted by:
- Goal:
- Outcome:

## Goals

> Every programming goal carries Issue, How, Files, and a `Done when:` criterion — the observable condition that proves the goal is met. `## Context` is the overall issue. Planning starts from the approved story and its selected criteria: trace each goal to a selected acceptance criterion of the approved story (or to `## Context` / `## Goals` when stories are skipped) — never to invented feature intent.

- ⬜ **G1:** <goal 1>
  - Issue: <the problem this goal fixes>
  - How: <how it is fixed>
  - Files: <paths this goal writes>
  - Done when: <observable condition>
- ⬜ **G2:** <goal 2>
  - Issue: <the problem this goal fixes>
  - How: <how it is fixed>
  - Files: <paths this goal writes>
  - Done when: <observable condition>

## Current state

> REQUIRED. Evidence table of the codebase state this plan starts from, populated by bounded discovery before the combined scope confirmation (affected code, documentation, and dependencies, with the paths read). No prose claims without a file + line or command output.

| Area | Current file / behavior | Evidence (file + line / command output) |
|---|---|---|
| <module / area> | <current behavior> | <path:line or output> |

## Behavior change

> Before → after per goal. Interface contracts (public API, file paths, exports) are part of the behavior — list them explicitly.

| Goal | Before | After | Interface contracts | Do-not-break |
|---|---|---|---|---|
| G1 | <current behavior> | <new behavior> | <public API / paths / exports> | <existing behavior that must not regress> |

## Design decisions

- <decision 1> — <rationale> (simplest alternative considered: <alternative>, rejected because <reason>)

## Documentation

> Include when the plan ships a behavior-visible change. Same-change documentation: list every affected documentation surface (README, `knowledge/` registers, skill prose, user stories, reference docs) with its owner and what changes. Every row is also a Write/delete manifest path, and each is reviewed against the delivered behavior at completion. Remove this section when no documentation is affected.

| Surface | Owner | Change |
|---|---|---|
| `path/to/doc` | <Name Emoji (Role)> | <what changes> |

## Write/delete manifest

> One row per path this plan creates, changes, or deletes; `Action` is `Modify`, `Add`, or `Delete`, and `Path` is a single repo-relative path. The union of every phase runbook's `**Writes:**` paths must equal this set — the validator enforces it, so a `Delete` path is also listed in the deleting phase's `**Writes:**`.

| Action | Path |
|---|---|
| Modify | `path/to/file` |

## Phase index — dispatch table

| # | Phase | Owner | Runbook | Output | Goals |
|---|---|---|---|---|---|
| 1 | <phase name> | <Agent> | `phase-01-<owner>.md` | <artifact path> | G1 |

> Every phase traces to ≥ 1 goal ID. A phase with no Goals column entry is speculative — remove or merge it. Each phase is contract-sized: one coherent responsibility with its interfaces, allowed writes, outputs, and gates — never sized by an arbitrary file count.

## Coordination and accepted joins

> Apply `knowledge/agents.md` **Safe parallel task coordination (HARD RULE)** and the skill's **Task coordination and accepted joins**. Phase numbering is an index, not evidence of dependency or independence. Preserve Runbook in column 4 and Goals as the terminal column; use declarations below/inside runbooks, not new parsed table columns. Sequential plans retain this supported shape and declare their actual ordering.

- Workflow identity / coordinator: <workflow ID; Cipher 🔓 (Lead Orchestrator)>
- Capacity / authoritative accounting owner: <shared allocations, available capacity and ledger; Cipher 🔓 (Lead Orchestrator)>
- Task instances: <per-task ID, role/responsibility and runbook; distinct same-role instances share authority/allowances>
- Accepted dependencies / inputs: <per-instance predecessor results, acceptance evidence and current content/input identities; explicitly none when independent>
- Readiness / serialization: <present/current inputs, approvals/gates, compatible access and capacity; actual dependency/conflict/gate/capacity reasons for sequence>
- Resource modes / ownership: <exact canonical read/write/mutation footprints and active writer per mutable resource, including aliases, directories, shared contracts/exports/fixtures, generated/autofix outputs, reports/indexes, external/auth/browser/environment/Git state; read-side effects>
- Output allocation / attribution: <exclusive per-instance destinations and consumed identities; fixed governing paths stay serialized, never renamed for parallelism>
- Checkpoints / transfers: <required owner gates, parent-visible AWAITING_REVIEW returns and explicit accepted continuation; BLOCKED boundary needs halt before mutation; observed cessation before transfer>
- Review stability / joins: <content/dependency identities, scope, freshness and distinct review/execution verdicts; Cipher 🔓 (Lead Orchestrator) accepts all relevant returns and combined candidate before declared dependents/completion>

> Shared reads may overlap only on unchanged inputs. Reject conflicts unless isolation is verified; sessions/prompts are not isolation or locks. Autofix reviewers own their write footprint. Incomplete, failed, stale or still-mutating predecessors never unblock work; scope/input changes invalidate affected assignments/evidence. Stop requests/timeouts/tool returns alone do not prove continuing effects ceased. Structural validation proves neither locking, semantic independence, isolation, authority nor workflow acceptance.

## Critical files / tools

-

## Verification

> Exactly one checkbox per phase file, traced to its output/goal and accepted applicable gates. Runnable command + expected output proves the goal; do not add separate goal-only or gate-only checkboxes that break phase parity. Add dispatch rows/runbooks to match the illustrated two-phase verification, or adapt verification to the actual phase count.

- ⬜ G1: `<command>` → <expected output>
- ⬜ G2: `<command>` → <expected output>

## Phase verify commands

> REQUIRED in every phase runbook: one canonical `## Verify commands` table with exactly the `Executor` and `Command` columns, pairing each command with exactly one declared executor. The static validator enforces declared traceability only; phase review audits executor authority.

<!-- Canonical table shape:
| Executor | Command |
|---|---|
| <Name Emoji (Role)> | `<shell command>` |
-->

- Python `test_*.py` edits in reviewed discovery areas: list the project's approved whole-suite command, assign Crucible 🔥 (Test Architect) as executor, obtain Bastion 🧱 (Backend & Scripts Architect) `[PASS]`, and require Crucible 🔥 (Test Architect) `[PASS]` or `[FAIL]` — `[UNCERTAIN]` is not acceptable for this scope.
- A behavior slice may record an expected red checkpoint: the designated executor runs the new failing test through its authorized command and records the red result. Expected red is never a goal `✅`, a phase gate PASS, or an acceptance `✅`; the phase still requires final green, the applicable architecture verdicts, and the reviewed whole-suite gate.

## Audit

> Filled by the independent auditor before the plan is reported ready or Forge 🔨 (Implementer) is dispatched. An unavailable auditor leaves the plan not-ready; a substitute requires explicit user authorization recorded here. Completion evidence is the layered matrix (code architecture, test architecture, execution, model/guidance) on the final candidate; a planning-readiness audit is not the completion audit.

> Record reviewed content/input identities and scope with the evidence; relevant changes invalidate the verdict. Author returns require coordinator acceptance, not self-audit. Load `references/_lifecycle-contract.md` fully before lifecycle operations; missing/unread content blocks them.

- Auditor: not yet run
- Verdict: [PENDING]
- Findings: 0
- Date: set when the independent audit runs

## Out of scope / Do-not-touch

- <areas the plan must not modify>

## Pending

<!-- Optional. Remove section if empty. One line per blocked/waiting item. -->
<!-- Example: - [waiting for] user to merge PR #42 -->
<!-- Example: - [blocked on] decision: X vs Y -->

## Resolved decisions

<!-- Optional. Append-only log of locked choices with date stamps. -->
<!-- Example: - 2026-05-20 — decided X over Y because Z -->

---

## Template footer (inherits base rules)

> **HARD RULE — anti-improvisation:** Plans must give the agent a complete execution path. Agent improvisation forbidden — every command, file, gate must be explicit.

This programming template inherits the base subfolder / single-file rules from `references/_template.md`:

- The **subfolder pattern is the default** for programming plans.
- Single-file is an **exception**, allowed ONLY when ALL five criteria from `references/_template.md` are met: 1 owner agent, ≤ 30 lines of total instructions, no phase IO contracts, no external state mutation, no risk of agent improvisation.
- **Fall-through rule:** If unsure → subfolder, never single-file.
