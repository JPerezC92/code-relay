<!-- core:begin -->
# User story — user-story

> **Created:** 2026-10-11
> **Title:** Collaborative user-story definition
> **Status:** active
> **version:** 1.2.0
> **Epic:** plan-governance
> **Affected areas:** `.opencode/skills/user-story/`, `.opencode/skills/plan-enforce/SKILL.md`, `.opencode/skills/plan-enforce/references/_consistency-checklist.md`, `AGENTS.md`, `.opencode/agents/sentinel.md`, `README.md`, `user-stories/`, `knowledge/agents.md`, `distribution-clearance.definition.md`, `distribution-clearance.json`

## Persona

- A maintainer who wants to discuss a new or changed feature, agree on its behavior, keep implementation detail out of the durable contract, and check its relationship to existing features before creating an implementation plan.

## Goal

- **G:** An independently invokable `user-story` skill helps the maintainer create or revise a durable, collision-reviewed feature contract that becomes the behavioral source for implementation planning and stays behavioural under implementation churn.
  - Done when: the skill supports discussion, evidence-backed CREATE/UPDATE selection, complete catalogue review, explicit contract approval, and a handoff to `plan-enforce` without treating approval as implementation evidence or execution authorization; criteria pass the churn test, proof is recorded separately from the promise, and pre-decided restrictions live in labelled Constraints with rationale. Shared stories preserve one authoritative reusable contract and its shared completion status across projects, exclude source-local evidence and history from delivery, and remain coherent with the receiving project's actual story catalogue.

## Scenario

- The maintainer describes a new behavior or a change. The skill reads the story catalogue, recommends the owning story or a new story, discusses persona/outcome/scenarios/acceptance criteria, previews the contract delta, and reports concrete collisions. After the maintainer approves the contract and any collision resolution, the selected story is saved consistently with its index entry. `plan-enforce` then derives its feature goals from an explicitly selected set of those approved criteria.
- A maintainer prepares a shared story for adoption: its approved metadata, persona, goal, scenarios, acceptance criteria and shared completion marks, portable Proof references, and governing constraints form the shared core; source-local operational evidence and history stay in the project region.
- A destination receives a shared story or a revised shared story: its core matches the selected source revision, its project-owned content survives, and its catalogue is reconciled against the story files actually present. Inherited completion is not represented as proof that destination verification ran.
- A proposed shared story depends on another contract: review distinguishes a required behavioural dependency from a historical mention, a proof/tool reference, or shared affected areas. Required dependencies must remain available without importing source-only contracts or weakening the shared rules.

## Acceptance criteria

- ✅ **AC1 — Standalone discussion:** `user-story` can be invoked before any implementation plan exists to create a story or revise an existing one. It owns feature-contract discussion, while `plan-enforce` owns execution planning.
- ✅ **AC2 — Complete catalogue:** Each invocation reconciles `user-stories/index.md` with the actual story files and reads every story body, respecting draft/active/superseded status. Missing or ambiguous catalogue evidence is reported rather than interpreted as absence of a collision.
- ✅ **AC3 — Evidence-backed ownership:** Before writing a contract, the skill presents the relevant existing persona/goals/scenarios and recommends UPDATE, CREATE, or an explicit supersession relationship. Common files alone do not prove duplicate ownership.
- ✅ **AC4 — Semantic collisions:** Validation distinguishes duplicate scenarios, contradictions, extension/supersession, dependencies, and shared affected files. A collision report cites the paired statements and a recommended disposition; unresolved contradictions block contract approval/handoff. Mechanical checks do not substitute for semantic reading.
- ✅ **AC5 — Explicit revision approval:** Discussion can produce an authorized persisted draft, but a draft is not an approved planning contract. An existing approved contract is not silently overwritten while alternatives are discussed. New or revised behavior receives explicit user approval, and approval does not authorize code execution or establish implementation acceptance.
- ✅ **AC6 — Behavioural, proof-separated artifact:** A saved story contains its persona, observable goal, scenarios, behavioural acceptance criteria, a separate Proof section, labelled Constraints with rationale, and matching index metadata. Its criteria state only observable promises at a boundary and survive implementation renames. Its bounded feature Change log supports a story-only revision without inventing a plan. Implementation phases, grants, scheduling, and private coding recipes remain in the plan.
- ✅ **AC7 — Approved planning handoff:** The skill hands the approved story, selected delivery criteria, governing constraints, and dependencies to `plan-enforce`. Remaining legitimate story commitments are preserved. `plan-enforce` owns goal traceability and completion reconciliation; this skill does not create a competing plan-completion policy or archive a plan.
- ✅ **AC8 — Contract drift:** If planning or implementation discovers a needed behavior change, the proposed story delta is discussed, collision-reviewed, and approved before the plan is revised. Private implementation decisions within the approved contract do not require inventing new story behavior.
- ✅ **AC9 — Documentation consistency:** Changes to the story workflow update its skill guidance, template/checklist, orchestrator/reviewer references, and README together. A future change using this workflow identifies and updates its own affected documentation in the same plan.
- ✅ **AC10 — Bounded feature:** The skill does not create implementation plans, change application code, grant execution permissions, split the existing large stories, or rewrite criteria to track implementation renames. It changes other stories only after an explicit approved collision resolution. Read-only mechanical validation uses existing authorized facilities rather than a separate semantic-checker engine.
- ✅ **AC11 — Shared contract ownership:** A distributable shared story carries its approved metadata, persona, goal, scenarios, acceptance criteria and shared completion marks, portable Proof references, and governing constraints in its core region. Source-local operational evidence and release history remain project-owned and are excluded from the delivered core.
- ✅ **AC12 — Shared completion meaning:** A shared criterion's completion mark reports evidence-established delivery of the shared capability. Adoption neither resets that mark nor represents it as destination verification; project-specific verification records remain distinct from shared contract status.
- ✅ **AC13 — Reconciled project catalogue:** After adoption or a shared update, one authoritative project-owned catalogue lists the story files actually present, mirrors their metadata, and preserves local story entries. Source-only stories and their rows are not introduced merely by copying the source catalogue.
- ✅ **AC14 — Dependency-safe delivery:** Before a shared story is cleared for delivery, semantic review establishes that its required behavioural dependencies are available and its promises do not contradict those contracts. Historical mentions, proof/tool references, and common affected areas alone do not require another story to ship. Source-local references never become destination requirements by implication.
- ✅ **AC15 — Revision coherence:** A shared contract revision preserves unchanged criterion identities and explicitly accounts for changed or retired promises, affected Proof references, and cross-story dependencies. Reused completion marks remain evidence-grounded; synchronization alone never resolves a criterion or proves that its supporting references remain valid.
- ✅ **AC16 — Approval before delivery history:** An explicitly approved story revision may be persisted and consumed for planning while its delivery reference is pending, provided approval, unimplemented criteria, and unverified Proof targets remain truthful and pending history is recorded outside the feature log. No delivery is invented; the required matching reference and bounded revision entry must be established before the touching delivery's completion is accepted.

