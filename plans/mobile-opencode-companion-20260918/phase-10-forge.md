# Phase 10 — Revocation queue and audit-debt correction

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** The user directed on 2026-09-21 that the Lumen bootstrap requirement remains debt rather than adding `PRODUCT.md`/`DESIGN.md`; final Phase 08 audits found stale queued events survive host revocation and two missing regression cases; no stash overlap exists.
> **Reads:** `packages/opencode-plugin/src/gateway.ts`; `packages/opencode-plugin/src/gateway.test.ts`; `apps/mobile/src/modules/session/services/session.service.test.ts`; `apps/mobile/src/modules/session/components/ChatScreen.test.tsx`; `knowledge/debt.md`.
> **Writes:** packages/opencode-plugin/src/gateway.ts; packages/opencode-plugin/src/gateway.test.ts; apps/mobile/src/modules/session/services/session.service.test.ts; apps/mobile/src/modules/session/components/ChatScreen.test.tsx; knowledge/debt.md; plans/mobile-opencode-companion-20260918/plan.md

## Execution rule

Every Forge 🔨 (Implementer) step below is one mutation unit (one file) and is dispatched alone: the dispatch prompt names exactly one numbered step, pastes it verbatim, and prohibits starting any other step. After each step, Cipher 🔓 (Lead Orchestrator) runs the per-step gate: non-test plugin source → Bastion 🧱 (Backend & Scripts Architect); every test file → Crucible 🔥 (Test Architect). A step closes only on that owner's final `[PASS]`; `[FAIL]` or `[UNCERTAIN]` keeps the step open.

## Steps

1. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.ts`: clear every queued projected event during `revoke()` before a subsequent pairing can seal it; preserve catalog, key, secret, stream, and rate-limit cleanup behavior.
2. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.test.ts`: prove an event queued before revocation is absent after re-pairing while newly queued post-pair events still deliver.
3. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/services/session.service.test.ts`: prove malformed individual project records (`null`, missing/non-string key or label) are skipped while a valid safe project remains.
4. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/components/ChatScreen.test.tsx`: prove reduced-motion preference makes a near-bottom follow update call `scrollToEnd({ animated: false })`.
5. Cipher 🔓 (Lead Orchestrator) records `DEBT-003` in `knowledge/debt.md` for the user-deferred Lumen bootstrap with its ID, date, description, direct evidence, resolution criteria, and the user's explicit 2026-09-21 deferral decision, then records phase outcomes in `plan.md`.

## Output

- **Artifacts:** revocation cannot deliver stale pre-revocation events to a later paired device; parser and accessibility regressions are covered; the deferred Lumen bootstrap has a durable non-blocking debt record.
- **Schema / shape:** no event queued before revocation reaches any later pairing; `DEBT-003` states direct evidence, resolution criteria, and the user's explicit deferral.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm exec turbo run test typecheck` |

## Gate

- ⬜ Every numbered step completed in order under the one-step dispatch rule
- ⬜ Bastion 🧱 (Backend & Scripts Architect) final `[PASS]` on `gateway.ts`
- ⬜ Crucible 🔥 (Test Architect) final `[PASS]` on all three test files
- ⬜ Verify commands exit 0
- ⬜ `DEBT-003` contains ID, date, description, direct evidence, resolution criteria, and the user's 2026-09-21 deferral decision

## Abort conditions

- Halt if revocation cleanup would alter the paired-device, secret, or route-map lifecycle beyond clearing queued events.
- Halt if the debt record lacks its ID, date, description, direct evidence, resolution criteria, or the user's explicit decision.
- Halt if any per-step gate cannot reach final `[PASS]` after remediation.
