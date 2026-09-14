# Plan / Phase / Story — consistency checklist

> Canonical contract for artifacts written by the `plan-enforce` skill. Applied at write-time by the skill's post-write self-verification loop (analysis) and mechanically by `scripts/validate_plan.py` (repetitive subset). Sentinel 🛡️ (Quality Guardian) audits `plans/` and `user-stories/` against this same checklist — keep the two in lockstep.

## plan.md

- `Status:` value is `active` or `completed` (no other values).
- When `Status: completed`, a `Completed: YYYY-MM-DD HH:MM` line is present in the metadata header.
- Metadata header has `Started` and `Subject` (and `Layout` for subfolder plans).
- Required sections present: `## Context`, `## Goals`, `## Critical files / tools`, `## Verification`, `## Out of scope` (or `## Out of scope / Do-not-touch`), plus `## Body` (base template) or `## Current state` + `## Behavior change` (programming template).
- `## Goals` checkboxes present and match the confirmed goal list; programming goals each carry a `Done when:` criterion.
- No unfilled placeholders: `<task subject>`, a literal `YYYY-MM-DD HH:MM`, or stray `<!-- -->` comment lines (the `## Pending` section may retain its example comments).
- Every dispatch-table phase references an existing `phase-NN-<owner>.md` file.
- Every phase traces to ≥1 goal ID (programming plans: the `Goals` column is populated for every phase).
- Verification checkbox count equals the phase-output count; each verification checkbox traces to a phase output.

## phase-NN-<owner>.md

- `Owner`, `Pre`, `Reads`, `Writes` blockquote labels populated.
- No `TBD` in `Steps`, `Output`, `Gate`, or `Abort conditions`.
- `## Writes` paths match the derived write/delete manifest.
- No unfilled `<...>` placeholder tokens.
- `## Verify commands` is a non-empty canonical table with exactly the `Executor` and `Command` columns; every row pairs one non-empty executor with one non-empty command.
- Executor authority is a phase-review item: the reviewer confirms the declared executor holds the role and tool authority to run the command. The validator checks declared traceability only and never inspects permission models.
- A phase editing an exact active-plan Python stdlib `unittest` file lists the declared literal `python3` command and records Bastion 🧱 (Backend & Scripts Architect) `[PASS]`; Crucible 🔥 (Test Architect) is dispatched for the test-file edit and must return `[PASS]` or `[FAIL]` — `[UNCERTAIN]` is not acceptable for this scope and does not satisfy the gate. `pytest` is not introduced.

## user-stories

- `user-stories/index.md` exists and lists every feature file.
- Each story's `Title` and `Status` mirror the corresponding `index.md` columns.
- No unfilled `<...>`, `TODO`, or `TBD` placeholders.
- A dated `## Change log` entry is present for every plan that touched the story.
- Acceptance-criterion reconciliation (fail-closed): a story touched by the plan carries no `⬜` or `❌` criteria when the plan completes — each is `✅` (evidence-established) or removed as out-of-scope; `❌` (explicitly unmet) blocks completion until satisfied or removed. Out-of-scope work is removed, never left unchecked. Release events (PR opened/reviewed/merged) are not acceptance criteria. This is semantic analysis (evidence-to-checkbox truth), never mechanical auto-checking.

## Loop rule

Analysis items (everything above) are the skill's responsibility — a value must match evidence, never be invented to satisfy a check. `scripts/validate_plan.py` enforces only the mechanical/repetitive subset (enum values, section presence, placeholder/TBD detection, index mirroring, and the presence/shape of each phase's executor-command table); it is a helper, not the authority. Executor authority is an analysis item, never a mechanical pass.
