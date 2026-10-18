# Plan / Phase / Audit / Completion — consistency checklist

> Canonical contract for plan, phase, audit, and completion artifacts written by the `plan-enforce` skill. Applied at write-time by that skill's post-write self-verification loop (analysis) and mechanically by `scripts/validate_plan.py` (repetitive subset). Sentinel 🛡️ (Quality Guardian) audits `plans/` against this same checklist — keep the two in lockstep.
>
> User-story artifacts are governed by the `user-story` skill's own contract at
> `.opencode/skills/user-story/references/_consistency-checklist.md`. Ticket working
> artifacts are governed by `.opencode/skills/ticket-runbook/references/_consistency-checklist.md`.

## plan.md

- `Status:` value is `active` or `completed` (no other values).
- When `Status: completed`, a `Completed: YYYY-MM-DD HH:MM` line is present in the metadata header.
- Metadata header has `Started` and `Subject` (and `Layout` for subfolder plans).
- Required sections present: `## Context`, `## Goals`, `## Critical files / tools`, `## Verification`, `## Out of scope` (or `## Out of scope / Do-not-touch`), plus `## Body` (base template) or `## Current state` + `## Behavior change` (programming template).
- `## Goals` checkboxes present and match the confirmed goal list; each goal lists Issue, How, and Files; programming goals each carry a `Done when:` criterion. `## Context` is the overall issue. Table-only goals without that per-goal prose are a violation.
- No unfilled placeholders: `<task subject>`, a literal `YYYY-MM-DD HH:MM`, or stray `<!-- -->` comment lines (the `## Pending` section may retain its example comments).
- Goal trace: every dispatch-table row names an existing `phase-NN-<owner>.md` runbook, every phase file appears in the dispatch table, and (when the table ends in a `Goals` column) every cited goal ID exists and every declared goal ID is cited by ≥1 row.
- Manifest equality: `## Write/delete manifest` is an `Action`/`Path` table using only `Modify`, `Add`, or `Delete`, and its normalized path set equals the union of every phase's `**Writes:**` paths (`none` contributes nothing).
- Verification parity: the count of `## Verification` `- ⬜` / `- ✅` bullets equals the number of phase files; each verification checkbox traces to a phase output.
- Audit gate: `## Audit` (when present) carries a `Verdict` in `[PENDING]`, `[PASS]`, `[FAIL]`; a `Status: completed` plan carries `[PASS]` with a non-empty `Auditor` and a set `Date`. An unknown verdict or an audit missing on a completed plan is a violation.

## Coordination and accepted joins (semantic review)

