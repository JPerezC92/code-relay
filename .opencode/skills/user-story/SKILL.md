---
name: user-story
description: Define, revise, and collision-review durable user-story contracts before implementation planning. Reconciles catalogues, shared ownership and dependencies, discusses behavioural criteria, records approval with truthful pending history when needed, and hands selected criteria to plan-enforce. Use when defining or modifying a story, checking collisions, preparing shared-story delivery or adoption, or settling feature behaviour before planning.
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 1.3.0
---
<!-- core:begin -->

## What I do

Own the pre-plan feature contract. I create or revise a durable user story that states a feature's persona, observable goal, scenarios, and acceptance criteria; verify it against the whole story catalogue for semantic collisions; obtain explicit approval; and hand the approved story and its selected criteria to `plan-enforce`.

I settle **what the feature is** — never **how or when it is built**. Approval here is a behavioral contract, not a plan, permission grant, or authorization to execute code.

## When to use me

- A new feature's behavior must be defined before implementation planning.
- An existing story must be revised, superseded, or extended.
- A shared story needs ownership, dependency, or destination-catalogue reconciliation before delivery.
- Story ownership is ambiguous and possible collisions must be checked.
- Trigger keywords: "define a feature story", "modify an existing story", "check story collisions".

## Key paths

- Catalogue index: `user-stories/index.md`
- Story files: `user-stories/<feature-slug>.md`
- Canonical story template: `references/_template-user-story.md`
- Consistency checklist: `references/_consistency-checklist.md`
- Classification guide (what belongs in a contract): `references/_classification-guide.md`
- Handoff consumer: `.opencode/skills/plan-enforce/SKILL.md` (`### User stories`)

## Steps

1. **Reconcile the catalogue.** Enumerate `user-stories/*.md` and reconcile against `user-stories/index.md`. Every story file must appear in the index and every index row must resolve to a file. Report missing files, orphaned rows, or `Title`/`Status`/`Epic`/`Affected areas` mismatches — never interpret missing or ambiguous catalogue evidence as absence of a collision.
2. **Read every story body.** Read the whole catalogue before judging ownership; when it is large, use the index to filter by epic and affected areas, then read every candidate body in full. Respect each story's status — `draft`, `active`, `superseded`. A `draft` is in-progress discussion, not an approved contract.
3. **Present ownership choices.** Before writing anything, present the relevant existing persona/goals/scenarios as evidence and recommend one of:
   - **UPDATE** — revise the story that already owns the feature.
   - **rename / supersession** — the feature replaces, or is replaced by, another story; record the relationship explicitly.
   - **CREATE** — no story owns the feature.

   Wait for the user's explicit choice via the `question` tool. Shared affected files alone never prove duplicate ownership.
4. **Discuss the contract.** Work through persona, observable goal, scenarios, and acceptance criteria with the user. Each criterion is self-contained and observable; name its proving surface separately in Proof, by section or symbol.
5. **Preview the delta.** Show fields and promises added, changed, or retired before writing; preserve unchanged criterion identities and account for affected Proof and dependencies. Apply the checklist's **Shared revisions and delivery dependencies** procedure. The user may authorize a persisted **draft**; a draft is not an approved planning contract.
6. **Run semantic collision analysis** against the whole catalogue: duplicate scenarios, contradictions, extension/supersession, dependencies, and shared affected areas. Report paired statements and a recommended disposition. For shared delivery, distinguish required behavioural dependencies from history, proof/tool references, and common files; verify required contracts are available and coherent without importing source-only stories. Unresolved contradictions block approval and handoff. Read the stories — a keyword scan is not sufficient.
7. **Obtain explicit approval.** Ask for approval only after the collision review reports no unresolved contradiction. Approval establishes the contract; it does not establish implementation acceptance, grant permissions, or authorize execution. An existing approved contract is never silently overwritten while alternatives are discussed.
8. **Persist and mirror.** Read `references/_consistency-checklist.md` in full and use the canonical template. Apply its **Ownership and transport**, **Destination reconciliation**, and **Bounded change log** (including staged persistence) procedures. Keep shared requirements and marks in core; keep local records in project. An explicitly approved revision may be persisted with truthful pending history outside the feature log; the matching reference and compliant entry remain mandatory before completion. Mirror `Title`/`Status`/`Epic`/`Affected areas` into the project's own index.
9. **Hand off to `plan-enforce`.** Provide the approved story, selected criteria, Constraints, dependencies, ownership, and any pending history. Preserve unselected legitimate commitments and evidence-grounded existing marks; new unimplemented commitments remain `⬜`. `plan-enforce` owns completion reconciliation and the final history gate — I never archive a plan or treat inherited marks as local execution evidence.

