---
name: git-pr
description: Draft a pull request title and body by analyzing branch commits and the diff versus the project's base branch ($BASE), writing output to `pr-draft.md`; if that path is not ignored, preview and request approval before adding it to `.gitignore`. Use when the user wants to open a PR, create a pull request, draft a PR description, or says "I'm done with this branch" / "ready to merge" / "submit my changes".
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 1.6.0
  domain: git
---

## Base branch

`$BASE` denotes the project's base branch ref; substitute the project's actual base ref where `$BASE` appears. Other base refs may apply when the project's upstream differs (for example `origin/develop`).

## What I do

Analyze the current branch's divergence from the project's base branch (`$BASE`) and write a PR title + body to `pr-draft.md` at the repository root. The file is the single source of truth for the eventual PR body; do not create a second PR-description artifact. If the `.gitignore` entry is missing, ask before making that separate change.

## When to use me

- User wants to open a PR or create a pull request
- User says "ready to merge", "I'm done with this branch", "submit my changes"
- User says "draft a PR description" or asks for a PR summary
- User asks for a PR title, even without explicitly saying "pull request"
- After `/git-commit` produces a commit, the natural next step is `/git-pr`
- For a convention-compliant branch, `/git-branch-name` is the start of the branch-to-commit-to-PR naming chain

Do NOT use this skill to run `gh pr create` or any git command that mutates state. Its default output is `pr-draft.md`; it may append the exact ignore entry to `.gitignore` only after explicit approval.

**Pipeline binding:** if this project has the agent roster installed (`.opencode/agents/herald.md` exists), the draft feeds Herald 📯 (Release Manager), who creates the PR; PR creation is not completion — the PR is done only after Inquisitor 🔎 (PR Reviewer) reviews it at the immutable head.

## Arguments

None. The skill reads the current branch state directly from git.

## Steps

1. Run these in parallel:
    - `git status`
    - `git log --oneline "$BASE"...HEAD`
    - `git diff "$BASE"...HEAD --stat`
    - `git log --oneline -5` (recent style reference)
    - `git branch --show-current`
2. If the diff stat is small (under 20 files), run `git diff "$BASE"...HEAD` for the full diff. Otherwise, read the most relevant changed files selectively — reading the full diff on a large changeset wastes context; sample the highest-signal files instead. `git diff --cached --check` is a whitespace diagnostic only and is never PR scope evidence.
3. Check for a plan or ticket file that explains the motivation — the PR Summary should explain the *why*, which usually lives in the plan/ticket Context, not the diff:
   - Look for `plans/*.md` and `plans/*/plan.md` with `Status: active` or `Status: completed`
   - Look for ticket folders matching recent commit refs
   - If found, read the **Context** section for the why
4. Determine the PR title and body from the diff following the format below.
5. If the current branch matches `type/scope/description` with a supported type, compare its `type/scope` with the diff-derived PR title. When they differ, keep the diff-derived title and print an explicit warning that shows both values; a branch is evidence of intent, not authority over the diff.
6. Read `.gitignore`. If `pr-draft.md` is not ignored, preview the exact `.gitignore` addition and ask the user to approve that second file write. If declined, do not write either file and report the blocker.
7. After any needed approval, append `pr-draft.md` to `.gitignore` only if missing, then write the output file.
8. If `.opencode/agents/herald.md` exists in the project, do NOT print a direct `gh pr create` command — report that `pr-draft.md` is ready for Herald 📯 (Release Manager), naming Inquisitor 🔎 (PR Reviewer) review at the immutable head as the completion condition. Otherwise, print the ready-to-run `gh pr create` command with the draft content inlined.

## Format

### Title

```
type(scope): concise summary under 70 characters
```

- **type**: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, or `test`; `style` means code formatting, not CSS or UI design
- **scope**: one lowercase, kebab-case token.
  - **Single repo**: use the affected module, feature, or layer, such as `auth`, `api`, `ui`, or `config`.
  - **Shared system core or package**: use its package name, such as `core` or `ui-kit`.
  - **Independent app**: use its app name, such as `cli`.
  - **Backend-only product app**: use `<app>-api`, such as `billing-api`.
  - **Frontend-only product app**: use `<app>-web`, such as `billing-web`.
  - **App with both backend and frontend**: use `<app>-api` or `<app>-web` when one side changes; use `<app>` only when one change spans both sides.
  - **Cross-cutting work**: use the responsible shared concern, such as `deps`, `ci`, or `repo`.
- Imperative mood, lowercase after the colon
- No trailing period

### Body

