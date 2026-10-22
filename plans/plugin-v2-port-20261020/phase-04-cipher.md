# Phase 4 — Change-log compliance and pending history

> **Owner:** Cipher 🔓 (Lead Orchestrator)
> **Pre:** no code predecessor — this phase operates on the story's history and its anchors resolve in commits that predate this work. It is independent of `T1`–`T3` and may run concurrently with them. Current inputs: `user-stories/mobile-opencode-companion.md` as it stands before this phase, and `.opencode/skills/user-story/references/_consistency-checklist.md:79-92` read fresh. Resource access: exclusive write footprint below. Capacity: available.
> **Reads:** `user-stories/mobile-opencode-companion.md`; `user-stories/index.md`; `.opencode/skills/user-story/references/_consistency-checklist.md:79-92`; git history of `user-stories/mobile-opencode-companion.md` and of the delivery commits, read through Herald 📯 (Release Manager)
> **Writes:** `user-stories/mobile-opencode-companion.md`; `user-stories/index.md`

> Contract-sized: one coherent responsibility — bring the story's `## Change log` into compliance with the bounded-change-log rule, record this delivery's pending history truthfully, and confirm the index mirrors the story set. Interfaces consumed: the checklist's entry and rollup forms. No source code is read or written.

## Assignment and resources

- Workflow / task / instance: `plugin-v2-port-20261020` / `T4` / `T4-instance-1`; Cipher 🔓 (Lead Orchestrator) owns the user-story lifecycle and therefore `## Change log`, `## Revision tracking` and `user-stories/index.md`.
- Accepted predecessors / input identities: explicitly none. Consumes the pre-phase content identity of `user-stories/mobile-opencode-companion.md` and the checklist text read fresh.
- Permitted resource access: whole-file write to `user-stories/mobile-opencode-companion.md` and `user-stories/index.md` only. Herald 📯 (Release Manager) performs read-only `git log` / `git show` for delivery-anchor verification and writes nothing — Git is Herald 📯 (Release Manager)'s role. No source file, no `plans/` file, no `knowledge/` file is written.
- Ownership / output destination: sole active writer of both `Writes` paths. Report returns to the coordinator (this instance is the coordinator).
- Required gates / continuation / join owner: Sentinel 🛡️ (Quality Guardian) audits `user-stories/` for format and index consistency and returns `[PASS]` or `[FAIL]` as the required owner gate. Join owner: Cipher 🔓 (Lead Orchestrator).
- Capacity allocation / accounting owner: Cipher 🔓 (Lead Orchestrator) holds the single shared ledger.
- Readiness / serialization evidence: independent of `T1`–`T3` by actual dependency analysis — the anchors it verifies are delivery commits predating this work, and no code phase writes these files. Serialized only against other writers of the two `Writes` paths; there are none.

> Apply the shared coordination contract. Whole-file edits conflict even across text regions. Structural validation is not locking, independence, isolation, authority or acceptance.

**Verbatim subagent contract — the dispatch carrying this runbook must also carry these two clauses unchanged:**

> Never invoke the user-facing `question` tool. If required input, instruction, or evidence is missing, halt and report to Cipher 🔓 (Lead Orchestrator) the task as received, exact missing item, inspected sources, bounded options, and recommended default. Never guess, assume, silently continue, or stall.

> Report discipline: lead with the requested verdict (`[PASS]` / `[FAIL]` / `[BLOCK]` / `[UNCERTAIN]` / `[ADVISORY]`) for audit or verification work; cite `file:line` and the governing rule; do not dump file excerpts; hard bound **≤ 60 lines**.

## Steps

