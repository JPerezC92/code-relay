# User story — consistency checklist

> Canonical format and hygiene contract for files at `user-stories/*.md`. Owned by the
> `user-story` skill. Applied at write-time by that skill's post-write self-verification
> loop and executed as semantic review by Sentinel 🛡️ (Quality Guardian). The mechanical
> subset (`index mirroring`) is enforced by `plan-enforce`'s `scripts/validate_plan.py`,
> which validates its own story inputs and does not own this contract.
>
> Plan, phase, audit, and completion artifacts are governed by
> `.opencode/skills/plan-enforce/references/_consistency-checklist.md`.
> Ticket working artifacts are governed by
> `.opencode/skills/ticket-runbook/references/_consistency-checklist.md`.

## Catalogue

- `user-stories/index.md` exists and lists every feature file.
- Every story file appears in the index and every index row resolves to a file.
- Each story's `Title`, `Status`, `Epic`, and `Affected areas` mirror the corresponding `index.md` columns.
- No unfilled `<...>`, `TODO`, or `TBD` placeholders.
- A touching delivery has a compliant dated `## Change log` entry before completion is accepted. Approved staged persistence and fresh-adoption initialization follow **Bounded change log** below; neither requires a fabricated delivery entry.

## Ownership

- Story creation and ownership decisions belong to the `user-story` skill: CREATE of a new story file is forbidden until that skill has reconciled `user-stories/index.md` with the files, read every candidate body, presented grounded UPDATE / rename / CREATE / supersession choices, and received an explicit user choice. `plan-enforce` consumes an approved story and never renegotiates the story choice.
- Approved vs draft: only an approved (`active`) story is a planning contract; a `draft` is in-progress discussion and is not consumed by `plan-enforce`. Approval establishes feature behavior only — it is not implementation evidence, a permission grant, or execution authorization.

## Ownership and transport

- Classify by meaning under `knowledge/agents.md` **Core and project ownership (HARD RULE)** and the classification guide. Shared contracts, source-only stories, and genuine local requirements are distinct; location or shared affected areas alone never supplies clearance.
- A shared story has one ordered core pair beginning before H1/shared metadata and ending after `## Constraints`. Its approved metadata, Persona, Goal, Scenario, criteria and shared marks, portable Proof, and governing Constraints remain together in core. Keep source and destination operational evidence, local approval records, revision tracking, and Change log in project, excluded from the delivered core.
- Shared `✅` means evidence-established delivery of the shared capability, not execution in every destination. Adoption preserves that mark rather than resetting it; synchronization itself proves neither capability delivery nor current Proof validity. Never invent destination verification from inherited status.
- Revise shared core only at its authorized source and distribute it through the existing region workflow. Destination local requirements and evidence remain project-owned, receive existing ownership/collision/approval review, and never weaken, replace, or locally rewrite core. No local completion overlay or duplicate shared status model is introduced.
- The canonical template remains a raw reference. Its generated-story markers are fenced literals, not the reference's own active regions. Use an outer fence longer than every illustrated inner fence; four backticks enclose triple-backtick examples.

## Shared revisions and delivery dependencies

- Preview and explicitly approve semantic revisions. Preserve unchanged criterion identities; account for every changed or retired promise, affected Proof entry, metadata mirror, and cross-story dependency. Keep positional `AC<n>` ids; if an approved removal requires positional remapping, expose the old-to-new mapping and update all affected references rather than silently reusing an identity for another promise.
- Before retaining an existing completion mark on a revised shared contract, read the current proving surface and relevant evidence, check that the promise is unchanged or still satisfied, and examine affected dependencies/regressions. Approval or synchronization alone is insufficient; stale or falsely checked marks are findings, not auto-fix opportunities. Do not blanket-reset unrelated marks or treat an unimplemented addition as delivered.
- Before clearing shared delivery, review required behavioural dependencies for availability and compatibility. Cite the paired promises and establish that each required contract is present in the applicable delivered set or independently available through a verified portable contract. History, source observations, tool/Proof references, and common affected areas do not by themselves require another story to ship.
- Resolve source-only dependencies explicitly: retain local history locally, use an independently meaningful portable proving surface, or return an unresolved required-contract blocker to the owner. Never imply that a source-only story became a destination requirement or silently broaden the approved contract.

## Destination reconciliation

1. Read the pinned source contract, destination story, bindings/reconciliation report, and actual local catalogue before accepting adoption or an update. Use the existing synchronization workflow; do not copy the source index or source project sections.
2. Preserve inherited core and genuine project-owned content. Markerless enrollment may displace the entire old story body into project: remove duplicate shared H1/metadata, Persona/Goal/Scenario/criteria/Proof/Constraints there, retaining genuine local requirements, evidence, and truthful local history. Resolve contradictions through ownership and approval review, never by changing protected core.
3. Initialize project-local sections as needed, including an empty `## Change log` for fresh receipt. Do not copy source-local runs/history or invent a receipt event, local passing verdict, or delivery anchor. Keep local evidence distinct from the single shared Proof section.
4. Reconcile one authoritative project-owned `user-stories/index.md` against all actual story files, preserving local entries and mirroring shared metadata from core. Remove displaced duplicate metadata and catalogue tables; missing or ambiguous evidence blocks acceptance rather than proving no collision. Source-only stories/rows are not introduced by copying the source catalogue.
5. Clear synchronization reconciliation state only after genuine local reconciliation; the existing `core-sync check` must succeed before enrollment is accepted. This procedure supplies no new command, destination-write, or release authorization.

## Behaviour / proof separation

