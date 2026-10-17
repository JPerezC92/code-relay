<!-- core:begin -->
# User story — clean-architecture-contract

> **Created:** 2026-10-11
> **Title:** Clean architecture contract
> **Status:** active
> **version:** 1.3.0
> **Epic:** core-governance
> **Affected areas:** `knowledge/agents.md`, `.opencode/agents/atrium.md`, `.opencode/agents/bastion.md`, `.opencode/agents/crucible.md`, `.opencode/agents/forge.md`, `.opencode/agents/marshal.md`, `.opencode/agents/sentinel.md`, `.opencode/skills/op-agent-creator/SKILL.md`

## Persona

- A maintainer who needs future agents to enforce clean architecture in every language, with each language's rules and libraries grouped and reusable.

## Goal

- **G:** One language-agnostic architecture contract applies in every language, every rulebook is grouped by language first with libraries nested, and no language section suspends the contract.
  - Done when: the shared contract, language interpretations, `execute()`, folder design, and test pyramid remain coherent; implementation and review roles apply them to bounded changes, and any nonconforming file included in a plan receives its necessary rework rather than a legacy exemption.

## Scenario

- An agent implements a Python skill script or a React feature. The language-agnostic contract still requires a named use case with `execute()`. The TypeScript→React section still renders the component with the real Hook and mocks only the service. The TypeScript→NestJS section still uses `application/use-cases/` and a single `execute()`. The Python section maps domain, application, infrastructure, and composition before its syntax rules.

## Acceptance criteria

- ✅ **AC1:** The shared agent rules state one language-agnostic clean-architecture contract and require a named use case exposing `execute()`.
- ✅ **AC2:** No language section suspends or weakens the language-agnostic contract.
- ✅ **AC3:** Structural review enforces the rulebook shape: a language-agnostic subsection must precede the first language section in every governed rulebook.
- ✅ **AC4:** Each rulebook is grouped by language first, with libraries nested under their language, and every language-specific obligation is generalized into the language-agnostic subsection.
- ✅ **AC5:** The language-agnostic subsection also states the folder layout, naming the layers domain, application, and infrastructure.
- ✅ **AC6:** React keeps the Hook as the adapter and the use case as a non-Hook callable consumed through the query or mutation callback.
- ✅ **AC7:** The test pyramid is stated generically in the language-agnostic section and concretely per language, naming the unit/integration and end-to-end runners that language uses.
- ✅ **AC8:** Python maps domain, application, infrastructure, and composition to the same contract; its concrete module roles stay in destination-owned project extensions.
- ✅ **AC9:** Python tests follow the pyramid and mirror the layers.
- ✅ **AC10 — Semantic preservation:** Valid architectural obligations and concrete library interpretations survive or are translated without loss. Obsolete, conflicting, or noncompliant definitions are explicitly replaced or retired against the approved contract, not preserved merely because they existed before. Before-copies establish change history; they are not an architectural authority.
- ✅ **AC11 — Applicable reads and gates:** Before an assigned behavior slice, the implementer reads the shared contract and applicable role/language definitions plus affected code/test/documentation dependencies. Frontend, backend/script, and test review use their actual owners; an unconditional frontend gate does not override the backend/Python gate.
- ✅ **AC12 — Snapshot-bound architecture evidence:** Reviews state their scope and reviewed snapshot, assess responsibilities and dependency direction by reading, and do not substitute test execution for architectural judgment. Evidence is reused only when its relevant content and dependencies remain unchanged.
- ✅ **AC13 — Required touched-file rework:** A file included in a plan that violates the approved design must be reworked within that plan, with the necessary supporting files, tests, and documentation declared before editing. Existing noncompliance is neither grandfathered nor mislabeled compliant; unrelated repository-wide migrations are not implied.
- ✅ **AC14 — Effective dependency and error contracts:** Static dependency direction is distinguished from runtime calls: application may invoke effects through injected domain ports without depending on concrete infrastructure. Returned business failures are distinguished from boundary/programming exceptions; transport serialization belongs at the delivery edge. Detailed language rules, examples, and local extensions agree with these obligations rather than weakening them.

## Proof

- AC1 → `knowledge/agents.md` `### Clean architecture (language-agnostic) (HARD RULE)`
- AC2 → `.opencode/agents/bastion.md` `### Rulebook` language-agnostic and Python obligations · `knowledge/agents.md` `### Clean architecture (language-agnostic) (HARD RULE)`
- AC3 → `.opencode/agents/sentinel.md` `SP-12` · `.opencode/agents/marshal.md` Runtime Spec Format
- AC4 → `.opencode/agents/bastion.md`, `.opencode/agents/atrium.md`, `.opencode/agents/crucible.md` `### Rulebook`
- AC5 → `.opencode/agents/bastion.md` `##### Layers (Python) — domain, application, infrastructure`
- AC6 → `.opencode/agents/atrium.md` `##### HOOK LAYER — \`modules/{feature}/hooks/use-{feature}.ts\``
- AC7 → `.opencode/agents/crucible.md` `##### Test Pyramid Overview`, `#### TypeScript`
- AC8 → `.opencode/agents/bastion.md` `##### Layers (Python) — domain, application, infrastructure` shared mapping and the project-owned concrete-configuration boundary
- AC9 → `.opencode/agents/crucible.md` `##### Python Test Pyramid`
- AC10 → `.opencode/agents/atrium.md`, `.opencode/agents/bastion.md`, `.opencode/agents/crucible.md`, `.opencode/agents/forge.md` `### Rulebook` and `### Workflow` · `knowledge/agents.md` `### Clean architecture (language-agnostic) (HARD RULE)`
- AC11 → `.opencode/agents/forge.md` `### Workflow` implementation warmup and gate routing · `.opencode/agents/atrium.md`, `.opencode/agents/bastion.md`, `.opencode/agents/crucible.md` `### Rulebook`
- AC12 → `.opencode/agents/atrium.md`, `.opencode/agents/bastion.md`, `.opencode/agents/crucible.md`, `.opencode/agents/sentinel.md` `#### Review scope and snapshot`
- AC13 → `knowledge/agents.md` `### Clean architecture (language-agnostic) (HARD RULE)` · `.opencode/agents/forge.md` `### Rulebook` scope rules · `.opencode/skills/plan-enforce/SKILL.md` `### Bounded discovery before scope confirmation` and `### Contract-sized phases`
- AC14 → `knowledge/agents.md` `### Clean architecture (language-agnostic) (HARD RULE)` · `.opencode/agents/bastion.md` `##### Layers (Python) — domain, application, infrastructure` · `.opencode/agents/atrium.md` `##### TypeScript — React`

## Constraints

- The language-agnostic contract governs every language; no language section may suspend it — because a per-language exemption destroys the single architecture the roster enforces.
- Content is grouped by language first with libraries nested under their language — because a maintainer mapping a new library needs to see the language's rules before the library's.
- NestJS is the worked example for mapping a new library — because one concrete worked example prevents each language inventing its own mapping procedure.
- React uses a non-Hook `execute()` passed to the query or mutation callback; component-plus-Hook tests stay unchanged — because the Hook is an adapter and making it the use case couples the use case to the rendering lifecycle.
- Python conforms to the agnostic contract; its module/IO/type rules are syntax specifics — because syntax differences must not weaken the layering.
- Nonconforming files included in an implementation plan are reworked in that plan — because existing noncompliance is neither grandfathered nor grounds for a partial fix, and unrelated repository-wide migrations are not implied.

<!-- core:end -->

<!-- project:begin -->
<!-- project:end -->