- Apply `knowledge/agents.md` **Safe parallel task coordination (HARD RULE)**; no competing contract or additional instance authority/allowances. Cipher 🔓 (Lead Orchestrator) is the single coordinator/acceptance and shared accounting owner.
- Plan/phase declarations name workflow/task/instance, responsible role/responsibility, accepted predecessor results and input identities, exact writes and other resource modes/accesses, allocated output destination, required gates, continuation/join owner and capacity allocation/accounting owner. They supplement the complete verbatim dispatch bundle.
- Readiness requires accepted relevant predecessors, present/current inputs, existing approvals/gates, compatible resources and declared capacity. Independent ready same-role/cross-role work runs concurrently; serialization names its real dependency/conflict/gate/capacity reason. Phase numbers and role names prove neither ordering nor independence; unknown external capacity/isolation is missing evidence.
- Review actual canonical footprints, not only filenames: aliases, creation/deletion/rename, overlapping directories, shared contracts/exports/fixtures, generated/formatter/autofix outputs, reports/registers/indexes, external records, browser/auth sessions, environments, Git/worktree state and PR bodies. Declare read-side effects. One active writer owns each mutable resource; whole-file writes conflict across text regions, and directory deletion conflicts with descendants. Unchanged shared reads may overlap; reject conflicts unless isolation is verified, never assumed from separate sessions/prompts.
- Outputs are allocated before dispatch and attributable to each instance/consumed inputs. Fixed governing paths stay exclusive/serialized; renaming them solely for parallelism is forbidden. Autofix reviewers are writers and need their footprint assigned.
- Reviewed content/dependencies are stable with recorded identities/scope. Relevant changes invalidate affected verdicts/assignments before redispatch; a slice verdict is not a combined-candidate/completion verdict.
- Required edit checkpoints return `AWAITING_REVIEW` with task identity, changed paths, content/input identity, required owner gate, completed operations and resource-use state. The parent obtains the existing owner's current verdict and explicitly redispatches continuation; a checkpoint is not step completion, and callbacks/hidden suspension/cancellation/self-dispatch are not assumed.
- Boundary needs stop before out-of-assignment mutation and return `BLOCKED` with exact need, inspected evidence, options/default. The coordinator resolves scope/approvals, stops affected dependent dispatches, and observes cessation before ownership transfer. Stop requests, timeouts, stale timestamps or completed tool returns alone do not prove continuing external effects ceased.
- `COMPLETED` outputs state actual outputs, consumed identities, gate evidence and release status. Only coordinator acceptance of every relevant result and combined candidate releases declared dependents/completion. Incomplete, failed, stale or still-mutating predecessors cannot unblock work. Preserve distinct review/execution verdicts, incident query/hypothesis ordering, budget denominators, source authority, mutation approvals and close-out gates.
- Preserve parsed structures: Runbook stays dispatch column 4, Goals remains terminal when present, `Action`/`Path` and `Executor`/`Command` remain exact, semicolon-delimited `> **Writes:**` contains only paths or `none`, and verification parity stays one checkbox per phase file. Sequential plans retain their supported shape; declarations are semantic prose, not a new parser schema.
- Structural validation proves no filesystem lock, semantic independence, isolation, executor authority or workflow acceptance. Check independent same-role/cross-role readiness, a rejected collision, stale evidence and an unfinished predecessor against actual evidence, not template assertions.

## Execution-review (analysis)

- After plan files are written, the last user-facing message is human-readable prose per goal in order Issue, Goal, How, Files. A recap file table may follow and must not replace that prose. Dense dumps and table-only briefs are a violation.
- Forge 🔨 (Implementer) is not dispatched in the plan-creation turn. `ExitPlanMode` is not authorization to implement.
- CREATE of a new story file requires an explicit UPDATE / rename / CREATE user choice after index-filtered candidate analysis. CREATE without that choice is a violation.

## Audit gate

- Shape on `plan.md`: `- Auditor:`, `- Verdict:`, `- Findings:`, `- Date:`.
- `Auditor` — the independent auditor name, or `not yet run` while the plan is active.
- `Verdict` — one of `[PENDING]`, `[PASS]`, `[FAIL]`.
- `Date` — set when the independent audit runs.
- A plan is not reported ready and Forge 🔨 (Implementer) is not dispatched until an independent auditor returns `[PASS]`. If no auditor can run, the plan stays not-ready; a substitute requires explicit user authorization recorded in `## Audit` (fail-closed).

## phase-NN-<owner>.md

- `Owner`, `Pre`, `Reads`, `Writes` blockquote labels populated.
- No `TBD` in `Steps`, `Output`, `Gate`, or `Abort conditions`.
- Canonical `> **Writes:**` paths match the derived write/delete manifest.
- No unfilled `<...>` placeholder tokens.
- `## Verify commands` is a non-empty canonical table with exactly the `Executor` and `Command` columns; every row pairs one non-empty executor with one non-empty command.
- Executor authority is a phase-review item: the reviewer confirms the declared executor holds the role and tool authority to run the command. The validator checks declared traceability only and never inspects permission models.
- A phase editing a Python `test_*.py` file in reviewed discovery areas lists the destination's approved whole-suite command, assigns Crucible 🔥 (Test Architect) as its executor, and records Bastion 🧱 (Backend & Scripts Architect) `[PASS]`; the gate requires Crucible's test command exit 0 and a separate test-architecture `[PASS]`; `[FAIL]` or `[UNCERTAIN]` blocks completion.

