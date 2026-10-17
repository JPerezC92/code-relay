---
name: op-model
description: Set or change the model for any agent in the project's opencode config (opencode.json / opencode.jsonc) deterministically, using `opencode models` as the single source of truth. Filters to subscription-available models, resolves ambiguous providers with the question tool, and previews/gets confirmation before editing. Use when the user wants to set/change an agent's model, mentions a model name (gpt, glm, deepseek, qwen, kimi, minimax, grok, claude, gemini, etc.), asks what models are available, or needs the provider/model name for the config.
license: MIT
compatibility: opencode
metadata:
  author: Philip Perez Castro
  version: 1.2.0
  domain: opencode
---

## Project extensions

### Model lookup script

This project's model-lookup script is `<python> .opencode/skills/op-model/scripts/models.py` (`<python>` is the project's Python invocation) — invoke it with the model query as its single positional argument, or with no argument to list everything. It runs `opencode models` (OpenCode V2) and emits one structured JSON record per match — six fields in order: `config`, `id`, `provider`, `name`, `cost_in`, `cost_out`, where `cost_in`/`cost_out` report `0.0` when the source provides no cost. With no query it prints a grouped listing instead: one `## <provider>` heading per provider and one line per model holding its `provider/model` selector, with cost segments shown only when the source provides them. Matching normalizes both sides (lowercase, non-alphanumerics stripped) against the config name and the human name.

Non-selector lines are skipped, never fabricated into records: a line that is not a usable `provider/model` selector is skipped one by one and reported as an issue while valid neighbouring lines survive. When nothing usable remains, the script reports the truthful no-models error — "No models parsed from `opencode models` output." — on stderr and exits non-zero; a query that matches nothing is reported as a no-match instead.

### Opencode config files

This project's opencode config file is `opencode.jsonc` (or `opencode.json`); the `OPENCODE_CONFIG` environment variable overrides the path. When neither exists, the minimal config file to create is `opencode.jsonc`.

### Model examples

Worked examples for this project — illustrative, not current subscription facts (live `opencode models` output is authoritative):

- Ambiguous query `deepseek v4 flash`: the lookup script returns `deepseek/deepseek-v4-flash` — DeepSeek V4 Flash, `opencode-go/deepseek-v4-flash` — DeepSeek V4 Flash, and `opencode/deepseek-v4-flash-free` — DeepSeek V4 Flash Free. Because there are ≥2 matches, the skill presents those three options; if the user picks `deepseek/deepseek-v4-flash`, the skill edits `agents.plan.model` in `opencode.jsonc` to `deepseek/deepseek-v4-flash`, preserving `color` and other keys, verifies JSON5 + re-runs the script to confirm the chosen name still appears, and reports "plan → deepseek/deepseek-v4-flash (DeepSeek V4 Flash). Restart the opencode TUI to apply."
- Single match `glm-4.7` returns `zai-coding-plan/glm-4.7`; edit `agents.build.model`, verify, report.
- No match `gpt-4o` — no matching usable live entry.
- Brand/family variant `gpt-5.6` may match `gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.6-sol`.

## Mandatory core

### What I do

Resolve a model name or query against the live `opencode models` output (subscription-filtered), ask via the `question` tool when multiple providers match, and surgically edit `agents.<name>.model` in the project's opencode config. Never invents model names, never picks a provider silently, and only writes models that actually appear in `opencode models`.

### When to use me

- User wants to set or change the model for an agent (plan, build, or any custom agent): "set plan to <model query>", "make build use <model query>", "use <model query> for plan".
- User mentions a model name and it needs to resolve to its `provider/model` config form: gpt, glm, deepseek, qwen, kimi, minimax, grok, claude, gemini, or any other model family.
- User asks which models are available for the config, or wants to know what they can actually use.
- User asks to pick a model before configuring the project's opencode config file.

### Arguments

From the user's request, extract:

- **agent** — the agent whose model to set (e.g. `plan`, `build`, or any custom agent name). Defaults to `plan` if unspecified.
- **model query** — free-text description of the model to look up (e.g. a model family, a provider/model-id, or a variant name).

If either is missing, collect it with the `question` tool.

#### Argument collection form

| name | type | validation | trigger |
|---|---|---|---|
| `agent` | text | non-empty, matches an existing or new agent name | not provided |
| `model_query` | text | non-empty | not provided |

Use one `question` call when both are missing, or per-missing-field otherwise. The first option is the parsed value when one is available; do not add a manual "Other" option.

### Steps

1. **Parse arguments.** Extract `agent` (default `plan`) and `model query`. Collect missing values via the `question` tool (see Argument collection form).

2. **Authoritative lookup (delegated to the script).** Run this skill's model-lookup script against the model query (see Project extensions for the exact command). The script runs `opencode models` and maps the `provider/model` selectors, emitting structured JSON records (six fields in order: `config`, `id`, `provider`, `name`, `cost_in`, `cost_out`). This is the ONLY source of candidate model names — it already reflects the user's active subscriptions and credentials. NEVER invent, recall from memory, or copy model names from anywhere else (docs, prior sessions, chat examples).

