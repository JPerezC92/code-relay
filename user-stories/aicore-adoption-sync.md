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

- ✅ The changed applicable mirrors — the six changed `plan-enforce` members, the herald spec, and `knowledge/problems.md` — are byte-identical to AICore `549335a34653148b49bd6be348ea618b10585387`, and no unchanged member (including `knowledge/debt.md` and the two unchanged plan-enforce reference files) is rewritten. Evidence: pinned-object `cmp` loop printed an `OK` line per file (eight, phase 1) plus two for the unchanged reference members (phase 2); `git diff --name-only` listed exactly the plan manifest paths.
- ✅ The adapted `knowledge/agents.md` is preserved byte-for-byte with a `declined` review decision citing `ticket_system: false`; the `sentinel` and `root-runtime-spec` `applied` decisions are retained and the stale two-decision comment is corrected. Evidence: `knowledge/agents.md` absent from the diff list; `grep -c "unit: knowledge-agents"` printed 1; Sentinel 🛡️ (Quality Guardian) `[PASS]` confirmed both historical decisions verbatim.
- ✅ `.aicore/adoption.yaml`, `AGENTS.md`, `opencode.jsonc`, and `.gitignore` remain unchanged. Evidence: none of the four paths appear in `git diff --name-only`.
- ✅ The regenerated schema-v2 lock accepts only `549335a34653148b49bd6be348ea618b10585387` and `sync-aicore-adoption check --adopter-index` exits 0 with `compliance: true` and no `policy_violation` (28 current + 7 not_applicable). Evidence: `propose-lock` exit 0 with the lock `cmp`-identical to its stdout candidate; `check --adopter-index --format json` exit 0, `compliance: true`, accepted == required == `549335a`, dispositions 28 current + 7 not_applicable, blocking none.
- ✅ Bastion, Crucible, Sentinel, Warden (limited no-dependency scope), and Vault audits pass; `test_validate_plan.py` and `validate_plan.py` exit 0; no dependency, application-code, commit, PR, or merge scope enters the sync. Evidence: all five auditors returned `[PASS]`; 50 tests OK exit 0; validator `ok ... phases: 11` exit 0; the ten staged paths are the only index changes and nothing was committed, pushed, PR-ed, or merged.

## Change log

- 2026-09-18 — code-relay-aicore-549335a-20260918: completed the atomic advance from `ba2e891` to `549335a` — eight byte-identical mirrors (plan-enforce 1.12.1 tree, herald 1.2.1, problems-register pointers), `declined` knowledge-agents decision preserving the adapted `knowledge/agents.md`, and a regenerated lock passing `check --adopter-index` exit 0 (`compliance: true`, 28 current + 7 not_applicable); Bastion, Crucible, Sentinel, Warden, and Vault all `[PASS]`; all criteria verified.
- 2026-09-14 — code-relay-aicore-ba2e891-20260914: completed the sync to AICore `ba2e891` — destination-only root at ancestor spec `2.2.0` / local `1.0.2`, Sentinel `1.4.0` with SP-10, review decisions for `sentinel` and `root-runtime-spec`, and a regenerated lock passing compliance; all criteria verified.
- 2026-09-14 — code-relay-aicore-ba2e891-20260914: superseded runtime-visible provenance; destination-only root at ancestor spec `2.2.0` / local `1.0.2`, review decisions for `sentinel` and `root-runtime-spec`, and lock advance to `ba2e891` are now the pending criteria.
- 2026-09-14 — code-relay-aicore-sync-20260914: created the durable destination adoption-sync definition and planned the atomic advance from `f6d02d7` to `71e988a`; criteria remain pending during plan creation.
- 2026-09-14 — code-relay-aicore-sync-20260914: advanced the applicable set to `71e988a` (four byte-identical mirrors, destination-facing root identity at local version `1.0.1`), regenerated the atomic lock, and proved `compliance: true`; all criteria verified.
- 2026-09-14 — code-relay-aicore-sync-20260914: reopened to reduce the root `## Upstream lineage` section to the contract-minimal statement; installer, stack-adaptation, token-substitution, adopter-registry, and verbose version-lifecycle prose removed; lock regenerated for the corrected `AGENTS.md`.

## Resolved decisions

- 2026-09-14 — Runtime-visible AICore provenance is superseded: CodeRelay `AGENTS.md` identifies only CodeRelay; `.aicore` declaration/lock metadata remains the source-identity record.
- 2026-09-14 — CodeRelay keeps one destination adoption story; imported mirror fixes remain upstream-owned and are not redefined as destination product features.
- 2026-09-14 — The catalog maps only `user-stories/.gitkeep`, so this index/story pair is destination-owned content and does not change the `user-stories` unit's mirror mode or mapping.