## Proof

- AC1 → `.opencode/skills/user-story/SKILL.md` `## What I do`, `## When to use me`
- AC2 → `.opencode/skills/user-story/SKILL.md` `## Steps` item 1–2 · `## Troubleshooting` "Index and files disagree"
- AC3 → `.opencode/skills/user-story/SKILL.md` `## Steps` item 3 · `## Examples` "Ambiguous ownership"
- AC4 → `.opencode/skills/user-story/SKILL.md` `## Steps` item 6 · `### Collision report shape`
- AC5 → `.opencode/skills/user-story/SKILL.md` `## Steps` item 5, 7 · `### Draft versus approved`
- AC6 → `.opencode/skills/user-story/references/_template-user-story.md` section order · `.opencode/skills/user-story/references/_consistency-checklist.md` `## Behaviour / proof separation`, `## Constraints`
- AC7 → `.opencode/skills/user-story/SKILL.md` `## Steps` item 9 · `.opencode/skills/plan-enforce/SKILL.md` `### Planning input — approved story and selected criteria`
- AC8 → `.opencode/skills/user-story/SKILL.md` `## Steps` item 5–7 · `.opencode/skills/plan-enforce/SKILL.md` `### Goal lifecycle` drift watch
- AC9 → `.opencode/skills/user-story/SKILL.md` `## Key paths` · `.opencode/agents/sentinel.md` `#### Audit Scope` and `##### Story-audit checks (report-only)`
- AC10 → `.opencode/skills/user-story/SKILL.md` `## Boundaries`
- AC11 → `.opencode/skills/user-story/references/_template-user-story.md` generated core/project skeleton · `.opencode/skills/user-story/references/_consistency-checklist.md` `## Ownership and transport` · shared capability delivered; local verification in project Revision tracking
- AC12 → `knowledge/agents.md` `### Core and project ownership (HARD RULE)` · `.opencode/skills/user-story/references/_consistency-checklist.md` `## Ownership and transport` · shared capability delivered; local verification in project Revision tracking
- AC13 → `.opencode/skills/user-story/SKILL.md` `## Steps` catalogue reconciliation · `.opencode/skills/user-story/references/_consistency-checklist.md` `## Destination reconciliation` · shared capability delivered; local verification in project Revision tracking
- AC14 → `.opencode/skills/user-story/SKILL.md` `### Collision report shape` · `.opencode/skills/user-story/references/_consistency-checklist.md` `## Shared revisions and delivery dependencies` · shared capability delivered; local verification in project Revision tracking
- AC15 → `.opencode/skills/user-story/references/_consistency-checklist.md` `## Shared revisions and delivery dependencies` · `.opencode/skills/plan-enforce/references/_lifecycle-contract.md` `### Story ownership and current evidence` · shared capability delivered; local verification in project Revision tracking
- AC16 → `.opencode/skills/user-story/references/_consistency-checklist.md` `### Staged persistence and history finalization` · `.opencode/skills/plan-enforce/references/_lifecycle-contract.md` `### History finalization gate` · shared capability delivered; local verification in project Revision tracking

## Constraints

- Story definition is a standalone `user-story` skill that owns the canonical story template and the story-hygiene checklist — because feature behavior must be settleable before execution planning, and the artefact format is part of that contract rather than a planning concern.
- A plan delivers an explicit approved criterion scope rather than an entire story — because stories outlive plans, and commitments the plan did not select must survive a partial delivery.
- A full-catalogue review does not authorize bulk rewriting or story splitting — because shared affected files never prove duplicate ownership, and bulk edits destroy contract history.
- A plan that includes a nonconforming file must carry that file's necessary rework, tests, and documentation — because existing noncompliance is neither grandfathered nor grounds for a partial fix, and unrelated repository-wide migrations are not implied.
- Criteria state promises and proof is recorded separately — because an implementation rename must never rewrite the behavioural contract.
- `## Constraints` are respected, never delivered — because a pre-decided restriction is not a delivery obligation and is never ticked.
- A destination cannot override or locally rewrite an inherited shared contract; project-specific requirements must preserve its shared rules and receive the existing ownership, collision, and approval review — because core is the shared source of truth rather than a destination-editable copy.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
