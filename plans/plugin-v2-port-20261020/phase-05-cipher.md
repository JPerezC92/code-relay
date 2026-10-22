# Phase 5 — Completion evidence and shipped config

> **Owner:** Cipher 🔓 (Lead Orchestrator)
> **Pre:** `T1`, `T2`, `T3` and `T4` have returned `COMPLETED` and Cipher 🔓 (Lead Orchestrator) has accepted each. Required input identities: `T1`'s nine-file content identity (dependency surface + port contract), `T2`'s three-file content identity (entrypoint + `index.test.ts` + `opencode.jsonc`), `T3`'s three-path content identity (`tui.tsx`, `tui.test.ts`, `tui.jsonc` deletion), `T4`'s two-file content identity (story + index). Existing gates: each phase's Bastion 🧱 (Backend & Scripts Architect) and Crucible 🔥 (Test Architect) verdicts accepted, plus `T4`'s Sentinel 🛡️ (Quality Guardian) verdict. Resource access: exclusive write footprint below. Capacity: available.
> **Reads:** `T1`–`T4` accepted outputs; `user-stories/mobile-opencode-companion.md` `## Acceptance criteria` and `## Resolved decisions`; `knowledge/agents.md:49-59`; `turbo.json`
> **Writes:** `turbo.json`

> Contract-sized: one coherent responsibility — establish the layered completion evidence for the port on the combined candidate and ship the project config this release carries. It writes no source code. `## Outcome`, goal checkmarks and archiving are lifecycle steps performed after this phase under `_lifecycle-contract.md` **Resume (completion)**, not part of it.

## Assignment and resources

- Workflow / task / instance: `plugin-v2-port-20261020` / `T5` / `T5-instance-1`; Cipher 🔓 (Lead Orchestrator) owns completion evidence evaluation and combined-candidate acceptance.
- Accepted predecessors / input identities: `T1`–`T4` returns with their recorded content identities, accepted by the coordinator. A predecessor that is incomplete, failed, stale or still mutating blocks this phase.
- Permitted resource access: whole-file write to `turbo.json` only. Everything else is read-only. Shell: `pnpm typecheck`, `pnpm test`, PowerShell `Select-String` read-only discovery, and `opencode api get` which may start or reuse the shared background service (declared read-side effect; mutates no repository state). No Git mutation.
- Ownership / output destination: sole active writer of `turbo.json`. Report returns to the coordinator (this instance is the coordinator).
- Required gates / continuation / join owner: no further implementation gate — this phase *is* the acceptance. It still requires the recorded independent planning audit `[PASS]` in `plan.md` `## Audit` before anything is reported ready, and the completion audit is separate from that planning audit. Join owner: Cipher 🔓 (Lead Orchestrator).
- Capacity allocation / accounting owner: Cipher 🔓 (Lead Orchestrator) holds the single shared ledger.
- Readiness / serialization evidence: serialized behind `T1`–`T4` by the acceptance-join rule — completion evidence is only meaningful on the combined candidate of all four write footprints. Phase numbering is not the reason.

> Apply the shared coordination contract. Structural validation is not locking, independence, isolation, authority or acceptance.

**Verbatim subagent contract — any dispatch carrying this runbook must also carry these two clauses unchanged:**

> Never invoke the user-facing `question` tool. If required input, instruction, or evidence is missing, halt and report to Cipher 🔓 (Lead Orchestrator) the task as received, exact missing item, inspected sources, bounded options, and recommended default. Never guess, assume, silently continue, or stall.

> Report discipline: lead with the requested verdict (`[PASS]` / `[FAIL]` / `[BLOCK]` / `[UNCERTAIN]` / `[ADVISORY]`) for audit or verification work; cite `file:line` and the governing rule; do not dump file excerpts; hard bound **≤ 60 lines**.

## Steps

