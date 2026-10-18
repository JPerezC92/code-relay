<!-- core:begin -->
# User story — post-merge-branch-cleanup

> **Created:** 2026-09-15
> **Title:** Merge-style-aware post-merge branch cleanup
> **Status:** active
> **version:** 1.2.0
> **Epic:** developer-tooling
> **Affected areas:** `.opencode/skills/plan-enforce/`, `.opencode/agents/herald.md`

## Persona

- A maintainer who has confirmed a PR merge and needs the merged branch cleaned up without ever deleting a branch whose changes are not actually in the project's configured PR target branch.

## Goal

- **G:** A user-confirmed merged branch is deleted only after a fail-closed proof that its content is in the project's configured PR target branch, for merge-commit, squash, and rebase merges alike.
  - Done when: the shared plan-enforce/Herald 📯 (Release Manager) sequence requires live merged PR metadata, an immutable head pin, merge-commit ancestry when present, branch-tip ancestry for the safe local delete, and per-path content parity before any force-delete, with every metadata, fetch, extraction, ancestry, or diff error blocking deletion.

## Scenario

- A PR is squash-merged (the branch tip is not an ancestor of the project's configured PR target branch). The maintainer confirms the merge. The cleanup first reads live PR metadata, pins the immutable head, checks merge-commit ancestry, and — because branch-tip ancestry fails for a squash merge — materializes the changed paths and requires an empty per-path parity diff before force-deleting the local branch and deleting the remote branch when it still exists.

## Acceptance criteria

- ✅ **AC1:** A branch is deleted only after live PR metadata confirms it is merged and the exact reviewed head's content is proven present in the project's configured PR target branch.
- ✅ **AC2:** The proof covers all three merge styles — merge-commit, squash, and rebase — using branch-tip ancestry when it holds and per-path content parity when it does not.
- ✅ **AC3:** Any error in metadata retrieval, fetch, head matching, merge-base resolution, path extraction, ancestry, or diff comparison blocks deletion; the branch survives.
- ✅ **AC4:** Force-deletion happens only after the content-parity proof; where branch-tip ancestry holds, the local delete uses the non-destructive form, and the remote branch is deleted only when it still exists.
- ✅ **AC5:** Merge authority remains user-only: the workflow never merges on its own.
- ✅ **AC6:** The plan-enforce skill discovers the cleanup capability from its trigger metadata rather than requiring the maintainer to name it.

## Proof

- AC1 → `.opencode/skills/plan-enforce/references/_lifecycle-contract.md` `## Post-merge proof and cleanup` · `.opencode/agents/herald.md` `#### PR lifecycle`
- AC2 → `.opencode/skills/plan-enforce/references/_lifecycle-contract.md` `## Post-merge proof and cleanup` · `.opencode/agents/herald.md` `#### Execution steps` item 8
- AC3 → `.opencode/skills/plan-enforce/references/_lifecycle-contract.md` `## Post-merge proof and cleanup` · `.opencode/agents/herald.md` `#### PR lifecycle` hard rules
- AC4 → `.opencode/agents/herald.md` `#### Execution steps` item 8
- AC5 → `.opencode/agents/herald.md` `#### PR lifecycle` hard rules
- AC6 → `.opencode/skills/plan-enforce/SKILL.md` frontmatter description · `### When to use me`

## Constraints

- Deletion is fail-closed: no live merged metadata plus parity proof, no delete — because a branch delete is destructive and squash/rebase merges leave the tip outside the project's configured PR target branch.
- The branch tip must equal the pinned head — because cleanup must prove the exact reviewed head, not a possibly advanced local branch.
- Merge authority stays user-only — because merging is irreversible and is never implied by a cleanup request.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