```markdown
## Summary
- <bullet: what changed and why — one line each, max 3>

## Test plan
- [ ] <what to verify manually or via CI>
- [ ] <edge case or regression to check>
```

- **Summary**: focus on *why*, not *what* the diff shows — the diff is already visible
- **Test plan**: at least 2 concrete, executable steps a reviewer can follow. Each item names the action and the observable expected result.
- **Test plan format is mandatory** — every item MUST be a `- [ ]` checkbox (un-ticked in the draft). Herald 📯 (Release Manager) converts prose items to checkboxes only when forced; the skill produces checkboxes from the start.
- **Test-plan draft boundary** — include only unchecked executable test-plan items. Do not include `[x]` items, test results, passing claims, or evidence claimed as executed.
- **Test evidence quality** — a checkbox is ticked ONLY after a real run with recorded literal input→observed output evidence (per the project's Test-Evidence-Before-Done gate). A "logic trace", "it should work", or an UNROUTABLE-but-plausible reading is NOT execution.
- Keep the body under 20 lines total

### Post-PR evidence contract

After the PR exists, retain the same PR body as the sole mutable description surface; do not create or use GitHub comments, reviews, or a second evidence document. Before any test-plan checkbox changes from `- [ ]` to `- [x]`:

1. Obtain the PR number and immutable PR head SHA with `gh pr view <number> --json number,headRefOid`; then inspect the changed-file list and patch with `git diff "$BASE"...<head-sha>`. A local `HEAD`, branch name, or `git diff --cached --check` alone is insufficient.
2. Execute the specific test against that commit and record the evidence in a `## Test evidence` section in the PR body using this exact shape:

````markdown
## Test evidence
- Test-plan item: `<exact checkbox text>`
  - PR: `#<number>`
  - Commit under test / immutable head SHA: `<head-sha>`
  - Base: `$BASE`
  - Scope command: `git diff "$BASE"...<head-sha>`
  - Input: `<literal executed input>`
  - Command (only when a command was actually executed): `<literal executed command>`
  - Observed output: `<literal observed output>`
  - Executor: `<person or agent>`
````

**Verdict-only observed output.** `Observed output` is the human-readable verdict only — for pytest, the `N passed in Xs` line (and the exit code where relevant). Do not paste progress bars, per-test dots, stack traces, or raw dumps unless the user explicitly asks. A raw dump is not clearer evidence; the verdict line is the durable result.

**Manual actions.** An evidence row may record a genuinely performed manual action — treat it like any other row: literal action/input, literal observed result, and the actual executor. Include the executed command only when a command was actually run; never invent one for a manual check, and never let a bare tick instruction or a `manual`/`optional` label stand in for a performed execution.

3. **Atomic evidence-and-tick join.** Validate the complete evidence for the item first — PR number, immutable head SHA, exact scope command, literal input, observed output, executor, and the matching evidence row. Only then persist the `## Test evidence` row(s) and the matching checkbox tick(s) in ONE `--body-file` body write: a row is never persisted in one write and its checkbox ticked in a separate write. After that single write, live-reread the unchanged head and body with `gh pr view <number> --json number,headRefOid,body`; a changed head, a divergent body, or a failed reread blocks acceptance. Missing or partial evidence leaves the item unchecked.
4. **Execution-ownership handoff.** When an execution owner runs a test-plan item but does not own PR-body mutation, that owner must not report the PR complete; the complete `## Test evidence` row and the matching tick are recorded by the single evidence writer at the review join (the designated Inquisitor 🔎 (PR Reviewer) instance under the project's PR-boundary contract) — no second body writer exists; the item stays `- [ ]`, and no PR-complete report is made, until that writer has persisted the row and tick and re-read the live body.

### Breaking changes

If any commit title has `!` or the diff removes/renames a public interface, add before the test plan:

```markdown
## Breaking changes
- <what breaks>
- Migration: <one-line path>
```

## Examples

**Input** (branch commits + diff):
- `feat(auth): add JWT validation middleware`
- `test(auth): cover expired-token path`
- diff touches `src/auth/jwt.ts`, `src/auth/jwt.test.ts`

**Output** (`pr-draft.md` body):
```markdown
## Summary
- Add JWT validation middleware so protected routes reject expired/forged tokens before hitting handlers

## Test plan
- [ ] Hit a protected route with a valid token → 200
- [ ] Hit it with an expired token → 401, no handler invocation
```

## Output file

`pr-draft.md` content:

```
Title: <title here>

---

<body here>
```

## Rules

- **Do NOT run `gh pr create`** or any git command that mutates state — only write the draft file.
- **Do NOT stage, commit, or push** anything.
- **Do NOT tick test plan checkboxes** in the draft. Ticking happens later, in the PR body, after each item has been executed with live evidence.
- **Do NOT force a PR title to match its branch.** A matching branch is a consistency check; the diff-derived title wins on mismatch and the mismatch must be reported.
- **Do NOT use prose test items** ("Verify the X works"). Use `- [ ] <actionable item>` form. Herald 📯 (Release Manager) converts prose → checkboxes only if forced; the skill must produce checkboxes from the start.
- **Do NOT claim unexecuted evidence** in the draft or PR body. Before the join, missing or unvalidated evidence leaves its checkbox unchecked. At the join, write the validated evidence row and matching tick together once; accept the tick only after the live unchanged-head/body reread succeeds. A failed reread blocks acceptance, not a separate persist-before-tick write.
- **Do NOT use `git diff --cached --check` as scope evidence.** Use `git diff "$BASE"...HEAD` before PR creation and `git diff "$BASE"...<head-sha>` after the immutable PR head is known.
- **Do NOT create, post, edit, identify, or delete GitHub comments or reviews.** Test evidence belongs only in the PR body.
- **If on the base branch with no diverging commits** — inform the user, no draft to write.
- **If the branch has no commits ahead of `$BASE`** — check for uncommitted changes and suggest running `/git-commit` first.
- **After writing the file**: if the project has NO agent roster (no `.opencode/agents/herald.md`), print the full ready-to-run command:
  ```
  gh pr create --title "<title>" --body "$(cat pr-draft.md | tail -n +4)"
  ```
  If the roster IS installed, hand off instead: report the draft ready for Herald 📯 (Release Manager) and do not print or run a direct PR-creation command.

## Troubleshooting

**`fatal: ambiguous argument '$BASE...HEAD'`**:
- Cause: the project's base branch has a different name than the configured `$BASE` (e.g., the default branch is named differently, or `master` is used).
- Fix: run `git branch -vv` to confirm the current upstream, then re-run the diff against the correct remote base ref and set `$BASE` accordingly.

**No commits ahead of `$BASE`**:
- Cause: branch is at the same commit as `$BASE` — nothing to PR.
- Fix: check `git status` for uncommitted changes; if any exist, run `/git-commit` first. If the branch is clean, inform the user that there is nothing to PR.

**`.gitignore` does not list `pr-draft.md`**:
- Cause: the file would otherwise be tracked and pollute the diff.
- Fix: preview the exact `.gitignore` line and get explicit approval before adding it; if declined, do not write `pr-draft.md`. Verify approved additions with `git check-ignore -v pr-draft.md`.

**PR body test plan was prose instead of `- [ ]` checkboxes**:
- Cause: the draft used bullet sentences, not checkboxes.
- Fix: rewrite the test items in `- [ ] <actionable step>` form. Herald 📯 (Release Manager) should not need to convert prose to checkboxes; the skill produces the correct shape directly.

**A checkbox was ticked without complete evidence**:
- Cause: the PR body lacks the immutable head SHA, exact scope command, literal input, observed output, executor, or a persisted re-read.
- Fix: return the item to `- [ ]`, then validate the complete `## Test evidence` row for the current PR head and persist that row together with its matching tick in one body write, and live-reread the unchanged head/body before accepting.

**Tests executed but test-plan boxes left unchecked**:
- Cause: an execution owner ran the item but the PR-body persistence step was skipped, so no `## Test evidence` row was written and the matching checkbox was never ticked.
- Fix: route the complete head-bound `## Test evidence` row to the single evidence writer at the review join to persist the row and its matching tick in one body write, then live-reread the unchanged head/body before accepting.

**`git ls-tree -- '*.py'` (pathspec form) silently returns 0 results**:
- Cause: `git ls-tree` with a pathspec form returns nothing even when matching files are tracked — it has produced false "no Python files" verdicts in PR reviews.
- Fix: use the pipe-grep form for tracked-file existence checks: `git ls-tree -r <sha> --name-only | grep '\.py$'`. Never trust a 0 from the pathspec form.

**Changeset scope confused with repo-wide tree scope**:
- Cause: `git ls-tree -r <sha> --name-only | grep '\.py$'` lists every tracked file in the whole tree at that SHA, not the PR's changeset — a Markdown-only PR still lists tracked `.py` files this way.
- Fix: for changeset language scope, use the diff pipe-grep: `git diff --name-only "$BASE"...<head-sha> | grep '\.py$'` — empty output means the changeset has no `.py` files.