1. Run `pnpm typecheck` at the repository root and record the exit code.
2. Run `pnpm test` at the repository root — the reviewed whole-suite command, `turbo run test` covering `packages/protocol`, `packages/opencode-plugin` and `apps/mobile` — and record the exit code and per-package counts.
3. Run `Select-String -Path packages\opencode-plugin\src\*.ts,packages\opencode-plugin\src\*.tsx,packages\opencode-plugin\package.json -Pattern "@opencode-ai"` and record the result; any match is a failure.
4. Run `Test-Path tui.jsonc` and record the result; `True` is a failure.
5. Re-run `opencode api get '/api/plugin?location[directory]=G:\projects-personal\code-relay'` and record the entry whose `source.type` is not `builtin`, with its `state.status`.
6. Run `Select-String -Path "$env:USERPROFILE\.local\share\opencode\log\opencode.log" -Pattern "failed to reload plugins|configured plugin path|plugin load"` and record that no `level=ERROR` line for this plugin is stamped **after 2026-10-20T05:13Z** (this plan's start in the log's UTC frame). The `failed to reload plugins` line at 04:05:04Z and the three `WARN "configured plugin path must be a directory"` lines at 04:13:05Z / 04:13:36Z / 04:15:14Z are pre-plan and out of scope; WARN is not ERROR.
7. Consume Herald 📯 (Release Manager)'s read-only `git diff -- turbo.json` output and confirm the only delta from the committed state is the `"ui": "tui"` key added at the top level. Any other delta is a failure — this file ships unrelated to the plugin port and must carry nothing else. Comparing against the committed state is Git work and is reserved to Herald 📯 (Release Manager); this phase does not run it.
8. Build the layered completion matrix on the current snapshot, one row per layer with its scope and verdict: code architecture (Bastion 🧱 (Backend & Scripts Architect) over `allowlist.ts`, `session-catalog.ts`, `index.ts`, `tui.tsx`), test architecture (Crucible 🔥 (Test Architect) over the seven edited/new test files), test execution (steps 1-2), and the recorded independent audit. A passing execution never stands in for a required architecture verdict.
9. Reconcile the selected criteria by their **positional** references in the story's `## Acceptance criteria` list — AC1 workspace, AC2 pairing screen/gateway/QR, AC3 pairing/auth/encryption, AC4 session picker + prompts/abort/permission safety, AC5 automated tests, AC8 model list from `config.providers`, AC14 tool-output/cwd redaction, AC15 child-session routing. Record **current** evidence for each from the matrix; never reuse the story's existing `✅`, which was earned under V1 and is not current-plan evidence for a materially changed substrate. Criteria this plan did not select (AC6, AC7, AC9, AC10, AC11, AC12, AC13) are left untouched and do not block completion. **Durable home for this evidence:** the story's project-owned `## Revision tracking` section, not this plan. `user-story/references/_consistency-checklist.md:72` anchors a reconciled `✅` to the story's `## Proof` section, which this story does not have and which this plan must not create; and `plans/` is never a traceability anchor (`plan-enforce` documentation discipline). So the per-criterion current-evidence rows are **returned in this phase's report**, and are **persisted in the completing turn** beside the deferred `## Change log` entry, once the delivering commit exists. They are not written here: `T5`'s write footprint is `turbo.json` only, and `T4` is the sole writer of the story file, so writing them in this phase would be an out-of-assignment write that this runbook's own abort conditions forbid. Each row identifies its criterion by its **position in the list plus a quoted lead-in of the promise text** (for example "AC position 3 — 'One phone pairs to one Linux host with a single-use credential…'"), **never** by the plan-local `AC<n>` tokens, which per `plan.md` must not be written back into the story.
10. Confirm none of the rules recorded in the story's `## Resolved decisions` was violated. The story has **no `## Constraints` section**; the binding restrictions live at `mobile-opencode-companion.md:59` ("No always-allow, shell, or file APIs") and `:64` ("no mobile action accepts a filesystem path"), which bound the allowlist this plan re-derived. They are respected and never ticked or delivered as if they were criteria.
11. Record any criterion that cannot be established as `❌` with its evidence gap, which blocks `## Outcome` and archival until satisfied or removed through approved scope handling.

## Output

- **Artifact:** `turbo.json`
- **Schema / shape:** the committed `turbo.json` plus exactly one top-level `"ui": "tui"` key; no other key changed.
- **Attribution / identities:** task `T5`; consumed input identities are `T1`–`T4`'s accepted content identities. Produced content identity is the post-edit hash of `turbo.json` plus the layered matrix and criterion-reconciliation rows returned in the report. Relevant review scope: the recorded independent audit over the final candidate.
- **Parent handoff:** returns `COMPLETED` with the layered matrix, the per-criterion reconciliation for AC1–AC5, AC8, AC14, AC15, the `## Resolved decisions`-rules confirmation, the commands' exit codes and the registry excerpt. This author return remains subject to coordinator acceptance; `## Outcome`, goal checkmarks and the archive move follow under `_lifecycle-contract.md` **Resume (completion)** and are not claimed here.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm test` |
| Cipher 🔓 (Lead Orchestrator) | `pnpm typecheck` |
| Cipher 🔓 (Lead Orchestrator) | `opencode api get '/api/plugin?location[directory]=G:\projects-personal\code-relay'` |
| Cipher 🔓 (Lead Orchestrator) | `Select-String -Path packages\opencode-plugin\src\*.ts,packages\opencode-plugin\src\*.tsx,packages\opencode-plugin\package.json -Pattern "@opencode-ai"` |
| Cipher 🔓 (Lead Orchestrator) | `Test-Path tui.jsonc` |
| Herald 📯 (Release Manager) | `git diff -- turbo.json` |

