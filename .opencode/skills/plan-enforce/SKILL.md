---
name: plan-enforce
description: Enforce plan-first discipline for non-trivial tasks. Creates or resumes a subfolder plan artifact in plans/ before code-writing work. Use when the user asks to plan work, types /plan, or Cipher is about to dispatch Forge for implementation.
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 1.11.1
---

## What I do

Create or resume a plan before non-trivial implementation work, then enforce its scope, phase gates, and pre-release completion lifecycle.

## When to use me

- User types `/plan` or asks to create, resume, or show a plan.
- Cipher 🔓 (Lead Orchestrator) is about to dispatch Forge 🔨 (Implementer).
- A current task changes scope or requires a new implementation phase.

## Arguments

From the user's request, extract:

- **task description** — concise description of the intended work.

If no task description and no active plan are available, collect the description with the `question` tool.

### Argument collection form

| name | type | validation | trigger |
|---|---|---|---|
| `task_description` | text | non-empty | no active plan and no task description |

Use one `question` call. The first option is the parsed value when one is available; do not add a manual “Other” option.

## Stash safety gate

This gate has two ordered parts: an initial read-only inventory and a post-scope collision check. It runs before new-plan creation, plan resumption, archive work, and every Forge 🔨 (Implementer) dispatch. The gate never mutates the caller repository's stash or refs.

### Initial read-only inventory

Run this inventory before selecting a plan, deriving a new plan, or writing a plan file:

| Command | Purpose |
|---|---|
| `git ls-remote origin refs/heads/main` | Capture `LIVE_MAIN_SHA`. Fail closed if unavailable. |
| `git rev-parse refs/stash` | Capture `STASH_FINGERPRINT`; an absent ref means there is no stash to inspect. |
| `git stash list` | Enumerate stash selectors and subjects. |
| `git stash show -u <selector>` | List each stash's tracked, deleted, and untracked paths. |
| `git rev-parse <stash-sha>^1` | Resolve the selected stash's base commit. |
| `git merge-base --is-ancestor <base-sha> <live-main-sha>` | Test whether the stash base is behind live main. |
| `git merge-base --is-ancestor <live-main-sha> <base-sha>` | Test whether the stash base is ahead of live main. |

For each selector, resolve its full object SHA and base SHA. Classify it in this exact order:

1. **current** — base SHA exactly equals `LIVE_MAIN_SHA`.
2. **stale** — base SHA is an ancestor of `LIVE_MAIN_SHA`.
3. **ahead** — `LIVE_MAIN_SHA` is an ancestor of the base SHA.
4. **diverged** — neither SHA is an ancestor of the other.

Malformed selectors, missing objects, unparseable output, or a changed fingerprint from the plan's recorded fingerprint fail closed. Caller-repository stash mutation is forbidden. The permission policy denies direct destructive stash/ref/reflog/pruning pathways; this is a targeted policy, not an exhaustive shell sandbox.

### Derive the write/delete manifest

Derive the manifest before the collision check:

- **New plan:** derive the complete write/delete manifest in memory from the intended task and phase design before writing any plan or phase file.
- **Existing subfolder plan:** derive the manifest from every phase runbook's `## Writes` block.
- **Existing single-file plan:** derive the manifest from its explicit write/delete instructions only.

Read-only inputs are never manifest entries. The manifest must be complete before a new plan file is created or Forge 🔨 (Implementer) is dispatched.

### Post-scope collision check

Intersect every stashed changed path from the initial inventory with the derived write/delete manifest:

- Any intersection is `PLANNED_PATH_OVERLAP`: fail closed before plan-file creation or Forge 🔨 (Implementer) dispatch.
- No intersection permits the plan flow to continue.
- A stale, ahead, or diverged non-overlapping stash is a user-gated reconciliation candidate; current non-overlapping stashes are reported and retained.

### Stash lifecycle

Park work via `git stash push` / `git stash save` — git never erases existing stash entries on push; stash entries use stack semantics. Recover via `git stash apply <ref>` — non-destructive, the entry survives as a durable backup. Erasure (`pop`, `drop`, `clear`, `update-ref -d refs/stash`) is denied to model agents and is user-only, run manually in the user's terminal.

