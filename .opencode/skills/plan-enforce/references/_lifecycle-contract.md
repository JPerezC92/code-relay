# Plan-enforce — mandatory lifecycle contract

Read this entire reference before any stash inventory/status operation, plan creation/resumption, criterion reconciliation, completion/archive/reopen/cancellation, implementer dispatch, release preparation, or post-merge cleanup. This reference is normative, not optional background. A missing, unread, incomplete, or conflicting reference blocks the affected operation; never fall back to the skill's summaries. Apply the inline story, approval, dispatch, executor, discovery, audit, self-verification, and documentation rules with it.

## Stash safety gate

This gate has two ordered parts: an initial read-only inventory and a post-scope collision check. It runs before new-plan creation, plan resumption, archive work, and every Forge 🔨 (Implementer) dispatch. The gate never mutates the caller repository's stash or refs. Git operations remain with Herald 📯 (Release Manager); this contract grants no new command authority.

### Initial read-only inventory

Run this inventory before selecting a plan, deriving a new plan, or writing a plan file:

| Command | Purpose |
|---|---|
| `git ls-remote "$BASE_REMOTE" "refs/heads/$BASE_BRANCH"` | Capture `LIVE_MAIN_SHA`. Fail closed if unavailable. |
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

Check command exits and parseable output: ancestry exit 0 means ancestor, exit 1 means not ancestor; an error is not a negative ancestry result. Distinguish an absent stash ref from other failures. Malformed selectors, missing objects, unparseable output, or a changed fingerprint from the plan's recorded fingerprint fail closed. Caller-repository stash mutation is forbidden. The permission policy denies direct destructive stash/ref/reflog/pruning pathways; this is a targeted policy, not an exhaustive shell sandbox.

### Derive the write/delete manifest

Derive the manifest before the collision check:

- **New plan:** derive the complete write/delete manifest in memory from the intended task and phase design before writing any plan or phase file.
- **Existing subfolder plan:** derive the manifest from every phase runbook's `## Writes` block (the canonical `> **Writes:**` label).
- **Existing single-file plan:** derive the manifest from its explicit write/delete instructions only.

Read-only inputs are never manifest entries. The manifest must be complete before a new plan file is created or Forge 🔨 (Implementer) is dispatched.

### Post-scope collision check

Intersect every stashed changed path from the initial inventory with the derived write/delete manifest:

- Any intersection is `PLANNED_PATH_OVERLAP`: fail closed before plan-file creation or Forge 🔨 (Implementer) dispatch.
- No intersection permits the plan flow to continue.
- A stale, ahead, or diverged non-overlapping stash is a user-gated reconciliation candidate; current non-overlapping stashes are reported and retained.

### Stash lifecycle

Park work via `git stash push` / `git stash save` — git never erases existing stash entries on push; stash entries use stack semantics. Recover via `git stash apply <ref>` — non-destructive, the entry survives as a durable backup. Erasure (`pop`, `drop`, `clear`, `update-ref -d refs/stash`) is denied to model agents and is user-only, run manually in the user's terminal. The stash gate itself remains read-only; these lifecycle descriptions never authorize it to mutate a stash.

### Stash status query

To answer "are there unapplied stashes?" mechanically, run these three read-only commands:

| Command | Purpose |
|---|---|
| `git stash list` | Enumerate stash selectors. |
| `git stash show -u <selector> --name-only` | List tracked, deleted, and untracked paths per stash. |
| `git status --porcelain` | List current worktree paths. |

Verdict: ALL stash paths present in worktree status = applied; any missing = unapplied. If the comparison is inconclusive (worktree diverged after apply), say "cannot confirm mechanically" — never guess. Failed or unparseable inventory/status output blocks a mechanical verdict.

## Acceptance-criterion reconciliation (fail-closed)

### Story ownership and current evidence

Read the approved contract, selected criteria, portable Proof, Constraints, and relevant
project-owned approval/evidence/history together. Shared requirements and marks belong
to source-owned core; local requirements and execution outcomes belong to project.
Inherited `✅` reports shared delivery, not evidence that the current plan or destination
verification passed. Obtain current evidence for selected work, materially changed
behaviour, and relevant regressions; synchronization alone establishes none of these.