- Executor authority note: `AGENTS.md` reserves "the approved whole-suite command with Crucible 🔥 (Test Architect)", but `agents.crucible.permissions` in the root `opencode.jsonc` sets shell `*` to `deny` and allows only `pnpm install`, `rg *`, `ls *`, `wc *` and read-only `git log/show/diff`. That policy cannot execute `pnpm test`, so declaring Crucible 🔥 (Test Architect) would produce a plan whose verify command no declared executor can run. **The user explicitly approved Cipher 🔓 (Lead Orchestrator) as interim whole-suite executor on 2026-10-20** and declined to widen the grant in this plan; that decision is recorded in `plan.md` `## Resolved decisions`. Cipher 🔓 (Lead Orchestrator) holds global `shell: * allow` and did not author the code, which makes this independent completion evidence. Crucible 🔥 (Test Architect)'s test-architecture verdict remains a required gate and is a review verdict, not command execution.
- `rg` is not on PATH in agent shells, so these commands use PowerShell `Select-String` and `Test-Path`.
- Expected red is never the gate PASS: this phase requires final green across steps 1-6 and the applicable architecture verdicts.

## Gate

- ⬜ `pnpm typecheck` exits 0 and `pnpm test` exits 0 across `packages/protocol`, `packages/opencode-plugin` and `apps/mobile`.
- ⬜ `Select-String ... -Pattern "@opencode-ai"` over `packages/opencode-plugin` sources and manifest returns no match, and `Test-Path tui.jsonc` returns `False`.
- ⬜ The registry shows a non-builtin entry with `state.status` `active`, and the log shows no `level=ERROR` plugin-load failure for it stamped after 2026-10-20T05:13Z (pre-plan `04:05:04Z` ERROR and `04:13–04:15Z` WARN lines are out of scope).
- ⬜ `turbo.json` carries exactly the `"ui": "tui"` delta and nothing else.
- ⬜ The layered completion matrix is complete: code architecture, test architecture, test execution and the recorded independent audit, each with scope and verdict. A missing or adverse layer blocks this gate.
- ⬜ Every selected criterion AC1–AC5, AC8, AC14, AC15 is reconciled with **current** evidence; none is left `⬜`. Unselected criteria AC6, AC7, AC9–AC13 remain untouched.
- ⬜ None of the rules in the story's `## Resolved decisions` (`:59`, `:64`) was violated, and none was ticked or delivered as if it were a criterion. No `## Constraints` section is asserted to exist.
- ⬜ Relevant content/dependencies stayed stable for review and current applicable verdicts are accepted.
- ⬜ The parent accepted every relevant return and the combined candidate; no incomplete, failed, stale or still-mutating predecessor unblocked completion.

## Abort conditions

- Halt if any of `pnpm typecheck`, `pnpm test` or the `Select-String` check is non-zero or non-empty, or if `Test-Path tui.jsonc` returns `True`. Report `BLOCKED` with the failing package, the failing test names, and the affected goal.
- Halt if the live registry still shows no non-builtin entry, or if the log shows a plugin load failure. Report `BLOCKED` with the registry excerpt and the log line.
- Halt if `turbo.json` contains any delta beyond `"ui": "tui"`. Report `BLOCKED` with the observed diff.
- Halt if a selected criterion cannot be established by current evidence. Do not carry the story's existing `✅` forward as proof. Report `BLOCKED` with the criterion, the evidence sought, what the matrix showed, and bounded options.
- Halt if a rule in the story's `## Resolved decisions` was violated by the re-derived allowlist. Report `BLOCKED` with the rule text and the violating operation.
- Stop before any out-of-assignment write/mutation or incompatible access.
