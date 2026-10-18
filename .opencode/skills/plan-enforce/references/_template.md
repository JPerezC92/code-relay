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

> Required. Numbered checkboxes tracked from confirmation to completion — each goal states what must be true when the plan is done. `## Context` is the overall issue. Each goal lists Issue, How, and Files, and traces to a selected acceptance criterion of the approved story (or to `## Context` / `## Goals` when stories are skipped). Planning starts from the approved story and its selected criteria — never from invented feature intent.

- ⬜ **G1:** <goal 1 — what must be true when this plan is done>
  - Issue: <the problem this goal fixes>
  - How: <how it is fixed>
  - Files: <paths this goal writes>
- ⬜ **G2:** <goal 2>
  - Issue: <the problem this goal fixes>
  - How: <how it is fixed>
  - Files: <paths this goal writes>

## Body

<!-- Tables and bullets, not prose. Task-specific content goes here. -->
<!-- Include the bounded discovery evidence (affected code/documentation/dependencies, with paths read) before the combined scope confirmation. -->

## Documentation

<!-- Include when the plan ships a behavior-visible change. Same-change documentation: list every affected documentation surface (README, knowledge/ registers, skill prose, user stories, reference docs) with its owner and what changes. Every row is also a Write/delete manifest path, and each is reviewed against the delivered behavior at completion. -->
<!-- Remove this section when no documentation is affected. -->

| Surface | Owner | Change |
|---|---|---|
| `path/to/doc` | <Name Emoji (Role)> | <what changes> |

## Source of truth chain

<!-- Optional. Ordered list of data sources the script/agent reads. Remove section if not applicable. -->

## Write/delete manifest

> One row per path this plan creates, changes, or deletes; `Action` is `Modify`, `Add`, or `Delete`, and `Path` is a single repo-relative path. The union of every phase runbook's `**Writes:**` paths must equal this set — the validator enforces it, so a `Delete` path is also listed in the deleting phase's `**Writes:**`.

| Action | Path |
|---|---|
| Modify | `path/to/file` |

## Phase index — dispatch table

| # | Phase | Owner | Runbook | Output |
|---|---|---|---|---|
| 1 | <phase name> | <Agent> | `phase-01-<owner>.md` | <artifact path> |

## Coordination and accepted joins

> Apply `knowledge/agents.md` **Safe parallel task coordination (HARD RULE)** and the skill's **Task coordination and accepted joins**. Phase numbering is an index, not evidence of dependency or independence. Preserve Runbook in column 4; use declarations below/inside runbooks, not new parsed table columns. Sequential plans retain this supported shape and declare their actual ordering.

- Workflow identity / coordinator: <workflow ID; Cipher 🔓 (Lead Orchestrator)>
- Capacity / authoritative accounting owner: <shared allocations, available capacity and ledger; Cipher 🔓 (Lead Orchestrator)>
- Task instances: <per-task ID, role/responsibility and runbook; distinct same-role instances share authority/allowances>
- Accepted dependencies / inputs: <per-instance predecessor results, acceptance evidence and current content/input identities; explicitly none when independent>
- Readiness / serialization: <present/current inputs, approvals/gates, compatible access and capacity; actual dependency/conflict/gate/capacity reasons for sequence>
- Resource modes / ownership: <exact canonical read/write/mutation footprints and active writer per mutable resource, including aliases, directories, generated/autofix outputs, reports/indexes, external/auth/browser/environment/Git state; read-side effects>
- Output allocation / attribution: <exclusive per-instance destinations and consumed identities; fixed governing paths stay serialized, never renamed for parallelism>
- Checkpoints / transfers: <required owner gates, parent-visible AWAITING_REVIEW returns and explicit accepted continuation; BLOCKED boundary needs halt before mutation; observed cessation before transfer>
- Review stability / joins: <content/dependency identities, scope, freshness and distinct review/execution verdicts; Cipher 🔓 (Lead Orchestrator) accepts all relevant returns and combined candidate before declared dependents/completion>

> Shared reads may overlap only on unchanged inputs. Reject conflicts unless isolation is verified; sessions/prompts are not isolation or locks. Autofix reviewers own their write footprint. Incomplete, failed, stale or still-mutating predecessors never unblock work; scope/input changes invalidate affected assignments/evidence. Stop requests/timeouts/tool returns alone do not prove continuing effects ceased. Structural validation proves neither locking, semantic independence, isolation, authority nor workflow acceptance.

## Critical files / tools

-

## Verification

> Exactly one checkbox per phase file, traced to its output and accepted applicable gates; duplicate this example for each additional phase.

- ⬜ Phase 1 output artifact exists, is valid, and its applicable gates are accepted

## Audit

> Filled by the independent auditor before the plan is reported ready or Forge 🔨 (Implementer) is dispatched. An unavailable auditor leaves the plan not-ready; a substitute requires explicit user authorization recorded here. Completion evidence is the layered matrix (code architecture, test architecture, execution, model/guidance) on the final candidate; a planning-readiness audit is not the completion audit.

> Record reviewed content/input identities and scope with the evidence; relevant changes invalidate the verdict. Author returns require coordinator acceptance, not self-audit. Load `references/_lifecycle-contract.md` fully before lifecycle operations; missing/unread content blocks them.

- Auditor: not yet run
- Verdict: [PENDING]
- Findings: 0
- Date: set when the independent audit runs

## Out of scope

-

## Pending

<!-- Optional. Remove section if empty. One line per blocked/waiting item. -->
<!-- Example: - [waiting for] user to merge PR #42 -->
<!-- Example: - [blocked on] decision: X vs Y -->

## Resolved decisions

<!-- Optional. Append-only log of locked choices with date stamps. -->
<!-- Example: - 2026-05-20 — decided X over Y because Z -->

---

## Single-file exception (template footer)

> **HARD RULE — anti-improvisation:** Plans must give the agent a complete execution path. Agent improvisation forbidden — every command, file, gate must be explicit.

The subfolder pattern is the **default**. Single-file is an **exception**, allowed ONLY when ALL five criteria are met:

1. **1 owner agent total** — no cross-agent handoffs
2. **≤ 30 lines of total instructions** — fits without phase isolation
3. **No phase IO contracts** — no phase's output is another phase's input
4. **No external state mutation** — no ticket-system writes, no DB writes, no git operations beyond a single commit
5. **No risk of agent improvisation** — instructions fit a single shell command or single file edit

**Minimal section list for a single-file body** (use these exact sections, in order):

```
Status / Started / Subject / Layout: single-file / Context / Goals / Body / Critical files / Verification / Out of scope
```

A single-file body also includes `Documentation` when the plan ships a behavior-visible change (same-change documentation; see the section above).

**Fall-through rule:** If unsure → subfolder, never single-file.
