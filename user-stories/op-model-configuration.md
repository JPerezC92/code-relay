<!-- core:begin -->
# User story — op-model-configuration

> **Created:** 2026-09-14
> **Title:** OpenCode model configuration
> **Status:** active
> **version:** 1.2.0
> **Epic:** developer-tooling
> **Affected areas:** `.opencode/skills/op-model/`, `opencode.json`, `opencode.jsonc`

## Persona

- A maintainer selecting an available subscribed model for an OpenCode agent without guessing provider or model identifiers.

## Goal

- **G:** The maintainer can choose a model from what is actually available and have only that agent reconfigured, without guessing identifiers or losing unrelated configuration.
  - Done when: available models are resolved from live output and presented with enough information to compare candidates, an ambiguous provider requires an explicit user choice, and the resulting configuration edit is limited to the selected agent and verified before it takes effect.

## Scenario

- The maintainer names a model family. The skill resolves it from live `opencode models` output and presents each candidate with its `provider/model` selector — plus its in/out cost when the live source provides one — asks when more than one provider matches, and updates only the selected agent's model field with a verified `provider/model` value.

## Acceptance criteria

- ✅ **AC1:** Each available model is presented with its `provider/model` selector (identifier and provider), plus its in/out cost when the live source provides one, so the maintainer can compare candidates before choosing.
- ✅ **AC2:** Model resolution uses live `opencode models` output as the only authority for what is available; no model identifier is supplied from memory or assumption.
- ✅ **AC3:** When more than one provider offers a matching model, the maintainer is asked to choose rather than having one selected for them.
- ✅ **AC4:** The configuration change is limited to the selected agent's model field, is parse-verified after writing, and is followed by a restart instruction.
- ✅ **AC5:** A missing configuration file is created only after the maintainer confirms the exact content preview.
- ✅ **AC6:** Unrecognized or malformed model output is skipped rather than producing a fabricated record, and a no-match is reported as a no-match.

## Proof

- AC1 → `.opencode/skills/op-model/scripts/op_model_lookup/infrastructure/cli.py` `render_selection` · `.opencode/skills/op-model/scripts/op_model_lookup/infrastructure/test_cli.py` grouped cost-segment cases (cost shown only when the source provides it) · `.opencode/skills/op-model/scripts/op_model_lookup/e2e/test_models_cli.py` selector-listing cases
- AC2 → `.opencode/skills/op-model/SKILL.md` `### Steps` items 2–3
- AC3 → `.opencode/skills/op-model/SKILL.md` `### Steps` item 3
- AC4 → `.opencode/skills/op-model/SKILL.md` `### Steps` items 4–9
- AC5 → `.opencode/skills/op-model/SKILL.md` `### Steps` item 6 · `### Troubleshooting` missing-config confirmation rule
- AC6 → `.opencode/skills/op-model/scripts/op_model_lookup/domain/catalog.py` `parse_records`, `matches` · `.opencode/skills/op-model/scripts/op_model_lookup/domain/test_catalog.py` malformed-line recovery · `.opencode/skills/op-model/scripts/op_model_lookup/e2e/test_models_cli.py` no-match/error outcomes

## Constraints

- Live `opencode models` output is the only model-name authority — because a remembered or guessed identifier silently configures an unavailable model.
- No runtime-validation dependency is added for model records — because the skill is a small resolver and a dependency upgrade path is disproportionate risk.
- No model is selected automatically when providers are ambiguous — because the provider determines billing and availability and is a maintainer decision.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