### Contract fields

- **Persona** — one actor, with their role in context.
- **Goal** — an observable condition, with a `Done when:` criterion.
- **Scenario** — trigger, action, result.
- **Acceptance criteria** — self-contained observable conditions at a boundary; they pass the churn test and carry no internal symbols, module paths, function signatures, test class names, or file inventories. No plan-only goal, temporal `plans/`/`output/` path, volatile test count, or superseded version.
- **Proof** — one canonical entry per positional criterion (`<AC-id> → <section or symbol> · <command/verdict>`). Shared pointers must resolve to portable proving surfaces; planned targets are identified as unverified, never passing. Local runs and verdicts belong in project-owned evidence, not shared Proof. Proof may go stale without invalidating the promise, but stale Proof cannot justify retaining a mark without review.
- **Change log** — project-owned, bounded to 5 recent one-line entries plus an optional rollup. Each actual entry needs a real delivery-matching commit SHA, PR number, or ticket ID; label it with the governing plan slug or `story revision`, never an invented plan. For staged persistence and empty adoption history, apply the full checklist rather than fabricating an entry.
- **Constraints** — pre-decided restrictions the plan must respect, never deliver; each carries `— because <reason>`. `## Resolved decisions` is retired and is not written.

### Draft versus approved

| State | Meaning | Consumed by `plan-enforce`? |
|---|---|---|
| `draft` | Work in progress; discussion may still change it | No |
| `active` | The approved contract | Yes |
| `superseded` | Retained history replaced by another story | No |

A `draft` may be persisted without approval. Only an explicitly approved (`active`) story is a planning contract.

### Shared and project-owned contracts

Classify by meaning using `references/_classification-guide.md`: a shared story has one core from H1/shared metadata through Constraints, including shared completion marks and portable Proof. Source-only stories are not automatically deliverable. Local requirements, approval records, operational evidence, revision tracking, and feature history remain project-owned and cannot override core. Apply the full checklist before authoring or accepting a received story; synchronization neither approves behaviour nor establishes destination verification.

### Collision report shape

For each finding: the type (duplicate scenario / contradiction / extension / supersession / dependency / shared affected area), the two paired statements with their story slugs, the concrete conflict, and a recommended disposition. Block on unresolved contradictions.

## Boundaries

- I do not create implementation plans, edit application code, grant permissions, or split existing stories.
- I change another story only after an explicit approved collision resolution; a full-catalogue review does not authorize bulk rewriting.
- A persisted draft is not an approved planning contract.
- Approval is not implementation evidence or execution authorization.
- Semantic collisions require reading the stories, not a keyword scan; read-only mechanical validation reuses existing authorized facilities rather than a separate checker engine.

## Examples

**New feature.** The user says "I want a feature that drafts release notes." I reconcile `user-stories/index.md`, read every body, find no owner, recommend CREATE with the candidate list, discuss persona/goal/scenarios/criteria, run collision analysis, obtain approval, write `user-stories/release-notes.md`, mirror the index, and hand the selected criteria to `plan-enforce`.

**Existing feature.** The user asks for supersession support. I recommend UPDATE, preview the contract delta, check collisions, and obtain approval. With no delivery-matching reference yet, I persist truthful approval and pending history in project-owned Revision tracking, leaving new criteria and Proof unverified. Only actual delivery with a matching reference permits the bounded `story revision` entry and completion handoff.

**Received shared story.** I preserve its inherited marks and core bytes, initialize an empty local Change log if needed, retain genuine local evidence, remove displaced duplicate contract text from project, and reconcile the single project-owned index. Receipt creates no delivery event or local test result.

**Ambiguous ownership.** Two active stories share an affected area. I present both personas/goals/scenarios as evidence, report whether they are a duplicate or a genuine extension, and wait for the user's UPDATE / rename / CREATE decision before writing.

## Troubleshooting

- **Index and files disagree:** report the mismatch as catalogue drift and resolve it before ownership analysis; never assume a missing row means no collision.
- **User wants a plan now:** route to `plan-enforce` only after the contract is approved; a draft is not a planning input.
- **Collision found but user wants to proceed:** stop; an unresolved contradiction blocks approval and handoff until the user resolves it (merge, supersede, or narrow scope).
- **Tempted to auto-check criteria:** don't; criterion disposition is semantic, evidence-to-checkbox analysis performed at plan completion, never auto-checked here.
- **History reference unavailable:** record the approved revision's pending state outside the feature log; preparation may proceed, but completion, Outcome, archival, and release handoff wait for the real matching reference. Never create Git or external artifacts without separate authorization.
<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