### Stash status query

To answer "are there unapplied stashes?" mechanically, run these three read-only commands:

| Command | Purpose |
|---|---|
| `git stash list` | Enumerate stash selectors. |
| `git stash show -u <selector> --name-only` | List tracked, deleted, and untracked paths per stash. |
| `git status --porcelain` | List current worktree paths. |

Verdict: ALL stash paths present in worktree status = applied; any missing = unapplied. If the comparison is inconclusive (worktree diverged after apply), say "cannot confirm mechanically" — never guess.

## Check for active plan

1. Run the initial inventory.
2. Scan `plans/*.md` (excluding `.completed/`) and `plans/*/plan.md`.
3. Read candidate plan files and select those with `Status: active`.
4. If one active plan exists, read it and its `phase-*.md` siblings, derive its manifest, and run the post-scope collision check before showing the plan or dispatching Forge 🔨 (Implementer).
5. If no active plan exists, continue to **Create new plan**. If multiple exist, stop and ask the user to select one.

An archived plan is never resumed directly from `plans/.completed/`. Restore it to `plans/`, set `Status: active`, and append `Reopened: YYYY-MM-DD HH:MM` before resuming.

## Goal lifecycle

Goals are numbered `G1..Gn`, detected from the task description, confirmed with the user before any file creation, persisted as `## Goals` checkboxes in `plan.md`, watched for drift across the plan's life, and resumed at completion.

### Detect

Extract the goals from the task description before writing any plan file:

1. Number them `G1`, `G2`, … in order of importance.
2. State each goal as what must be true when the plan is done — an observable condition, not an activity.
3. Programming goals (see **Template selection**) additionally carry a `Done when:` criterion (see Persist).
4. More than 5 goals triggers the soft goal-bloat flag (see **Simplicity discipline**) — report it in the confirmation gate; do not silently proceed.
5. A goal whose done-condition references another document's state (a debt-register entry, a rule file, a checklist) MUST be drafted from that document's current text, read fresh at plan-creation — never from memory or a prior plan's phrasing. Quote the governing text in the goal or its verification line. A done-condition invented from recall inherits the recall error and every downstream gate verifies the assumption instead of the source (observed 2026-08-30: a "mark resolved in register" goal contradicted the register's own retirement rule).

### Present (pre-file gate)

Before invoking the `question` tool, send one regular Markdown message that visibly separates the decision inputs:

1. Under `**Goals**`, render every detected `G1..Gn` goal as its own Markdown bullet with its full observable condition.
2. Under `**Plan classification**`, render the detected plan type, user-story scope (create, update, or skipped with reason), and goal-bloat status (`none` or the triggered soft flag).
3. Do not place the full goal list, plan type, user-story scope, or goal-bloat detail in the `question` text. The user must be able to scan them outside the compact question control.

### Confirm (pre-file gate)

Before creating ANY plan file, run exactly one short `question` call that asks whether to proceed with or revise the already displayed goals and classification. The answer confirms, in a single round:

1. The detected goal list — `G1..Gn` with their conditions.
2. The detected plan type (see **Template selection**).
3. The soft goal-bloat flag, when triggered.
4. The user-story scope, when the plan is programming OR changes feature-visible behavior (see **User-story scope**) — confirm whether a story must be created/updated.

Do not create `plan.md` or any `phase-*.md` until the user confirms all four. Skipping the Markdown presentation, adding a second question round, or paraphrasing any part of the confirmation is a violation.

### Persist

Write the confirmed goals into `plan.md` under `## Goals`:

- One checkbox per goal: `- ⬜ **G1:** <goal>`
- Programming plans use `references/_template-programming.md`, where every goal carries a `Done when:` criterion — the observable condition that proves the goal is met.
- After confirmation, goals are never renumbered or reworded silently — changes go through Drift watch.

### Drift watch