1. Dispatch Herald 📯 (Release Manager) read-only to enumerate candidate delivery commits with `git log --follow --format='%H %ad %s' --date=short -- user-stories/mobile-opencode-companion.md`, and require its report back before any edit.
2. For each of the **four most recent** change-log entries currently at `user-stories/mobile-opencode-companion.md:52-55` (dated 2026-10-13 ×3 and 2026-10-16 ×1), have Herald 📯 (Release Manager) verify a candidate anchor with `git show -s --format='%H %ad %s' --date=short` run against that candidate SHA. Under `.opencode/skills/user-story/references/_consistency-checklist.md:83` **Delivery match**, accept an anchor only when the commit's **contents and chronology** show that it delivered the change the entry describes. **Date equality between the entry and the commit is neither required nor sufficient** — `:83` requires verifying "against the commit/PR contents and dates", and an entry may be dated when it was written rather than when it shipped. A commit that merely touched the file is not an anchor.
3. If a retained entry cannot be given a verified anchor, drop it from the retained set and let the rollup line cover it. Never substitute a plausible-looking SHA.
4. Rewrite the `## Change log` section to exactly: one rollup line of the form `before <date> — earlier history: see git history for this file`, where `<date>` is the day after the newest entry the rollup covers per step 5, followed by at most **4** retained one-line entries in the form `<date> — <label> (<anchor>): <what changed about this feature>`. The label is optional context and is never the anchor. Remove all planning and execution narration per `:85`.
5. The rollup covers every entry the retained set does not keep — currently `:42-51`, ten entries — plus any retained entry that failed step 3. **Derive the rollup's `<date>` from the result rather than pinning it in advance: it is the day after the newest entry the rollup covers.** So if the retained set ends up being `:52-55`, the newest rolled entry is dated 2026-10-11 and the rollup reads `before 2026-10-12`; if an entry dated 2026-10-13 is rolled up instead, the rollup reads `before 2026-10-14`. This keeps the rollup's coverage claim literally true and leaves no gap or overlap with the retained set. Deleted entry text remains reachable in git history of this file, which satisfies `:91` **Bootstrap**'s "preserve genuine existing local history".
6. Append to the story a project-owned `## Revision tracking` section, created if absent. Record this delivery truthfully as **pending**: the V2 plugin port, the date, the approval given 2026-10-20, and an explicit statement that its delivering commit does not yet exist. Do not invent a commit SHA, PR number or ticket ID. Per `:89`, this record lives outside the feature log; do not add a `## Change log` entry for this delivery in this phase.
7. Leave the story's `## Persona`, `## Goal`, `## Scenario`, `## Acceptance criteria` marks and `## Resolved decisions` byte-identical. This phase changes only `## Change log` and adds `## Revision tracking`. The story has no `## Proof` and no `## Constraints` section — do not create them and do not cite them.
8. **Verify-or-repair `user-stories/index.md`.** The 11 previously missing rows were added during planning on 2026-10-20 with explicit user confirmation, read verbatim from each story's header block. Verify that every story file present in `user-stories/` is mirrored as exactly one row with `Slug`, `Title`, `Status`, `Epic` and `Affected areas` matching that story's `> **Title:**`, `> **Status:**`, `> **Epic:**` and `> **Affected areas:**` values. Repair only where a value has drifted; invent no value, and report rather than fill an absent header field.
9. Run `Select-String -Path user-stories\mobile-opencode-companion.md -Pattern "^- 20" ` and `Select-String -Path user-stories\mobile-opencode-companion.md -Pattern "^before "`, and confirm the change log renders as one rollup line plus at most 4 entries, each carrying a parenthesized anchor.
10. Run `python3 .opencode/skills/plan-enforce/scripts/validate_plan.py plans/plugin-v2-port-20261020 --stories user-stories` and confirm exit 0 with no `INDEX-MISSING` finding.

## Output

- **Artifact:** `user-stories/mobile-opencode-companion.md`
- **Schema / shape:** `## Change log` holding one rollup line `before <date> — earlier history: see git history for this file`, where `<date>` is the day after the newest entry the rollup covers per step 5 plus at most 4 entries matching `<date> — <label> (<anchor>): <what changed>`, every `<anchor>` verified against the delivering commit; a `## Revision tracking` section recording this delivery as pending with no fabricated anchor; `user-stories/index.md` mirroring every story file with verbatim header metadata.
- **Attribution / identities:** task `T4`; consumed inputs are the pre-phase story content identity and `user-story/references/_consistency-checklist.md:79-92`. Produced content identity is the post-edit hash of each `Writes` path. Relevant review scope: Sentinel 🛡️ (Quality Guardian) over `user-stories/` format and index consistency.
- **Parent handoff:** returns `AWAITING_REVIEW` with task identity `T4`, the changed paths, their content identity, the required Sentinel 🛡️ (Quality Guardian) gate, the verified anchor list with the literal `git show` output establishing each, and current resource-use state. Author completion is not acceptance.

