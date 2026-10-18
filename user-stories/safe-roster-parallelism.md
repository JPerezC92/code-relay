<!-- core:begin -->
# User story — safe-roster-parallelism

> **Created:** 2026-10-13
> **Title:** Safe roster-wide agent parallelism
> **Status:** active
> **version:** 1.0.0
> **Epic:** core-governance
> **Affected areas:** `AGENTS.md`, `knowledge/agents.md`, `.opencode/agents/`, `.opencode/skills/plan-enforce/`, `.opencode/skills/ticket-runbook/`, `README.md`

## Persona

- A maintainer delegating work to the agent team who needs independent work to progress concurrently without lost changes or unreliable evidence.

## Goal

- **G:** Independent, ready agent tasks run concurrently while resource ownership, accepted inputs, required reviews, and result consolidation remain explicit.
  - Done when: Workflow evidence shows safe concurrent dispatch, blocked conflicting assignments, attributable results, fresh required reviews, and accepted handoffs before dependent work or completion.

## Scenario

- Independent research, implementation, or review tasks are ready: they run concurrently, including multiple instances of the same role, and their results are consolidated.
- Tasks need conflicting access to a shared resource: they wait or are separated through verified isolation.
- A worker needs work outside its assignment, or an accepted input changes: the affected operation stops, the coordinator resolves the assignment, and affected evidence is refreshed.
- Parallel tasks finish: their relevant results and required gates are accepted before dependent work or completion.

## Acceptance criteria

- ✅ **AC1 — Safe concurrent dispatch:** When multiple ready tasks can safely overlap within available capacity, the orchestrator dispatches them concurrently; dependencies or resource conflicts that require sequential work have a visible reason.
- ✅ **AC2 — Explicit assignments:** Each concurrent assignment identifies its task instance, responsibility, accepted inputs, permitted mutations and shared-resource access, output destination, and required gates.
- ✅ **AC3 — Conflicting resource access:** Tasks with conflicting resource access are not dispatched concurrently without verified isolation; shared unchanged inputs may be read concurrently.
- ✅ **AC4 — Boundary changes and ownership transfer:** A worker needing work outside its assignment stops the affected operation and reports the required change. Ownership is transferred only after the previous worker has demonstrably stopped using the resource.
- ✅ **AC5 — Attributable outputs:** Results are attributable to their producing tasks, and concurrent outputs do not overwrite one another.
- ✅ **AC6 — Parent-controlled checkpoints:** Where a parent-controlled gate is required after an edit, the worker exposes that checkpoint and proceeds only after the applicable accepted verdict.
- ✅ **AC7 — Review freshness:** Concurrent work preserves review scope and input identity. Relevant changes invalidate affected verdicts before those verdicts are used.
- ✅ **AC8 — Accepted handoffs:** Dependent work and workflow completion require accepted results from every relevant predecessor; incomplete, failed, or still-mutating work is not treated as an accepted handoff.
- ✅ **AC9 — Shared capacity and accounting:** Concurrent tasks respect shared budgets and capacity limits without duplicating allowances or competing to update authoritative accounting.

## Proof

- AC1 → `knowledge/agents.md` `### Safe parallel task coordination (HARD RULE)` independent readiness, capacity, and serialization obligations
- AC2 → `knowledge/agents.md` `### Safe parallel task coordination (HARD RULE)` assignment fields · `.opencode/skills/plan-enforce/SKILL.md` `### Dispatch bundle contract`
- AC3 → `knowledge/agents.md` `### Safe parallel task coordination (HARD RULE)` resource ownership and compatible shared reads
- AC4 → `knowledge/agents.md` `### Safe parallel task coordination (HARD RULE)` boundary changes and observed cessation before transfer
- AC5 → `knowledge/agents.md` `### Report discipline (HARD RULE)` · `### Safe parallel task coordination (HARD RULE)` attributable results
- AC6 → `.opencode/agents/forge.md` `#### Per-step execution` · `.opencode/skills/plan-enforce/SKILL.md` `### Task coordination and accepted joins`
- AC7 → `.opencode/agents/atrium.md`, `.opencode/agents/bastion.md`, `.opencode/agents/crucible.md`, `.opencode/agents/sentinel.md` `#### Review scope and snapshot`
- AC8 → `.opencode/skills/plan-enforce/SKILL.md` `### Task coordination and accepted joins` · `.opencode/skills/ticket-runbook/SKILL.md` `#### 7. Close-out (two-stage: readiness gate, then authorized collapse)`
- AC9 → `knowledge/agents.md` `### Safe parallel task coordination (HARD RULE)` shared capacity/accounting · `.opencode/skills/ticket-runbook/references/analysis/state.md` `Query-budget` and `## Kill-switch status`

## Constraints

- Existing role authority and user approvals remain governing — because concurrency does not grant additional authority.
- Existing architecture, test, planning, and completion gates remain required — because concurrent execution cannot substitute for evidence.
- Incident identification, hypothesis/query ordering, and close-out authorization remain governing — because parallelism must not bypass incident controls.
- One authoritative coordinator consolidates each workflow — because competing ownership and acceptance decisions would conflict.
- Isolation is claimed only when verified — because separate agent sessions or written assignments alone do not establish enforcement.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