## Completion and findings (analysis)

- Completion evidence is the layered matrix on the current snapshot: code architecture, test architecture, test execution, and model/guidance verdicts, each with its scope and verdict. A passing execution never substitutes for a required architecture verdict, and a planning-readiness audit is never the completion audit. `## Outcome` and goal checkmarks require this evidence, accepted joins, reconciliation of committed/materially-changed criteria and introduced regressions, and respect for Constraints; unselected unfulfilled commitments stay `⬜`, while evidence-grounded existing shared marks are preserved rather than reset.
- Apply the full lifecycle's **Story ownership and current evidence**: source work reconciles shared criteria at the authorized source; destination work records project-owned outcomes without changing inherited core, criteria, marks, or Proof. Inherited `✅` and synchronization do not prove the current plan's checks or regressions passed. Review actual proving surfaces/current evidence and required contract dependencies, not inherited status alone; no local completion overlay or weakening requirement is permitted.
- Apply **History finalization gate** independently of execution success: approved staged persistence/planning may retain truthful pending history outside the feature log and shared core, with unimplemented criteria pending and future Proof unverified. Missing or nonmatching final references block completion, goal checkmarks, Outcome, completed metadata, archive, and release handoff until the real matching reference and compliant bounded entry are established. No fabricated delivery, borrowed anchor, or new Git/external-artifact authorization follows from this permission to prepare.
- Review adoption against the story checklist: initialize empty local history without a receipt event, preserve genuine local evidence/history, remove displaced duplicate contract/metadata, and reconcile one project-owned catalogue of actual shared/local stories. Source project sections and source index do not ship. Actual local deliveries retain the matching-history requirement; no missing source-local history is repaired by editing destination core.
- The full `references/_lifecycle-contract.md` is loaded before lifecycle operations; missing/unread/incomplete/conflicting content blocks them, with no summary fallback. Review its complete stash inventory/status, criterion dispositions, completion/archive/reopen/cancellation, lifecycle events and post-merge proof against actual evidence. Required command order/exits, live SHA/fingerprint, both ancestry directions, immutable head match, checked NUL path extraction, per-path parity, safe versus force deletion, fast-forward and conditional remote deletion remain intact; no new mutation authority is granted.
- Every admitted finding states the confirmed goal, the governing normative clause, the actual actor and the shipped path it controls (distinct from a helper or fixture), expected versus observed, affected scope, a reproduction or static fact, severity with literal output, and a keep / fix / reject-scope decision.
- Replaced, superseded, or newly wired behavior carries a recorded legacy/dead-code sweep; no dead symbol, inert field, or stale mapping survives completion.
- An all-pending-changes analysis dispositions every nonignored modified, deleted, and untracked path as `ship` / `fix` / `drop` from inspected content; manifest absence never proves unrelatedness.

## user-stories

Story format and hygiene are owned by the `user-story` skill — see
`.opencode/skills/user-story/references/_consistency-checklist.md`. `plan-enforce`
consumes an approved (`active`) story and its selected criteria and never renegotiates
the story choice. Approved-criteria completion scope, shared/local ownership, dependency
and revision review, destination reconciliation, behaviour/Proof separation, staged
persistence/history, and the `## Constraints` contract are defined there. Review the
actual contract and project evidence; do not auto-check criteria or treat source-only
references as destination requirements. Unresolved source changes return to the owner.

## Loop rule

Analysis items (everything above) are the skill's responsibility — a value must match evidence, never be invented to satisfy a check. `scripts/validate_plan.py` enforces only the mechanical/repetitive subset: enum values, section presence, placeholder/TBD detection, goal trace, manifest equality, verification parity, the completed-plan audit gate, index mirroring, and the presence/shape of each phase's executor-command table. It is a helper, not the authority. Executor authority, goal wording, audit quality and coordination/lifecycle acceptance are analysis items, never a mechanical pass.
