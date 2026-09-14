# User story — aicore-adoption-sync

> **Created:** 2026-09-14
> **Title:** AICore adoption synchronization
> **Status:** active
> **Epic:** core-governance
> **Affected areas:** `.aicore/`, `AGENTS.md`, `.opencode/`, `knowledge/`, `plans/`, `user-stories/`

## Persona

- A CodeRelay maintainer who needs current shared agent tooling without losing CodeRelay's project identity or destination-owned adaptations.

## Goal

- **G:** Keep CodeRelay's complete applicable AICore adoption current at one trusted revision while preserving destination-only runtime identity and reviewed local differences.
  - Done when: all changed mirrors converge, the active root names only CodeRelay, source provenance lives only in `.aicore` controls, and the generated atomic lock passes compliance with no partial or mixed revision.

## Scenario

- A new AICore release changes some applicable units; the maintainer copies changed mirrors, incorporates reviewed adapted updates, keeps CodeRelay's active root free of upstream identity, regenerates one lock for the full applicable set, and verifies compliance before release.

## Acceptance criteria

- ✅ The changed `git-pr`, `op-model`, and Warden 🔒 (Dependency Warden) spec members are byte-identical to AICore `ba2e89182bf1c95b36c09effdb6ef6d7088e8d6f`; all unchanged units are not needlessly rewritten. Evidence: `cmp -s` rc=0 for all four members against AICore `ba2e891`; the atomic lock advanced unchanged units without rewriting them.
- ✅ `AGENTS.md` identifies only CodeRelay: `Project identity: CodeRelay`, ancestor `Spec version: 2.2.0`, `Local version: 1.0.2`, and no AICore identity, repository, management-tool, reuse-guide, provenance, or lineage references. Evidence: `AGENTS.md:2-4` markers; forbidden-reference grep no matches; `## Upstream lineage` and provenance marker removed; Sentinel 🛡️ (Quality Guardian) `[PASS]`.
- ✅ `.aicore/adoption.yaml` unit mappings stay unchanged; `.aicore/adoption-review.yaml` records `applied` for `sentinel` and `root-runtime-spec` only; destination-owned story/index files remain outside the `user-stories/.gitkeep` mirror mapping. Evidence: empty declaration diff; review `decisions` has exactly those two `applied` rows.
- ✅ A generated schema-v2 lock accepts only `ba2e89182bf1c95b36c09effdb6ef6d7088e8d6f`, accounts for every catalog unit, and `sync-aicore-adoption check --adopter-index` exits 0 with `compliance: true` and no `policy_violation`. Evidence: `propose-lock` exit 0 with byte-identical candidate; `check --adopter-index` exit 0, `compliance: true`, accepted_revision == required_revision == `ba2e891`, 28 current + 7 not_applicable.
- ✅ Vault 🔐 (Catalog Steward), Sentinel 🛡️ (Quality Guardian), and plan/story validation pass on the final destination content; no dependency, test, application, commit, PR, or merge scope is inferred by synchronization. Evidence: Vault 🔐 (Catalog Steward) `[PASS]` (four members byte-identical, no management-tool copy), Sentinel 🛡️ (Quality Guardian) `[PASS]`, plan validator exit 0.

## Change log

- 2026-09-14 — code-relay-aicore-ba2e891-20260914: completed the sync to AICore `ba2e891` — destination-only root at ancestor spec `2.2.0` / local `1.0.2`, Sentinel `1.4.0` with SP-10, review decisions for `sentinel` and `root-runtime-spec`, and a regenerated lock passing compliance; all criteria verified.
- 2026-09-14 — code-relay-aicore-ba2e891-20260914: superseded runtime-visible provenance; destination-only root at ancestor spec `2.2.0` / local `1.0.2`, review decisions for `sentinel` and `root-runtime-spec`, and lock advance to `ba2e891` are now the pending criteria.
- 2026-09-14 — code-relay-aicore-sync-20260914: created the durable destination adoption-sync definition and planned the atomic advance from `f6d02d7` to `71e988a`; criteria remain pending during plan creation.
- 2026-09-14 — code-relay-aicore-sync-20260914: advanced the applicable set to `71e988a` (four byte-identical mirrors, destination-facing root identity at local version `1.0.1`), regenerated the atomic lock, and proved `compliance: true`; all criteria verified.
- 2026-09-14 — code-relay-aicore-sync-20260914: reopened to reduce the root `## Upstream lineage` section to the contract-minimal statement; installer, stack-adaptation, token-substitution, adopter-registry, and verbose version-lifecycle prose removed; lock regenerated for the corrected `AGENTS.md`.

## Resolved decisions

- 2026-09-14 — Runtime-visible AICore provenance is superseded: CodeRelay `AGENTS.md` identifies only CodeRelay; `.aicore` declaration/lock metadata remains the source-identity record.
- 2026-09-14 — CodeRelay keeps one destination adoption story; imported mirror fixes remain upstream-owned and are not redefined as destination product features.
- 2026-09-14 — The catalog maps only `user-stories/.gitkeep`, so this index/story pair is destination-owned content and does not change the `user-stories` unit's mirror mode or mapping.
