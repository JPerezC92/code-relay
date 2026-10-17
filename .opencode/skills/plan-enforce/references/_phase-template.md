<!--
HARD RULE — fill every Step / Output / Gate / Abort. No `TBD` placeholders. Agent improvisation forbidden.
-->

# Phase N — <name>

> **Owner:** <Agent Name + icon + (Role)>
> **Pre:** <accepted relevant predecessors, current required inputs, existing approvals/gates, compatible resource access and available capacity>
> **Reads:** <files / MCP responses / artifacts and accepted output values this phase consumes>
> **Writes:** <exact repo-relative paths separated by semicolons, or none; no resource metadata in this parsed label>

> Contract-sized: one coherent responsibility, with its interfaces, allowed writes, outputs, and gates. Size by responsibility, never by an arbitrary file count. State behavior and contracts — never prewrite private implementation. If the plan ships a behavior-visible change, this phase's `**Writes:**` includes the affected documentation paths.

## Assignment and resources

- Workflow / task / instance: <distinct IDs; responsible role and coherent responsibility>
- Accepted predecessors / input identities: <results, actual consumed values, content identities and parent acceptance; none only when independent>
- Permitted resource access: <canonical read/write/mutation modes, exact Writes footprint and other resources; aliases/overlapping directories, shared contracts/fixtures, generated/autofix outputs, external records/auth/browser/environment/Git state and read-side effects>
- Ownership / output destination: <one active writer per mutable resource; attributable exclusive outputs; fixed governing paths stay serialized>
- Required gates / continuation / join owner: <existing role-specific owner gates; parent Cipher 🔓 (Lead Orchestrator) accepts and redispatches continuation/dependents>
- Capacity allocation / accounting owner: <available allocation from the single coordinator-owned shared ledger, not new instance allowances>
- Readiness / serialization evidence: <actual dependency, conflict, gate or capacity reason; verified isolation if required, never inferred from sessions or phase numbers>

> Apply the shared coordination contract. Unchanged shared reads may overlap; whole-file edits conflict even across text regions and directory deletions conflict with descendants. Reject incompatible assignments unless isolation is verified. Reviewer autofix access is a write assignment. Structural validation is not locking, independence, isolation, authority or acceptance.

## Steps

1. <One shell command or one file edit — be explicit, no paraphrasing>
2. <Next command or edit>
3. <Continue as needed — every step must be independently executable>

## Output

- **Artifact:** `<path/to/output/file>`
- **Schema / shape:** <what the file must contain or look like>
- **Attribution / identities:** <task instance, consumed inputs and produced content identity; relevant dependency/review scope>
- **Parent handoff:** <completed operations, required gate evidence and current resource-use/release status; author completion is not acceptance>

> At a required edit checkpoint return `AWAITING_REVIEW`, with task identity, changed paths, content/input identity, owner gate, completed operations and resource-use state; this is not step completion. The parent dispatches the existing owner and explicitly redispatches continuation only on an accepted current verdict. Boundary needs halt before mutation and return `BLOCKED` with exact need, evidence, bounded options/default. No callbacks, hidden suspension, cancellation or self-dispatch are assumed; observed cessation precedes resource transfer, not merely a stop request, timeout, timestamp or completed tool return. `COMPLETED` returns remain subject to parent acceptance.

## Verify commands

<!-- REQUIRED. One canonical table with exactly these two columns. Each command is paired with exactly one declared executor; the validator enforces declared traceability and phase review audits executor authority. -->

| Executor | Command |
|---|---|
| <Name Emoji (Role)> | `<shell command>` |

- Python `test_*.py` edits in reviewed discovery areas: declare the project's approved whole-suite command, assign Crucible 🔥 (Test Architect) as executor, record Bastion 🧱 (Backend & Scripts Architect) `[PASS]`, and require Crucible 🔥 (Test Architect) `[PASS]` or `[FAIL]` — `[UNCERTAIN]` is not acceptable for this scope.
- A behavior slice may record an expected red checkpoint: the designated executor runs the new failing test through its authorized command and records the red result. Expected red is never a goal `✅`, a phase gate PASS, or an acceptance `✅`; it only proves the test can fail.

## Gate

- ⬜ <Condition for accepting this phase and releasing its declared dependents, not an unconditional next-phase barrier>
- ⬜ <Second condition if applicable>
- ⬜ Relevant content/dependencies stayed stable for review, identities/scope are recorded, and current applicable verdicts are accepted; relevant changes invalidate affected verdicts/assignments before redispatch.
- ⬜ The parent accepted every relevant return and the combined candidate, keeping review/execution verdicts separate; no incomplete, failed, stale or still-mutating predecessor unblocks dependent work/completion.
- ⬜ If this phase replaces, supersedes, or newly wires behavior: a recorded legacy/dead-code sweep with no dead symbol, inert field, or stale mapping.
- ⬜ If this phase ships a behavior-visible change: the affected documentation is written in the same change and reviewed against the delivered behavior (not the plan's description of it).
- ⬜ Expected red is never the gate PASS: the phase requires final green (the executor's command exits 0), the applicable architecture verdicts (Atrium 🏛️ (Frontend Architect) / Bastion 🧱 (Backend & Scripts Architect) / Crucible 🔥 (Test Architect)), and the reviewed whole-suite gate.
- Python `test_*.py` phases: the gate passes only when Crucible 🔥 (Test Architect) ran the declared project-approved whole-suite command with exit 0, Bastion 🧱 (Backend & Scripts Architect) returned `[PASS]`, and Crucible 🔥 (Test Architect) returned `[PASS]` on test architecture; `[FAIL]` or `[UNCERTAIN]` blocks completion.

## Abort conditions

- <Halt if X — describe exactly what constitutes a blocking failure>
- <Halt if Y>
- Stop before any out-of-assignment write/mutation or incompatible access; report `BLOCKED` to the parent. Missing current inputs/capacity/isolation or stale evidence blocks readiness, not permission to improvise.

## Tool whitelist / blacklist

<!-- OPTIONAL — include this section ONLY for read-only phases touching external systems -->
<!-- Example: -->
<!-- Whitelist: the data-query tool (read-only queries only) -->
<!-- Blacklist: the ticket-mutation tool (no ticket writes in this phase) -->
