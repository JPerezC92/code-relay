<!--
HARD RULE — fill every Step / Output / Gate / Abort. No `TBD` placeholders. Agent improvisation forbidden.
-->

# Phase N — <name>

> **Owner:** <Agent Name + icon + (Role)>
> **Pre:** <what must be true / completed before this phase begins>
> **Reads:** <files / MCP responses / artifacts this phase consumes>
> **Writes:** <files / artifacts this phase produces>

## Steps

1. <One shell command or one file edit — be explicit, no paraphrasing>
2. <Next command or edit>
3. <Continue as needed — every step must be independently executable>

## Output

- **Artifact:** `<path/to/output/file>`
- **Schema / shape:** <what the file must contain or look like>

## Verify commands

<!-- REQUIRED. One canonical table with exactly these two columns. Each command is paired with exactly one declared executor; the validator enforces declared traceability and phase review audits executor authority. -->

| Executor | Command |
|---|---|
| <Name Emoji (Role)> | `<shell command>` |

- Python stdlib `unittest` edits at an exact active-plan path: declare the literal `python3` command for that exact file, record Bastion 🧱 (Backend & Scripts Architect) `[PASS]`, and require Crucible 🔥 (Test Architect) to return `[PASS]` or `[FAIL]` — `[UNCERTAIN]` is not acceptable for this scope. `pytest` is not introduced.

## Gate

- ⬜ <Condition that must be true before next phase begins>
- ⬜ <Second condition if applicable>
- Python stdlib `unittest` phases: the gate passes only when the exact file's declared `python3` command ran, Bastion 🧱 (Backend & Scripts Architect) returned `[PASS]`, and Crucible 🔥 (Test Architect) returned `[PASS]` or `[FAIL]`; a recorded `[UNCERTAIN]` does not satisfy this gate.

## Abort conditions

- <Halt if X — describe exactly what constitutes a blocking failure>
- <Halt if Y>

## Tool whitelist / blacklist

<!-- OPTIONAL — include this section ONLY for read-only phases touching external systems -->
<!-- Example: -->
<!-- Whitelist: the data-query tool (read-only queries only) -->
<!-- Blacklist: the ticket-mutation tool (no ticket writes in this phase) -->