Watch for goal drift on every phase close, every scope change, and every collateral-fix verification. When the work no longer matches the confirmed goals — or a goal must be added, removed, or reworded:

1. **Stop** — do not continue editing plan files.
2. **Notify** the user with evidence: which goal drifted, what the current work does instead, and what the plan file says.
3. **Wait** for the user's call — the user decides whether to update the goals, adjust the work, or abort. Never self-approve a goal change.
4. On user approval, update the `## Goals` block and append a dated line to `## Resolved decisions` recording the change.

### Acceptance-criterion reconciliation (fail-closed)

A user story a plan touches may not carry undetermined criteria past plan completion. When the plan's work is done, every acceptance criterion in every story this plan created or updated must be dispositioned:

- `✅` — the criterion is established by verified evidence (a completed goal's `Done when:`, a passing verify command, or a recorded outcome). No fulfilled criterion may remain `⬜`.
- `❌` — the criterion is explicitly known to be unmet. A `❌` blocks plan completion and archival until the criterion is satisfied or removed.
- Out-of-scope work is removed from the story's acceptance criteria (not left unchecked) and recorded as a dated change-log line, optionally pointing at a follow-up story.

There is no "left as pending" state for a criterion in a touched story: an `⬜` after a touching plan completes is a stale-story defect. Release events (PR opened/reviewed/merged) are release history, not feature acceptance criteria; a feature criterion may state the release policy (e.g. "merge remains user-only") but never a specific PR/review/merge event.

### Resume (completion)

When the plan's work is done and its audits have passed — before the release PR is built:

- Run acceptance-criterion reconciliation (see `### Acceptance-criterion reconciliation`) over every touched story; block `## Outcome` and the archive move until no `⬜` or `❌` criterion remains — each is `✅` or removed as out-of-scope.
- Present the goals resume in chat: one line per goal, `✅` when met, `❌` when not, each with a 1-line evidence note.
- Write `## Outcome` into `plan.md` — what the plan produced, per goal — BEFORE moving the plan to `plans/.completed/`.
- Set `Status: completed`, append `Completed: YYYY-MM-DD HH:MM`, and move the plan to `plans/.completed/` (folder or file per layout). All of this happens pre-release; the merged PR number or merge SHA may be appended to the local archive copy afterwards as free metadata.
- Filesystem-verify the archive after the move: confirm every expected file exists under `plans/.completed/<plan>/` AND the active copy is gone from `plans/`. A `mv` that reports success can still leave the active copy in place (observed 2026-08-24); the filesystem, not the command's silence, is the evidence.
- A plan archived without `## Outcome` is a lifecycle violation: restore it, write the section, then archive again.

## Simplicity discipline

Every plan artifact is challenged for removability before it is rendered.

- **Phase-to-goal trace:** every phase in the dispatch table traces to ≥1 goal ID. A phase with no goal is speculative — remove it or merge it into another phase.
- **Reduction pass before render:** before presenting a plan, phase, step, or new file, challenge it: "removable or mergeable while meeting the goals?" If yes, remove or merge it. Programming plans record the reduction outcome in `## Design decisions` (what was cut or merged, and why).
- **Speculative artifacts forbidden:** do not plan files, phases, or steps that no goal and no explicit user request demands. "Might be useful later" is not a goal.
- **Soft goal-bloat flag:** more than 5 goals, or any goal that is not a single observable condition, triggers the soft flag. Report it in the Markdown presentation before the concise confirmation question; the user decides whether to trim, split, or accept. The flag is a notification, not a hard limit.

## Dispatch bundle contract

Every subagent dispatch prompt carries the complete context the subagent needs. The bundle MUST contain, verbatim:

1. **Subject** — the plan subject line from `plan.md`.
2. **Goals** — the full `## Goals` block from `plan.md`, checkboxes included.
3. **Phase file** — the full `phase-NN-<owner>.md` content for the phase being dispatched.
4. **Re-pasted data values** — every data value from prior-phase Outputs that the phase's Reads list consumes (IDs, lists, paths, query results, decision strings). Re-paste the values into the prompt; "see phase-01 output" without the values is not sufficient.

**Fail-closed bundle check:** before every dispatch, verify all four parts are present in the prompt. If any part is missing or paraphrased, do NOT dispatch — rebuild the bundle. A summarized goal or a paraphrased phase step is a failed bundle, because the subagent acts on the words in the prompt, not on the plan file.

## Template selection

Choose the plan template before creating files; the choice is confirmed in the goals-confirmation gate.

- **Auto-detect programming:** a plan is a programming plan when ANY phase writes code — any write path under the application source tree (e.g. `src/`), backend tooling paths, `scripts/`, `.opencode/skills/**/scripts/`, or the project's ticket tooling. Detection is path-based, not subject-based.
- **Programming plan** → `references/_template-programming.md` (goals with `Done when:` criteria, Current state, Behavior change, Design decisions, Goals column per phase, per-phase Verify commands).
- **Non-programming plan** → `references/_template.md` (base template).
- **Confirm:** the detected type is confirmed in the same `question` call as the goals (see **Goal lifecycle** → Confirm). Never silently pick a template.

## Verification command executors

Every phase runbook's `## Verify commands` section is one canonical Markdown table with exactly two columns — `Executor` and `Command`:

| Executor | Command |
|---|---|
| <Name Emoji (Role)> | `<shell command>` |

- Each command is paired with exactly one declared executor. An empty table, a missing or extra column, or a row with a missing executor or command is invalid.
- The static validator (`scripts/validate_plan.py`) enforces declared traceability only — that a non-empty `Executor`/`Command` table exists with each command paired to an executor. It never parses or inspects an agent permission model.
- Phase review audits executor authority: the reviewer confirms the declared executor holds the role and tool authority to run the command. Authority is a review judgment, not a mechanical check.

### Non-TypeScript test files

- A plan that edits an exact active-plan Python stdlib `unittest` file must list the declared literal `python3` command for that exact file, obtain Bastion 🧱 (Backend & Scripts Architect) `[PASS]` on the edit, and dispatch Crucible 🔥 (Test Architect) for the test-file edit.
- Crucible 🔥 (Test Architect) must return `[PASS]` or `[FAIL]` for that Python test file. `[UNCERTAIN]` is not acceptable for an exact active-plan Python test path; a recorded `[UNCERTAIN]` does not satisfy this gate.
- No test framework is added: `pytest` is not required or introduced for stdlib `unittest` files. This does not change the existing TypeScript / Atrium 🏛️ (Frontend Architect) and Crucible 🔥 (Test Architect) test-file gates.

## User stories

User stories are the durable per-feature registry — one file per feature, `user-stories/<feature-slug>.md`, built from `references/_template-user-story.md`. Plans are temporal and never carry the durable definition; the story does.

- **Index first:** `user-stories/index.md` is the single structural reference point. The collision gate and feature matching read the index first, filter candidates by epic / affected areas, then read the candidate bodies.
- **CREATE:** create `user-stories/<feature-slug>.md` when a plan touches a feature that has no story yet.
- **UPDATE:** update the affected story in the same step as the plan work — the body reflects the CURRENT feature definition; append a dated `## Change log` entry per plan that touched it.
- **COLLIDE:** when the intended work overlaps, contradicts, or extends an existing story, stop and run the collision gate (see **User-story collision gate**).
- **Durable:** stories are never archived or deleted with plans. Plan archival moves `plans/` artifacts only; `user-stories/` stays.
- **Link:** cite the story from `plan.md` — one line under `## Critical files / tools` per touched feature.
- **Trace:** every plan `## Goals` entry traces to a story acceptance criterion (or to `plan.md` Context/Goals for stories-skipping plans).

## User-story scope

Which plans carry a user story?

- **Programming plans ALWAYS carry a story** for every feature they touch (any write path under the application source tree, backend tooling paths, `scripts/`, `.opencode/skills/**/scripts/`, or the project's ticket tooling).
- **Non-programming plans that change feature-visible behavior** are flagged at the goals gate (see **Goal lifecycle** → Confirm) and confirmed with the user: does the behavior change need a story?
- **Pure docs / process / tooling plans skip** — the plan's `## Context` / `## Goals` block is the record; no story is created.

## User-story collision gate

Before planning work that touches features, read `user-stories/index.md` first, filter candidates by epic / affected areas, then read the candidate bodies and learn the current definitions. Scan the intended work for collisions with an existing story: overlap (same scenario), contradiction (opposing behavior), or extension (supersedes or broadens a defined feature).

- **On collision:** stop before creating any plan file. Report the collision with evidence — the existing story's persona/goal/scenario and the intended work's corresponding statements — and ask the user how to proceed.
- **On the user's decision:** append a dated line to the affected story's `## Resolved decisions` recording the resolution.
- **Drift watch:** re-run the gate when scope adds a feature mid-plan (see **Goal lifecycle** → Drift watch).

## Create new plan

1. Run the initial inventory.
2. Choose subfolder layout unless the task has one owner, one file edit, no phase handoff, no external mutation, and at most 30 instruction lines.
3. Derive the task slug, phase list, and full write/delete manifest in memory.
4. Detect the goals from the task description: numbered `G1..Gn`, each stating what must be true when the plan is done (see **Goal lifecycle** → Detect).
5. Run the goals-confirmation gate: first present the goals and classification in Markdown (see **Goal lifecycle** → Present), then run one short `question` call confirming them BEFORE any file creation (see **Goal lifecycle** → Confirm).
6. Select the template: `references/_template-programming.md` for programming plans, `references/_template.md` otherwise (see **Template selection**).
7. Run the user-story gate: read `user-stories/index.md`, identify the touched features, and for each run CREATE / UPDATE / COLLIDE (see **User stories** + **User-story collision gate**). On collision, stop before creating any plan file and ask the user. If the plan skips stories (see **User-story scope**), record that in the plan's Context.
8. Run the post-scope collision check. Stop on overlap; do not create files.
9. Create `plans/<task-slug>-YYYYMMDD/plan.md` from the selected template and one `phase-NN-<owner>.md` from `references/_phase-template.md` per phase.
10. Fill each phase's Owner, Pre, Reads, Writes, Steps, Output, Verify commands, Gate, and Abort conditions. Do not leave `TBD` in Steps, Output, Gate, or Abort.
11. Add one verification checkbox per phase output and confirm every checkbox traces to a phase output.
12. Run the post-write self-verification loop (below) on every written file.
13. Render the plan through `ExitPlanMode` before dispatching Forge 🔨 (Implementer).

## Post-write self-verification loop

Run after every file write (`plan.md`, each phase file, story create/update, index update), and after every Forge 🔨 (Implementer) dispatch that mutates plan artifacts. Iterate until a full pass finds zero violations:

1. **Re-read** every file just written: `plan.md`, each `phase-NN-<owner>.md`, `user-stories/<slug>.md`, `user-stories/index.md`.
2. **Mechanical pass** — for an active subfolder plan that creates or modifies a user story or `user-stories/index.md`, run `python3 .opencode/skills/plan-enforce/scripts/validate_plan.py <plan-dir> --stories user-stories` so index mirroring runs. For a no-stories path, run `python3 .opencode/skills/plan-enforce/scripts/validate_plan.py <plan-dir>` without `--stories`; use `python3 .opencode/skills/plan-enforce/scripts/validate_plan.py <plan.md> --single-file` for the single-file layout. It enforces the repetitive subset: Status enum, `Completed:` line, required sections, phase sections/labels, phase executor-command table presence/shape, unfilled `<...>`/`TBD`/date placeholders, index mirroring. Fix anything it reports.
3. **Analysis pass** — re-read each file against `references/_consistency-checklist.md`. Verify every value matches evidence: goals match the confirmed list, every phase traces to ≥1 goal and references an existing phase file, verification checkboxes trace to phase outputs, `## Writes` matches the manifest, story title/status mirror the index, and touched stories carry no `⬜` acceptance criteria at completion (see `### Acceptance-criterion reconciliation`). Never invent a value to satisfy a check — stop and ask.
4. **Repeat** until a clean pass, then report the pass count.
5. **Cap (S-07):** after 3 iterations, or the same violation persisting twice unchanged, stop-and-ask instead of looping.

`scripts/validate_plan.py` is a helper, not the authority — it catches repetitive mechanical drift; semantic correctness is the analysis pass.

## Plan lifecycle rules

| Event | Required action |
|---|---|
| Any plan/phase/story/index file write | Run the post-write self-verification loop (mechanical + analysis) until clean. |
| Phase completes | Mark its verification item complete in `plan.md`. |
| Scope changes | Stop; notify the user with evidence of the drift and wait for their call; then update `## Goals` and append a dated line to `## Resolved decisions`; re-derive the manifest and re-run the collision check. |
| Forge 🔨 (Implementer) dispatch | Run both stash-gate parts and require an active plan before dispatch. |
| Audits pass, release PR requested | Present the goals resume in chat (`✅`/`❌` per goal with evidence), write `## Outcome`, set `Status: completed`, append `Completed: YYYY-MM-DD HH:MM`, and move the plan to `plans/.completed/` — all BEFORE the release PR is built. |
| Plan was tracked mid-work | Stage the plan-file deletions into the completing PR; never stage a completed plan's content. |
| PR review demands rework | Restore the plan folder from `plans/.completed/` per the reopen rule, resume, re-complete pre-release, and re-stage the deletions. |
| Plan cancelled | Complete it as cancelled: `## Outcome` records the cancellation; a tracked cancelled plan retires through the next PR's deletions. |
| User confirms PR merge | Run both stash-gate parts, verify `git diff origin/main <branch>` is empty, pull main, clean up branches. No post-merge archive step exists; optionally append the merge SHA / PR number to the local archive copy. |

Git tracks only incomplete plans. Stage plan artifacts only while their plan is incomplete; a plan tracked mid-work leaves git through file deletions staged in its own completing PR; a single-session plan is never committed anywhere. Plans remain active through implementation and audit — completion and archive happen pre-release. Never delete a plan, create an archive commit, invoke a merge command, or mutate a stash during archival.

## Documentation discipline

Published documents must not cite `plans/` or `output/` paths because plans move to the gitignored archive and output is temporal. Cite a commit SHA, PR number, or ticket ID instead.

## Examples

**New multi-phase task:** derive all phase writes in memory, run the collision check, then create a subfolder plan and phase runbooks.

**Existing plan before Forge 🔨 (Implementer) dispatch:** read every phase `## Writes` block, compare it with the inventory, and dispatch only after no overlap is found.

**Stale non-overlapping stash:** offer the user reconciliation options (e.g. `git stash apply` in their terminal) or leaving the stash untouched; never erase or replay it in the caller repository.

**Goals lifecycle trace (present → confirm → drift → resume):** the user describes a task; goals are detected (`G1..Gn`), displayed as a readable Markdown goal list with a separate plan classification, then confirmed by one short `question` call. The confirmed goals are persisted as `## Goals` checkboxes. Mid-plan, a scope change drifts from a confirmed goal — work stops, the user is notified with evidence, and on their call the goal is updated with a dated line in `## Resolved decisions`. At completion — pre-release, after audits pass — the goals resume is presented in chat (`✅`/`❌` per goal), `## Outcome` is written, the plan is archived locally, and when the plan was ever tracked its deletions ride the completing PR. No post-merge archive step exists.

## Troubleshooting

**Live main SHA unavailable:** resolve the repository remote or authentication problem, then rerun the initial inventory. Do not proceed with a cached SHA.

**Manifest overlaps a stash path:** change the planned write/delete scope or leave the plan blocked. The stash is never erased; the user may recover it later with `git stash apply` in their terminal.

**Permission denies stash inventory:** confirm `opencode.jsonc` retains targeted destructive-path denies followed by explicit read-only allows for `git stash list` and `git stash show -u`.