The dispositions below authorize story edits only at the contract's existing owner:
authorized source work reconciles shared criteria and Proof at source; genuine local
contracts follow local ownership. Destination work leaves inherited core bytes, criteria,
marks, and Proof unchanged and records its own evidence and outcomes in project-owned
content, not a duplicate shared-completion table. An unmet selected promise still blocks
the destination plan even when inherited core displays `✅`. A needed shared change or
false shared mark routes through an approved source revision and synchronization; a
distinct local requirement follows existing ownership/collision/approval review and
cannot weaken core. A destination cannot remove a shared promise to unblock itself.

Preserve unchanged criterion identities on revision; explicitly account for approved
changes/retirements, positional remapping where necessary, Proof and dependencies under
the story checklist. Read current proving surfaces and evidence before retaining marks.
Do not blanket-reset inherited status or claim unchanged marks prove new work.

A plan reconciles only the acceptance criteria it **committed to deliver** — the selected criteria of the approved story that its goals trace to — the criteria it **materially changes**, and any regression it introduced. Other legitimate unfulfilled commitments the plan did not select stay `⬜` and do not block completion; evidence-grounded existing shared marks are preserved, not reset:

- `✅` — a committed or materially-changed criterion established by verified evidence, resolved through the story's `## Proof` section (a completed goal's `Done when:`, a passing verify command, or a recorded outcome). No committed criterion may remain `⬜` at completion.
- `❌` — a committed criterion explicitly known to be unmet. A `❌`, an unmet committed criterion, or a regression the plan introduced blocks `## Outcome` and archival until satisfied or removed.
- A committed or materially-changed criterion removed as out-of-scope follows approved scope/revision handling at the authorized owner: delete it from that contract (not merely leave it unchecked), account for affected identities/references, and record the matching dated change-log entry, optionally pointing at a follow-up story. This never authorizes a destination core edit.
- A criterion the plan did not select is not reconciled: leaving it `⬜` is not a defect, and no blanket "every touched-story criterion" disposition applies.
- **`## Constraints` are respected, never delivered.** A story's `## Constraints` entries are pre-decided restrictions, not obligations to build: confirm none was violated, and never tick, deliver, or reconcile one as a criterion.

Reconciliation is fail-closed on adverse evidence: `## Outcome` and the archive move stay blocked while a committed criterion lacks evidence, a `## Constraints` entry the plan violated is unresolved, a regression the plan introduced is unresolved, or the final-snapshot evidence is missing or adverse. Release events (PR opened/reviewed/merged) are release history, not feature acceptance criteria; a feature criterion may state the release policy (e.g. "merge remains user-only") but never a specific PR/review/merge event.

### History finalization gate

An explicitly approved (`active`) story revision may be persisted and consumed for
planning before its delivery-history reference exists. Read the story checklist's
**Bounded change log** procedure, including staged persistence: record truthful local approval
and known pending history in project-owned Revision tracking, outside the feature log
and shipped core. Leave unimplemented criteria pending and future Proof targets explicitly
unverified. Approval is not delivery, evidence, or implementation authorization.

Before accepting the touching delivery's completion, require the actual matching durable
reference and a compliant bounded feature-log entry. Verify the commit/PR/ticket resolves
and matches the described change and chronology; an older unrelated reference or future
artifact is not sufficient. Missing, nonresolving, or nonmatching required history blocks
completion, goal checkmarks, Outcome, completed metadata, archival, and release handoff,
even when implementation checks pass. Resolve pending tracking only after finalization.

Fresh adoption may initialize an empty project-local Change log without inventing a
receipt event; source history does not seed it. Inherited source history is not a missing
local delivery entry, but an actual local delivery still requires matching local history.
Never alter protected core or copy source project records to satisfy this gate.

Preparation under pending history grants no authority to create an issue, commit, branch,
PR, or other tracking/release artifact. If no authorized matching reference is available,
return the finalization blocker with evidence and bounded options. Preserve the existing
completion/archive-before-release order and user-only merge rule; do not create a release
PR early solely to obtain an anchor.

## Resume (completion)

When the plan's work is done and its audits have passed — before the release PR is built:

- Confirm `## Audit` records an independent auditor's `[PASS]` with `Auditor`, `Findings`, and `Date` (see the skill's **Independent audit gate**); `[PENDING]`, `[FAIL]`, or a missing audit blocks completion.
- Evaluate completion evidence as a layered matrix on the current snapshot: code architecture, test architecture, test execution, and model/guidance verdicts — each with its scope and verdict. A passing execution result never stands in for a required architecture verdict, and a missing or adverse layer blocks completion. A planning-readiness audit is never reused as the completion audit. Adjudicate any adverse finding before marking a goal or criterion complete, writing `## Outcome`, or archiving.
- Run acceptance-criterion reconciliation (see **Acceptance-criterion reconciliation (fail-closed)**) over the criteria this plan committed to deliver and materially changed, plus any regression it introduced; block `## Outcome` and the archive move while any committed criterion is unmet, any relevant regression is open, or the final-snapshot evidence is missing or adverse. Unselected unfulfilled commitments stay `⬜` and do not block; do not reset evidence-grounded existing marks.
- Apply **Story ownership and current evidence** and the **History finalization gate** before accepting completion: inherited marks are not current-plan evidence, destination core remains untouched, and the touching delivery's required matching reference and feature-log entry must be established. Pending history permits preparation, never bypasses this completion gate.
- Present the goals resume in chat: one line per goal, `✅` when met, `❌` when not, each with a 1-line evidence note.
- Write `## Outcome` into `plan.md` — what the plan produced, per goal — BEFORE moving the plan to `plans/.completed/`.
- Set `Status: completed`, append `Completed: YYYY-MM-DD HH:MM`, and move the plan to `plans/.completed/` (folder or file per layout). All of this happens pre-release; the merged PR number or merge SHA may be appended to the local archive copy afterwards as free metadata.
- Filesystem-verify the archive after the move: confirm every expected file exists under `plans/.completed/<plan>/` AND the active copy is gone from `plans/`. A `mv` that reports success can still leave the active copy in place (observed 2026-08-24); the filesystem, not the command's silence, is the evidence.
- A plan archived without `## Outcome` is a lifecycle violation: restore it, write the section, then archive again.

Before completion, Cipher 🔓 (Lead Orchestrator) accepts every relevant task return and the combined candidate on stable content/input identities. An unfinished, failed, stale, or still-mutating predecessor cannot establish completion. Author completion is not acceptance; separate execution and architecture verdicts remain required. Apply the shared coordination contract without changing any existing audit, mutation approval, or lifecycle gate.

## Plan lifecycle rules

| Event | Required action |
|---|---|
| Any plan/phase/story/index file write | Run the post-write self-verification loop (mechanical + analysis) until clean. |
| Plan files written | Send the execution-review message and stop. Do not dispatch Forge 🔨 (Implementer) in the plan-creation turn. |
| Phase completes | After coordinator acceptance of its current outputs and applicable gates, mark its verification item complete in `plan.md`; release only declared dependent tasks whose readiness is established. |
| Scope changes | Stop; notify the user with evidence of the drift and wait for their call; then update `## Goals` and append a dated line to `## Resolved decisions`; re-derive the manifest and re-run the collision check. Invalidate affected assignments/evidence before redispatch. |
| Forge 🔨 (Implementer) dispatch | Dispatch only on a later user turn that explicitly authorizes execution after the execution-review message. Run both stash-gate parts, require an active plan, and require a recorded independent-audit `[PASS]` in `## Audit` before dispatch. |
| Plan ready to report or resume | Require a recorded independent-audit `[PASS]` with auditor and date; an unavailable auditor leaves the plan not-ready (fail-closed). |
| Audits pass, release PR requested | First satisfy owner-aware criterion reconciliation, current final evidence, accepted joins, and the History finalization gate; then present the goals resume, write `## Outcome`, set completed metadata, and archive with filesystem verification — all BEFORE the release PR is built. A release request or pending anchor never bypasses these gates. |
| Plan was tracked mid-work | Stage the plan-file deletions into the completing PR; never stage a completed plan's content. |
| PR review demands rework | Restore the plan folder from `plans/.completed/` per the reopen rule, resume, re-complete pre-release, and re-stage the deletions. |
| Plan cancelled | Complete it as cancelled: `## Outcome` records the cancellation; a tracked cancelled plan retires through the next PR's deletions. |
| User confirms PR merge | Run both stash-gate parts, then the complete **Post-merge proof and cleanup** sequence below; no post-merge archive step exists and user-only merge authority is unchanged. |

