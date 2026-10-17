# User story — generated-story template

This reference is transported as a whole raw file. The fenced skeleton below illustrates
the generated story's ownership; its literal markers are not active regions governing
this reference. Render the skeleton without its outer fence, replace placeholders,
and remove instructional comments. For a shared story, keep one contiguous core from
H1/shared metadata through Constraints. For source-only or genuinely local stories,
apply the classification guide rather than clearing them for delivery by proximity.

Source project sections never seed a destination. Fresh region enrollment creates an
empty project region; initialize local sections there during reconciliation. An empty
Change log is valid on receipt: do not invent a dated adoption or delivery event.
Use Revision tracking only when applicable, following the consistency checklist's
staged-persistence rules. No local section overrides the shared contract or its marks.

````markdown
<!-- core:begin -->
# User story — <feature-slug>

> **Created:** YYYY-MM-DD
> **Title:** <short human title — mirrors the `title` column in `user-stories/index.md`>
> **Status:** <draft | active | superseded — mirrors the `status` column in `user-stories/index.md`>
> **version:** 1.0.0
> **Epic:** <epic-slug> (optional — leave empty when no epic)
> **Affected areas:** <matching handle, e.g. `src/`, `.opencode/skills/user-story/`, a backend tooling path>

<!-- Status vocabulary: `draft` is work in progress and is NOT an approved planning contract;
     `active` is the approved contract `plan-enforce` derives goals from;
     `superseded` is retained history replaced by another story. Approval is a behavioral
     contract only — it is not implementation evidence, a permission grant, or execution authorization. -->

## Persona

> Who is the feature for? One actor, with their role in context.

- <persona, e.g. "an analyst who triages support tickets">

## Goal

> What must be true when this feature is done — the observable condition, not the activity.

- **G:** <goal>
  - Done when: <observable condition>

## Scenario

> The concrete situation the persona is in and the behavior the feature must provide.

- <scenario — trigger, action, result>

## Acceptance criteria

<!-- Churn test (write-time, mandatory): if a criterion would need rewording when the
     implementation changes, rewrite it as observable behaviour or move it to
     `## Constraints`. Internal symbols, module paths, function signatures, test class
     names, and file inventories never appear here.

     Each criterion is self-contained and observable at a boundary (CLI output, file
     bytes, API response, screen, ops log) without reading code or internal state.
     It states the promise only. Where the promise is demonstrated belongs in `## Proof`.

     The churn test binds every criterion a plan writes or materially changes.
     Criteria untouched by a plan are grandfathered until that story is next revised.

     Every criterion carries a resolvable `AC<n>` id in positional order, so `## Proof`
     can reference it. The id is mandatory; a short name after an em dash is optional:
     `- ⬜ **AC1 — <optional name>:** <criterion>`.

     Reconciliation (approved-criteria scope, fail-closed): at plan completion only the criteria the plan
     selected to deliver, materially changed, or regressed are reconciled.
     ✅ = evidence-established, resolved through the story's `## Proof` section
     ❌ = explicitly unmet — blocks the touching plan's completion until satisfied or removed
     ⬜ = an unfulfilled legitimate commitment; if unselected it does not block completion
     Out-of-scope work is removed through approved revision handling (not left unchecked)
     and recorded in the change log. These write dispositions apply only at the authorized
     contract owner. A destination never edits inherited core: record current-plan evidence
     and outcomes in project. Preserve evidence-grounded shared marks on adoption, but never
     claim they prove destination verification. Synchronization alone neither resolves a
     criterion nor validates Proof. Approved revisions account for changed/retired promises
     and any positional remapping; do not silently renumber unchanged criteria.
     Release events (PR opened/reviewed/merged) are not acceptance criteria; actual events
     belong in project history. Missing matching history blocks completion, not approved
     staged persistence; apply the checklist and mandatory planning lifecycle. -->

- ⬜ **AC1 — <optional name>:** <criterion 1>
- ⬜ **AC2:** <criterion 2>

## Proof

<!-- Where each criterion is demonstrated. Proof may go stale without invalidating the
     contract: a rename or refactor updates this section only. Each line is
     <AC-id> → <section or symbol> · <command/verdict>, and every AC id used here
     resolves to exactly one criterion above. The count of proof lines equals the
     count of criteria.
     Proof never states a requirement and never sets a criterion's status.
     Shared Proof uses resolvable portable paths plus sections/symbols, not source-only
     runs, dated audits, grants, history anchors, or temporal output. Keep such observations
     in Local evidence below, keyed by existing AC ids; do not duplicate canonical Proof.
     A future target is explicitly pending/unverified, never an asserted passing verdict. -->

- AC1 → <section or symbol> · <command/verdict>
- AC2 → <section or symbol> · <command/verdict>

## Constraints

<!-- Pre-decided restrictions the plan must RESPECT, never deliver. Each entry carries
     its rationale in the form `— because <reason>`. Bounded to the currently governing
     set; superseded constraints are removed (git history retains them).
     Plan-execution and scheduling notes are not constraints.
     Example: - pytest is the single test runner — because one reviewed runner keeps the
     executor grant and the command literal from drifting. -->

- <restriction> — because <reason>

<!-- core:end -->

<!-- project:begin -->
## Local evidence

<!-- Optional: record actual source-local or destination-local execution evidence,
     outcomes, and genuine local requirements here. Key evidence to existing AC ids
     where relevant, but do not create a competing shared-completion table or Proof.
     Local requirements require ownership/collision/approval review and preserve core.
     Never describe inherited marks as a local run or add a run that did not occur. -->

## Revision tracking

<!-- Optional: record truthful local approval evidence and an approved revision's known
     pending delivery-history reference here, outside the feature Change log and core.
     State what remains unimplemented or unverified; do not invent an anchor or delivery.
     Approved staged persistence/planning is allowed; completion, Outcome, archival, and
     release handoff wait for the actual matching reference and compliant log entry.
     Resolve pending tracking when finalized; retain truthful approval evidence as needed. -->

## Change log

<!-- Bounded, newest last: at most 5 one-line entries, each
     - YYYY-MM-DD — <label> (<anchor>): <what changed about this feature>

     <anchor> is REQUIRED and must resolve to a commit SHA (git history), a PR number,
     or a ticket ID. `plans/` and `output/` are TEMPORAL and are never the anchor — a
     plan folder is untracked and dies with the machine. The label is optional human
     context: the plan slug when one governed the work, otherwise the literal
     `story revision`. A plan slug is never invented.
     - YYYY-MM-DD — <plan-slug> (PR #NN): <what changed about this feature>
     - YYYY-MM-DD — story revision (PR #NN): <what changed about this feature>

     plus at most one rollup line once older entries are dropped:
     - before YYYY-MM-DD — earlier history: see git history for this file
     Process/execution narration (planning-only status, phase/gate results, counts) is NOT a change-log entry.
     The anchor must match the described delivery and its chronology, not merely touch the file.
     An entry is required for a touching delivery before its completion is accepted,
     not at approved staged persistence while the matching reference is explicitly pending.
     Empty local history on fresh adoption needs no fabricated receipt entry. -->
<!-- project:end -->
````
