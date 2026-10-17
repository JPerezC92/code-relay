---
name: op-skill-creator
description: Scaffold a new OpenCode skill or rewrite an existing one by collecting metadata, validating it against the OpenCode guidelines, and writing SKILL.md to .opencode/skills/{name}/. Use when the user wants to create a new OpenCode skill, rewrite an existing skill, rename a skill, migrate a skill to .opencode/skills/, or add a prefix to a skill name.
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 1.2.0
  source: opencode-docs-skills
---

## Project extensions

### Knowledge hooks

This project's skill-creation knowledge hooks are `knowledge/skill-migration-reference.md`, `knowledge/skills.md`, `.opencode/agents/vault.md` (Quality Checklist section), and `knowledge/conventions.md`. These hooks may be absent; the skill degrades gracefully when they are.

### Prefix example

This project's illustrative prefix-rename example is `my-feature` → `my-feature-v2`.

## Mandatory core

### Pre-flight: Autoload guidelines

Load the guidelines below into the working context when they exist in the project. **Missing files degrade gracefully** — see Step 0.5. This skill is self-contained: the essential Quality Checklist is embedded in Step 9, so a project without the reference files can still scaffold valid skills.

#### Step 0.1 — Identify scenario

Classify the requested operation as exactly one of:

- `create` — new skill at `.opencode/skills/<name>/SKILL.md` (no prior file exists)
- `modify` — existing OpenCode skill being edited; the current `SKILL.md` exists at the path
- `migrate` — copying a skill from another harness's skill directory to `.opencode/skills/<name>/SKILL.md`
- `rename` / `add-prefix` — net effect is create + delete; treat as `modify` of the source plus `create` of the target

#### Step 0.2 — Read when present (regardless of scenario)

| File | Why | If absent |
|---|---|---|
| This project's skill-migration reference (see Project extensions) | Field deltas, body renames, metadata defaults | Skip; use the embedded rules in this skill |
| This project's skills inventory (see Project extensions) | Inventory + uniqueness check + current `state` per skill | Skip; uniqueness checked against the skill directory on disk |
| The catalog steward agent's Quality Checklist section (see Project extensions) | 23 Core + per-harness augmentations; OC-1/OC-2 for OpenCode | Skip; the checklist is embedded in Step 9 |

#### Step 0.3 — Conditionally read

| Trigger | File | Why |
|---|---|---|
| Scenario = `modify` | `.opencode/skills/<name>/SKILL.md` | Surface current spec before rewriting; preserve tone/structure unless explicitly changing |
| Scenario = `migrate` | The source skill's `SKILL.md` (and any `references/`, `scripts/` subdirs) | Source of truth for the conversion |
| Skill will have `### Arguments` subsection | This project's conventions reference (form-fill convention section), if present (see Project extensions) | Question-tool form schema for skill-arg use case |

#### Step 0.4 — Acknowledge each loaded file

After loading, the agent MUST emit one line per file:

```
guidelines loaded:
- skill-migration reference: loaded | skipped (not present)
- skills inventory: loaded | skipped (not present)
- catalog steward Quality Checklist section: loaded | skipped (not present)
- <conditional file>: loaded | skipped (scenario=<X>, not applicable)
```

#### Step 0.5 — Missing-file handling (degraded mode)

If any Step 0.2 file is absent, proceed in **degraded mode**: rely on the embedded Quality Checklist (Step 9) and the rules in this skill. Note the gap in the post-edit audit section. Do NOT stop and block on a missing reference file — this skill must be usable in any project that ships it.

### What I do

Create a new OpenCode-native skill under `.opencode/skills/{name}/SKILL.md`.

### When to use me

- User wants to create a new OpenCode skill.
- User wants to rewrite, rename, or migrate an existing skill.
- User wants to add a prefix to a skill name.

### Steps

1. Ask for the new skill's `name` if not provided.
2. Validate `name` immediately:
   - 1–64 characters
   - Matches `^[a-z0-9]+(-[a-z0-9]+)*$`
   - Does not start or end with `-`
   - Does not contain `--`
   - Matches the intended directory name
   - Is unique in the project's local skill directories (the creator cannot check global paths; the user must ensure uniqueness across all locations)