3. **Read the records.** The script returns one JSON line per match (or, with no query, the grouped listing of `provider/model` selectors — see Project extensions). Non-selector lines were already skipped with valid-neighbour recovery. Work from the surviving records:
   - **No usable models (the truthful no-models error, exit non-zero)** → nothing in the catalog parsed, with or without a query. Report that `opencode models` output yielded no usable models and do NOT proceed to any edit — never invent names to fill the gap (see Troubleshooting).
   - **No query and no agent target** → show the grouped listing and ask which model to set.
    - **0 matches** → the script already reports "No match" and exits non-zero. Report "no match found in `opencode models`" and list the closest available config names as a suggestion. Do NOT proceed to any edit. If the user names a model that is not in the output, it is simply not present in the live usable output (absent or skipped as unusable) — do NOT write it to the config.
   - **1 match** → use its `config` value (`provider/model`) and proceed to step 4.
   - **≥2 matches** → MUST use the `question` tool before proceeding. One option per matching provider, each labeled with the full config name and human name (e.g. `<provider>/<model> — <Human Name>` for each provider). Proceed only with the provider the user picks. NEVER auto-pick a provider silently — that is a FAIL.

4. **Locate the config file.** Find the project's opencode config file (see Project extensions for this project's file names and override variable). If it does not exist, prepare a minimal valid shape in memory; do not write it yet.

5. **Read and capture current state.** Read the config file before acting. If it exists, JSON5-parse it and record the current `agents.<agent>.model` value (or that the key is absent). If it does not exist, record that the proposed change creates a new config.

6. **Preview → confirm.** Show the exact config path, agent, current value, and proposed `provider/model` value. Ask the user with the `question` tool whether to apply the change or leave the config unchanged. Do not write until the user confirms. If the current value already equals the chosen value, report a no-op and skip the write.

7. **Edit surgically after confirmation.** Set `agents.<agent>.model` to the confirmed `provider/model` value:
   - If the `agents` object exists, change ONLY the `model` line. Preserve every other key in that agent block (`color`, `temperature`, `permission`, etc.).
   - If the `agents` object exists but the named agent is missing, add `"<agent>": { "model": "<provider/model>" }`.
   - If the `agents` object does not exist, add `"agents": { "<agent>": { "model": "<provider/model>" } }`.
   - Preserve all other top-level keys and comments in the file.

8. **Verify.**
   - JSON5-parse the edited file (strip line comments and trailing commas, then strict-parse) — must succeed.
   - Re-run this skill's model-lookup script against the model query and confirm the chosen `provider/model` is still present in the output.
   - Re-read the config file and confirm the `model` value matches exactly.

9. **Report.** State `<agent> → <provider/model> (<human name>). Restart the opencode TUI to apply.` Do NOT commit unless the user explicitly asks.

### Examples

**Ambiguous query → question tool (worked case):** user says "set plan to <model query>".

1. The model-lookup script returns three records (one per matching provider).
2. Because there are ≥2 matches, the skill opens the `question` tool with those three options (full config name + human name).
3. User picks one provider's config name.
4. The skill reads the config and previews the exact current → proposed model change.
5. The skill asks for explicit confirmation; it edits only after the user confirms.
6. It verifies JSON5 + re-runs the lookup script to confirm the chosen name still appears.
7. Reports: "plan → <provider/model> (<Human Name>). Restart the opencode TUI to apply."

**Single match:** user says "make build use <model query>". The lookup script returns exactly one match, so no provider-selection question is needed. Read and preview `agents.build.model`, get confirmation, then edit, verify, and report.

**No match:** user says "set plan to <model query>". The script reports "No match" and exits non-zero — no matching usable live entry. Report no match + suggest the closest available config names from the live output. Do NOT edit.

**Available-models question:** user asks "what models can I use?". Run the lookup script with no query → grouped-by-provider listing of `provider/model` selectors (a cost segment appears only when the source provides a cost), and offer to set one for an agent if the user wants.

### Troubleshooting

- **Model not in the script output:** it is not present in the live usable output — either absent or its selector line was skipped as unusable (see the next entry). Do NOT write it to the config. Show the closest available names and let the user pick from those instead.
- **Skipped selector lines or the no-models error:** cause: `opencode models` emitted lines that are not usable `provider/model` selectors. The script skips those lines and keeps valid neighbouring lines; when every line is unusable it reports the truthful no-models error and exits non-zero with no output. Fix: run `opencode models` directly to inspect the raw output (CLI version drift is the usual cause), then resolve the source problem — never proceed on no data and never invent model names.
- **Script errors or exits non-zero:** read the error message; if `opencode models` itself fails, resolve the opencode CLI issue first (PATH, auth). Never proceed on partial/empty data.
- **Query matches multiple providers:** NEVER pick one silently. Use the `question` tool with one labeled option per provider and proceed only on the user's choice.
- **Config file missing:** prepare the minimal valid config in memory, then show the exact config path and proposed content/change as the preview. Obtain the user's explicit confirmation before creating the config; if declined, make no change.
- **User declines the preview:** make no change; report that the config remains unchanged.
- **JSON5 parse fails after edit:** restore the previous file state (the skill made only a surgical change; revert it), verify the original parses, and redo the edit. Never leave the config in an unparseable state.
- **Config uses a strict-JSON file (no comments):** edit accordingly — do not introduce `//` comments or trailing commas into a strict-JSON file.
- **Model name is a brand/family, not an exact ID:** the user may name a family when several variants exist. The script's broad match lists all variants; present them via the `question` tool and let the user pick the exact one.