Git tracks only incomplete plans. Stage plan artifacts only while their plan is incomplete; a plan tracked mid-work leaves git through file deletions staged in its own completing PR; a single-session plan is never committed anywhere. Plans remain active through implementation and audit — completion and archive happen pre-release. Never delete a plan, create an archive commit, invoke a merge command, or mutate a stash during archival.

### Reopen rule

An archived plan is never resumed directly from `plans/.completed/`. Restore it to `plans/`, set `Status: active`, and append `Reopened: YYYY-MM-DD HH:MM` before resuming. Run the stash gate and require the current independent audit before resumption/dispatch under the skill's rules. Rework invalidates affected earlier verdicts.

## Post-merge proof and cleanup

Use the user-confirmed `$PR_NUMBER` and `$BRANCH`; neutral `$BASE`, `$BASE_REMOTE`, and `$BASE_BRANCH` retain the skill's binding. Herald 📯 (Release Manager) executes authorized Git/release work; Cipher 🔓 (Lead Orchestrator) accepts evidence. Allocate the temporary `$PATHS_FILE` and exclusive Git/worktree/remote-branch access before execution. No concurrent worker may mutate the proof inputs or Git state. This sequence does not grant merge authority.

1. Run both stash-gate parts. Confirm the PR state is `MERGED` via `gh pr view "$PR_NUMBER" --json state,mergeCommit,headRefName,headRefOid`; check retrieval/parse success and required metadata. Pin the immutable PR head as `HEAD_REF_OID` and the non-empty merge commit, when provided, as `MERGE_COMMIT`.
2. Run `git fetch "$BASE_REMOTE" "$BASE_BRANCH"` successfully. Require `git rev-parse "$BRANCH"` to equal `HEAD_REF_OID`; halt on error or mismatch. Never prove an advanced or different local tip.
3. If `mergeCommit` is non-empty, require `git merge-base --is-ancestor "$MERGE_COMMIT" "$BASE"` to succeed. A negative result or error blocks deletion.
4. Check `git merge-base --is-ancestor "$BRANCH" "$BASE"`. Exit 0 (merge-commit or fast-forward) means branch-tip ancestry proves the merge and `git branch -d` applies. Exit 1 is the squash/rebase parity path below, not a proof of loss; any other exit is an error and blocks deletion.
5. For squash/rebase parity, resolve `MERGE_BASE="$(git merge-base "$BASE" "$HEAD_REF_OID")"`, checking command success and a valid non-empty result. Materialize the exact changed-path set with `git diff --name-only -z "$MERGE_BASE" "$HEAD_REF_OID" > "$PATHS_FILE"` and check its exit before reading it; an empty result is allowed. Never use unchecked command/process substitution as extraction evidence.
6. Load the NUL-delimited paths into `CHANGED_PATHS` with a read loop (e.g. initialize `CHANGED_PATHS=()`, then `while IFS= read -r -d '' path; do CHANGED_PATHS+=("$path"); done < "$PATHS_FILE"`). Preserve complete path bytes, quoting, and array boundaries; confirm the allocated extraction file is readable and the load succeeds. The proof is `git diff --quiet --exit-code "$BASE" "$HEAD_REF_OID" -- "${CHANGED_PATHS[@]}"` exiting 0. A non-zero diff or error blocks deletion.
7. Any metadata, fetch, head-mismatch, merge-base, extraction, ancestry, or diff error blocks deletion. Only after `MERGED` plus the parity proof is `git branch -D` authorized; never `-D` without both. On the ancestry path use only `git branch -d`.
8. After the applicable proof, fast-forward the local `$BASE_BRANCH` branch, then delete the local branch with the proven safe/force form and delete the remote branch only when it still exists. Check each operation's result; a failed fast-forward blocks subsequent deletion. No post-merge archive step exists; the user alone merges.

Hold the head/base and relevant dependencies stable through cleanup; relevant changes invalidate the proof and require fresh evaluation. A completed tool return alone is not evidence of cessation of continuing external side effects, and ownership transfer requires observed cessation under the shared contract.