- **Churn test (mandatory for every criterion a plan writes or materially changes):** if a criterion would need rewording when the implementation changes, it is rewritten as observable behaviour or moved to `## Constraints`. Internal symbols, module paths, function signatures, test class names, and file inventories never appear in `## Acceptance criteria`. Criteria untouched by a plan are grandfathered until that story is next revised.
- Each criterion is self-contained and observable at a boundary (CLI output, file bytes, API response, screen, ops log) without reading code or internal state.
- **AC-id resolution:** every criterion carries a resolvable `AC<n>` id in positional order, and every `AC<n>` referenced in `## Proof` resolves to exactly one criterion. The count of `## Proof` lines equals the count of criteria. A proof reference with no matching criterion is a finding.
- `## Proof` is present with exactly one canonical entry per criterion (`<AC-id> → <section or symbol> · <command/verdict>`). Shared entries identify resolvable portable paths and sections/symbols; source-only run results, dated verdicts, grants, and release history remain in differently named project evidence keyed to the existing ids. Pending proving targets are explicitly unverified, never passing. Proof never states a requirement or sets status. A rename updates Proof, not the promise; stale Proof cannot establish completion or justify a reused mark without current evidence review.
- A `file:line` citation is resolved to a section or symbol name and lives in `## Proof`, never in the criterion text.

## Constraints

- `## Constraints` holds only currently governing pre-decided restrictions the plan must RESPECT, never deliver. Each entry carries its rationale in the form `— because <reason>`.
- Plan-execution, scheduling, and superseded constraints are absent; git history retains them.
- `## Resolved decisions` is retired — it is not written. Governing restrictions and their rationale live in `## Constraints`.

## Story hygiene (auditor checks, Sentinel-executed; the validator does not parse a checklist)

- An acceptance criterion or Goal `Done when:` must not depend on a plan-only goal or a temporal `plans/`/`output/` path (a genuine feature-input path is allowed).
- It must not pin a volatile test count (`N passed`, `N tests`) or cite a superseded spec version, and must not number a surface unless that version is the requirement (including a surface whose version the touching plan itself bumps).

## Approved-criteria completion scope (fail-closed)

- A plan that touches a story reconciles only the acceptance criteria it committed to deliver, the criteria it materially changed, and any regression it introduced.
- At the authorized contract owner, each reconciled criterion is `✅` (evidence-established **as resolved through the story's `## Proof` section**) or removed through approved scope/revision handling with a change-log entry; `❌` (explicitly unmet) blocks completion until satisfied or appropriately removed. Shared source work reconciles shared criteria at source; genuine local contracts are reconciled by their local owner.
- Destination work never edits inherited criteria, marks, or Proof to complete a plan. It records its own selected-scope outcomes/evidence in project-owned content and proves materially changed behaviour and relevant regressions on the current snapshot. An inherited `✅` alone cannot pass that gate. A needed shared change routes through approved source revision/synchronization; a distinct local requirement follows ownership/collision/approval review without weakening core.
- Remaining legitimate unfulfilled commitments the plan did not select stay `⬜` and do not block completion; evidence-grounded existing shared marks are preserved, not reset.
- Release events (PR opened/reviewed/merged) are not acceptance criteria; actual events live in the change log and PR history.
- Completion confirms the plan **respected** every `## Constraints` entry. Constraints are never delivered and never ticked.
- This is semantic analysis (evidence-to-checkbox truth), never mechanical auto-checking.

## Bounded change log

- `## Change log` has at most 5 one-line entries (`<date> — <label> (<anchor>): <what changed about this feature>`) plus at most one rollup line (`before <date> — earlier history: see git history for this file`).
- **Durable anchor (mandatory):** every entry carries an `<anchor>` that resolves to a commit SHA (git history), a PR number, or a ticket ID. A temporal `plans/` or `output/` path is never the anchor — those are untracked and machine-local. An entry whose anchor does not resolve is a finding.
- **Delivery match:** the anchor must be the commit/PR that **delivered the described change**, not merely any commit that touched the file. A plan's own `Shipped:` metadata can be a dependency reference rather than its release target — verify against the commit/PR contents and dates before trusting it.
- A story-only revision records `story revision` in place of a plan slug; a plan slug is never invented. The label is optional context and is never the traceability anchor.
- No planning-only or execution narration.

### Staged persistence and history finalization

- **Approved staged persistence:** when explicit approval exists but no matching delivery reference exists yet, persist truthful approval evidence and known pending history in project-owned `## Revision tracking`, outside the feature log and shipped core. Leave unimplemented criteria pending and unverified Proof targets identified as such. An `active` approved contract may feed planning; approval never asserts delivery, a passing verdict, or execution authorization.
- **Finalization:** before accepting the touching delivery's completion, Outcome, archival, or release handoff, establish the actual matching durable reference and compliant bounded revision entry; verify contents and chronology, then resolve pending tracking. A missing, nonresolving, or nonmatching reference blocks finalization. Do not borrow an older unrelated anchor, manufacture a future PR/commit/ticket, or mark pending history complete merely because implementation checks pass.
- **Bootstrap:** a freshly received shared story may start with an empty project-local Change log because receipt alone is not a feature-delivery event. Preserve genuine existing local history; source history never seeds it. Actual local deliveries still require compliant matching entries.
- Apply the mandatory planning lifecycle for finalization sequencing. Authorization to create a Git or external tracking artifact remains separate; pending history does not authorize an issue, commit, branch, PR, or release, and does not change completion/archive-before-release or user-only merge rules.

## Authority

Analysis items (everything above) are the `user-story` skill's responsibility — a value must match evidence, never be invented to satisfy a check. `plan-enforce`'s `scripts/validate_plan.py` enforces only index mirroring here; it is a helper, not the authority. Criterion wording, proof quality, and constraint judgement are semantic, never mechanical.