## Verify commands

| Executor | Command |
|---|---|
| Herald 📯 (Release Manager) | `git log --follow --format='%H %ad %s' --date=short -- user-stories/mobile-opencode-companion.md` |
| Herald 📯 (Release Manager) | `git show -s --format='%H %ad %s' --date=short HEAD` |
| Cipher 🔓 (Lead Orchestrator) | `Select-String -Path user-stories\mobile-opencode-companion.md -Pattern "^- 20"` |
| Cipher 🔓 (Lead Orchestrator) | `Select-String -Path user-stories\mobile-opencode-companion.md -Pattern "^before "` |
| Cipher 🔓 (Lead Orchestrator) | `python3 .opencode/skills/plan-enforce/scripts/validate_plan.py plans/plugin-v2-port-20261020 --stories user-stories` |

- Executor authority note: Git is Herald 📯 (Release Manager)'s role, so the anchor-verification commands are declared to Herald 📯 (Release Manager), who runs them read-only and writes nothing. The `git show` row is run **once per retained anchor**, each time passing that anchor's SHA in place of `HEAD` — `HEAD` in the table is the command shape, not a substitute for the per-anchor runs the gate requires. The structural checks are coordinator-owned non-Git checks and run in Cipher 🔓 (Lead Orchestrator)'s shell. `rg` is not on PATH, so these use PowerShell `Select-String`.
- Expected red is never the gate PASS: this phase requires the final compliant shape and verified anchors.

## Gate

- ⬜ `## Change log` holds one rollup line plus at most 4 entries, and every retained entry matches `<date> — <label> (<anchor>): <what changed>`.
- ⬜ Every retained `<anchor>` resolves through `git show` to the commit that **delivered** the described change, per `:83` **Delivery match**; the literal `git show` output is attached to the report. An anchor that does not resolve is a finding and blocks this gate.
- ⬜ The rollup line uses the sanctioned form `before <date> — earlier history: see git history for this file`, where `<date>` is the day after the newest entry the rollup covers per step 5, covers exactly the entries the retained set does not keep, and genuine earlier history remains reachable in git.
- ⬜ `## Revision tracking` records this delivery as **pending** with no fabricated anchor, outside the feature log.
- ⬜ `user-stories/index.md` mirrors every story file with verbatim header metadata and the validator reports no `INDEX-MISSING` finding.
- ⬜ `python3 .opencode/skills/plan-enforce/scripts/validate_plan.py plans/plugin-v2-port-20261020 --stories user-stories` exits 0.
- ⬜ The story's `## Persona`, `## Goal`, `## Scenario`, `## Acceptance criteria` marks and `## Resolved decisions` are byte-identical to their pre-phase state, and no `## Proof` or `## Constraints` section was created.
- ⬜ Sentinel 🛡️ (Quality Guardian) returned `[PASS]` or `[FAIL]` on `user-stories/` format and index consistency; `[UNCERTAIN]` is not acceptable and a `[FAIL]` blocks the gate.
- ⬜ Relevant content/dependencies stayed stable for review and current applicable verdicts are accepted.

## Abort conditions

- Halt if a retained entry cannot be assigned an anchor that `git show` resolves to the delivering commit. Do not invent one. Either drop the entry into the rollup (within this phase's authority) or, if the user's intent was to keep it visible, report `BLOCKED` with the entry text, the candidate commits inspected, and bounded options.
- Halt if Herald 📯 (Release Manager) reports git history unavailable or repository state mutating. Anchor verification cannot proceed on unstable input.
- Halt if keeping an entry would require editing `## Acceptance criteria`, `## Resolved decisions`, `## Persona`, `## Goal` or `## Scenario` — all outside this footprint. Report `BLOCKED` with the exact conflict.
- Halt if the change log would end up with more than 5 one-line entries plus one rollup line, or if an entry would fall between the rollup boundary and the retained set. Report `BLOCKED` with the resulting shape.
- Halt if a story header field needed by the index is absent. Report `BLOCKED` rather than filling it with a guess.
- Stop before any out-of-assignment write/mutation or incompatible access.
