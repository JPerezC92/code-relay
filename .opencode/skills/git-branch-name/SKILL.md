---
name: git-branch-name
description: Suggest a git branch name in type/scope/description format based on current changes or task context. Use when the user wants to create a branch, asks "what should I call this branch", says "I'm starting work on X", or is about to begin a feature, fix, or refactor — even if they don't explicitly say "branch name".
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 1.1.0
  domain: git
---

## What I do

Analyze the current git changes and suggest a commitlint-compatible branch name in `type/scope/description` format, ready to be passed to `git checkout -b`.

## When to use me

- User wants to create a branch or asks "what should I call this branch"
- User says "I'm starting work on X" or is about to begin a feature, fix, or refactor — even if they don't explicitly say "branch name"
- Before committing with `/git-commit`, the natural prior step is often `/git-branch-name`
- Its `type` and `scope` feed the default commit prefix and PR-title consistency check when the branch follows this convention

Do NOT use this skill to create the branch — only suggest the name.

## Steps

1. Run `git status`, `git diff --stat`, `git diff --cached --stat`, `git log --oneline -5`, and `git branch --show-current` in parallel.
2. If the diff stat is small (under 20 files), run `git diff` and `git diff --cached` for the full diff. Otherwise, selectively read the most relevant changed files.
3. Detect if the repo is a monorepo (look for `pnpm-workspace.yaml`, `turbo.json`, `lerna.json`, `go.work`, or `[workspace]` in `Cargo.toml`).
4. Determine the **type** and **scope** of the changes using the commitlint conventional type set below.
5. Generate a branch name following the format below.
6. Print the suggested branch name and a one-line explanation of why.
7. Print the `git checkout -b <branch-name>` command ready to copy.

## Branch Name Format

```
type/scope/description
```

### Type prefixes

| Prefix | When to use |
|--------|------------|
| `build` | Build system or external dependency changes |
| `chore` | Maintenance or tooling work outside source, tests, docs, build, and CI |
| `ci` | Continuous-integration configuration or scripts |
| `docs` | Documentation only |
| `feat` | New feature or capability |
| `fix` | Bug fix, including an urgent production fix |
| `perf` | Performance improvement |
| `refactor` | Code restructuring without behavior change |
| `revert` | Revert a previous commit or PR |
| `style` | Code formatting only, not CSS or UI design |
| `test` | Adding or updating tests only |

### Scope

- Use one lowercase, kebab-case token. It maps directly to commit scope: `feat/billing-api/add-endpoint` becomes `feat(billing-api): add endpoint`.
- **Single repo**: use the affected module, feature, or layer, such as `auth`, `api`, `ui`, or `config`.
- **Shared system core or package**: use its package name, such as `core` or `ui-kit`.
- **Independent app**: use its app name, such as `cli`.
- **Backend-only product app**: use `<app>-api`, such as `billing-api`.
- **Frontend-only product app**: use `<app>-web`, such as `billing-web`.
- **App with both backend and frontend**: use `<app>-api` or `<app>-web` when one side changes; use `<app>` only when one change genuinely spans both sides.
- **Cross-cutting change**: use the shared concern that caused it, such as `deps`, `ci`, or `repo`; do not name every affected app.

### Short description

- Lowercase, words separated by hyphens
- Max 4-5 words — concise but descriptive
- Use imperative mood (e.g., `add-search-filter`, not `added-search-filter`)

## Examples

```
feat/billing-api/add-invoice-endpoint
feat/billing-web/add-invoice-screen
feat/billing/add-invoice-flow
fix/core/resolve-cache-race
ci/repo/update-release-workflow
chore/deps/upgrade-next-16
```

## Rules

- Do NOT create the branch — only suggest the name.
- Do NOT stage, commit, or push anything.
- Do NOT use `hotfix` as a type; urgent production fixes use `fix` and urgency belongs to the release process.
- If there are no changes, check the current branch name and recent commits to suggest a name based on in-progress work.
- If already on a non-main feature branch, mention the current branch name and whether it already follows the convention.

## Troubleshooting

- **No changes and on main** — `git status` is clean and HEAD is on `main`/`master`. Fix: check the most recent commit (`git log --oneline -5`) and the open branch list (`git branch --list`) to suggest a continuation name, or ask the user what work they are starting.
- **Monorepo detection false negative** — workspace marker file may exist but be invisible to the search. Fix: check `pnpm-workspace.yaml`, `turbo.json`, `lerna.json`, `go.work`, or `[workspace]` in `Cargo.toml` directly before deciding the scope.