3. Ask for the new skill's `description` if not provided.
4. Validate `description` immediately:
   - 1–1024 characters
5. Ask for optional `license` (free-form string), `compatibility` (default `opencode`), and `metadata` key/value pairs (strings only).
   - **Project metadata defaults** — when scaffolding, pre-fill the `metadata` block with the project's default author and `version: 1.0.0` (check the project's skills inventory or conventions for the default author; generic scaffolding leaves `author` blank for the user to fill).
6. Validate optional fields if provided:
   - `license` is a string.
   - `compatibility` is a string.
   - `metadata` is a string-to-string map.
   - When `metadata.author` is present, it MUST be a non-empty string.
   - When `metadata.version` is present, it MUST be a non-empty string (semver recommended but not enforced).
7. Build the body as plain Markdown. opencode reads only the frontmatter plus the Markdown body — a skill needs **no H1 title and no `> **Rule layout:**` marker** (opencode's own example starts at `## What I do`). Recommended content as `## ` subsections (H2, no skipped heading level), in order:
   - `## What I do`
   - `## When to use me` (lowercase "use")
   - `## Examples`
   - `## Troubleshooting`
   - Optional extra `## ` and `### ` subsections as needed.
   - Optional: only when the skill must distinguish project-specific configuration from shared rules, add `## Project extensions` then `## Mandatory core` ownership sections; otherwise keep the body flat.
   - **If the user adds an arguments subsection**, scaffold it as an extra H3 (e.g. `### Arguments`) with the form-fill convention from this project's conventions reference § "Skill argument form-fill convention" (see Project extensions): include an `#### Argument collection form` H4 subsection with a fields table (name, type, description, validation, options), trigger conditions table, and recipe. This ensures every new skill with arguments declares its `question`-tool form schema from the start.
8. **Step 8 — Consistency check.** Verify that the `description` and the skill's `When to use me` section cover every major capability declared in the body sections. Cross-reference the Vault 🔐 (Catalog Steward) Quality Checklist (file loaded in Step 0.2) — specifically item QC-4 (description has WHAT + WHEN + "Use when …") and the relevant body-section completeness items. For example:
   - If the body has a `Rewrite or migrate...` section, the description and `When to use me` must mention rewrite/migrate/rename.
   - If the body has an `Arguments` section, the description or `When to use me` should mention arguments or inputs.
   - If a capability is missing from the description/When to use me, stop and ask the user via a multiple-choice question:
     - **A.** Auto-update the description and/or `When to use me` with a recommended addition.
     - **B.** Let the user edit manually.
     - **C.** Ignore the mismatch and continue.
9. **Step 9 — Pre-validation (Quality Checklist subset).** Before writing, run these checks against the fully built skill definition. The file loaded Vault 🔐 (Catalog Steward) spec § "Quality Checklist" is authoritative; reference it for full text:

   ```
   - [ ] Filename is `SKILL.md` — QC-1
   - [ ] Frontmatter `name` matches directory basename — QC-2
   - [ ] Frontmatter `name` is kebab-case — QC-3
   - [ ] `description` 1–1024 chars, no `<`, `>`, has WHAT + WHEN + "Use when …" — QC-4
   - [ ] No `claude-` or `anthropic-` prefix — QC-5
   - [ ] No `README.md` in skill dir — QC-6
   - [ ] At least one Examples section (`## Examples` for flat bodies; `### Examples` under `## Mandatory core`) — QC-11
   - [ ] At least one Troubleshooting section with cause + fix pair (`## Troubleshooting` flat; `### Troubleshooting` under `## Mandatory core`) — QC-12
   - [ ] No unfilled `{...}` placeholders — QC-13
   - [ ] Total under 5,000 words — QC-14
   - [ ] OpenCode: frontmatter has `compatibility: opencode` exact — OC-1
   - [ ] OpenCode: body is plain Markdown — recommended H2 subsections `## What I do`, `## When to use me` (lowercase "use"), `## Examples`, `## Troubleshooting` (no skipped heading level; H3 only under an optional `## Mandatory core`); NO H1 title and NO `> **Rule layout:**` marker; `## Project extensions` / `## Mandatory core` ownership sections are optional (only when a project-specific vs shared split is needed) — OC-2
   - [ ] SKILL.md < 500 lines; static blocks >30 lines extracted — QC-27
   ```

   If any check FAILS, fix or surface to user via the `question` tool before the write step (Step 12).
10. If issues are found, stop and ask the user via a multiple-choice question:
    - **A.** Auto-fix the issue if safe.
    - **B.** Let the user provide a corrected value.
    - **C.** Abort skill creation.
    - Include a short recommendation for each issue.
11. Apply the chosen fix and re-run the final prevalidation. Repeat until no issues remain or the user aborts.
12. **Step 12 — Write file.** Write to `.opencode/skills/{name}/SKILL.md`. If any Quality Checklist check failed in Step 9 and was not explicitly overridden by the user, halt here and ask.
13. Re-read the file to confirm it exists, starts with valid frontmatter, and `name` matches the directory.

### Examples

Create a skill called `git-release`:

> "Create a skill named git-release that drafts release notes and proposes a version bump."

The creator validates the name, validates the description, collects the body, runs a final prevalidation, writes `.opencode/skills/git-release/SKILL.md`, and confirms the file. The generated `SKILL.md` is frontmatter plus a plain Markdown body:

```markdown
---
name: git-release
description: Drafts release notes and proposes a version bump. Use when preparing a release or deciding the next version.
---

## What I do
Draft release notes and propose a SemVer version bump.

## When to use me
- User wants release notes drafted.
- User wants the next version chosen.

## Examples
- "Draft the notes for v1.3.0."

## Troubleshooting
- **No changes since the last tag:** report that there is nothing to release.
```

### Rewrite or migrate an existing skill

Use this when the user asks to rewrite, rename, migrate, or add a prefix to an existing skill.

#### Steps

1. Read the existing skill file.
2. Ask for the new skill name.
3. Prevalidate the new name against the OpenCode guidelines.
4. Run an interactive questionnaire with the user:
   - **Old skill cleanup**
     - A. Delete the old skill folder.
     - B. Move the old skill folder to `_deprecated/`.
     - C. Keep the old skill as-is.
   - **Output / asset paths**
     - A. Keep existing output/script paths.
     - B. Update paths to match the new skill name.
   - **Reference updates (mandatory):** search applicable skill inventories, agent specs, knowledge files, plans, and user stories for old names/paths; list every match in the preview. If the search finds no applicable reference, record that result. Reference updates are never skipped when matches exist.
5. Build a migration preview: list every file to create, move, edit, or delete, including every required reference update.
6. Ask the user to confirm the preview.
7. Execute the migration: write the new skill, copy/move helper scripts, move/delete the old skill, and update every reference found in the required search.
8. Run a final prevalidation on the new skill and any edited reference files.
9. If issues are found, stop and ask the user via a multiple-choice question with recommendations.
10. Apply the chosen fix and re-run prevalidation. Repeat until no issues remain or the user aborts.
11. Confirm completion and list all changed paths.

### Troubleshooting

- **Pre-flight file autoload degraded:** the autoload steps (Steps 0.1–0.5) are conditional — reference files are loaded when present; if any are absent, proceed in degraded mode using the embedded Quality Checklist (Step 9) and note the gap in the post-edit audit section. Silent skip of a present-but-unread file is FORBIDDEN.
- Skill does not show up after creation: verify `SKILL.md` is all caps, frontmatter has `name` and `description`, the name is unique, and permissions in `opencode.json` / `opencode.jsonc` are not set to `deny`.
- Name rejected: check for uppercase letters, underscores, leading/trailing hyphens, or double hyphens.
- Description rejected: ensure it is between 1 and 1024 characters.
- Description / `When to use me` do not match body capabilities: add the missing capability (e.g., rewrite/migrate) to both sections before writing.
- Missing `metadata.author` or `metadata.version`: add the project's default author and `version: 1.0.0` to the `metadata` block unless the user explicitly overrode. See the project-defaults note in the Steps section.
