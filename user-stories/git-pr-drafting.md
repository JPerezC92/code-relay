<!-- core:begin -->
# User story — git-pr-drafting

> **Created:** 2026-09-14
> **Title:** Pull request draft generation
> **Status:** active
> **version:** 1.2.0
> **Epic:** developer-tooling
> **Affected areas:** `.opencode/skills/git-pr/`, `plans/`, `pr-draft.md`, `.gitignore`

## Persona

- A maintainer preparing a reviewable pull request from a branch whose motivation is recorded in a plan.

## Goal

- **G:** Generate a concise PR draft grounded in branch evidence and the plan's motivation without mutating GitHub state.
  - Done when: both supported plan layouts are discovered, the Summary uses available plan Context, the test plan remains executable and unchecked, and the skill leaves PR creation to the authorized release workflow.

## Scenario

- A maintainer finishes work governed by either a single-file or subfolder plan, invokes `git-pr`, and receives `pr-draft.md` whose title follows the diff while its Summary explains the Context's why and whose test plan remains unchecked until executed evidence exists.

## Acceptance criteria

- ✅ **AC1:** The skill finds the governing plan in either supported layout — a single file under `plans/` or a `plan.md` inside a plan subfolder — and accepts an active or completed plan.
- ✅ **AC2:** The draft's Summary explains the plan's Context motivation rather than merely restating the diff.
- ✅ **AC3:** Roster members are named in the canonical `Name Emoji (Role)` form in the skill's prose and in the generated draft; possessives stay bare-name.
- ✅ **AC4:** The skill writes `pr-draft.md` and may add only its missing ignore entry to `.gitignore` after preview and explicit user approval. If that approval is declined, neither file is written. It never mutates GitHub state or runs a Git command that mutates state.
- ✅ **AC5:** Test evidence records the human-readable verdict only; progress bars, per-test dots, stack traces, and raw dumps are omitted unless the maintainer explicitly asks.
- ✅ **AC6:** The generated test plan remains unchecked and executable until executed evidence exists.

## Proof

- AC1 → `.opencode/skills/git-pr/SKILL.md` `## Steps` item 3 plan discovery
- AC2 → `.opencode/skills/git-pr/SKILL.md` `## Steps` item 3 and `### Body` Summary requirement
- AC3 → registered root runtime (`AGENTS.md` source, resolved through its root binding) `### Conventions` roster mention format
- AC4 → `.opencode/skills/git-pr/SKILL.md` `## What I do`, `## When to use me`, `## Steps` items 6–7, and `## Rules` write/approval/mutation boundary
- AC5 → `.opencode/skills/git-pr/SKILL.md` `### Post-PR evidence contract` **Verdict-only observed output** · `.opencode/agents/inquisitor.md` `##### PR-body evidence boundary`
- AC6 → `.opencode/skills/git-pr/SKILL.md` `### Body` unchecked, executable Test plan requirements

## Constraints

- Draft generation writes only `pr-draft.md` plus its separately approved missing `.gitignore` entry; GitHub mutations and state-mutating Git commands remain outside this skill — because drafting is a review artifact and any additional ignore-file write requires its own explicit approval.
- PR creation is left to the authorized release workflow — because opening a PR requires an explicit per-repo user ask and is not implied by drafting.
- The test plan stays unchecked until executed evidence exists — because an unexecuted test plan is not a result.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
