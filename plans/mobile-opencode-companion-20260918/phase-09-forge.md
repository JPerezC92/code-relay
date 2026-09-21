# Phase 9 — TUI pairing status resolution

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phase 08 extension approved and in progress; the user reported 2026-09-20 that the TUI pairing modal stays on `waiting for pairing payload…` after a successful pairing; the user approved the phase-09 scope the same day (question tool).
> **Reads:** `packages/opencode-plugin/src/gateway.ts`; `packages/opencode-plugin/src/tui.tsx`; `packages/opencode-plugin/src/pairing.ts`; `packages/opencode-plugin/src/gateway.test.ts`; `packages/opencode-plugin/src/tui.test.ts`.
> **Writes:** packages/opencode-plugin/src/gateway.ts; packages/opencode-plugin/src/tui.tsx; packages/opencode-plugin/src/gateway.test.ts; packages/opencode-plugin/src/tui.test.ts; plans/mobile-opencode-companion-20260918/plan.md; user-stories/mobile-opencode-companion.md

## Execution rule

Every Forge 🔨 (Implementer) step below is one mutation unit (one file) and is dispatched alone: the dispatch prompt names exactly one numbered step, pastes it verbatim, and prohibits starting any other step. After each step, Cipher 🔓 (Lead Orchestrator) runs the per-step gate: non-test plugin source → Bastion 🧱 (Backend & Scripts Architect); every test file → Crucible 🔥 (Test Architect). A step closes only on that owner's final `[PASS]`; `[FAIL]` or `[UNCERTAIN]` keeps the step open.

## Steps

1. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.ts`: the loopback-only pairing-payload route's non-waiting 409 body carries the current non-secret pairing state (for example `paired`, `revoked`, `idle`) alongside its static error string; no secret, key, or host-path data is included and waiting-success behavior is unchanged.
2. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/tui.tsx`: parse the returned pairing state; `paired` transitions the modal to the connected status, `revoked` to the revoked status, and `expired`/`idle` get an explicit non-waiting display treatment; QR/payload holders still clear, polling still stops, and the existing renew flow stays intact.
3. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.test.ts`: the existing post-pair and post-revoke payload-route tests assert the returned state field and that no secret or host-only field appears in the 409 body.
4. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/tui.test.ts`: a `paired` 409 renders the connected status, a `revoked` 409 renders the revoked status, `expired`/`idle` render their explicit treatment, and no case still renders `waiting for pairing payload…` after resolution; existing waiting/renew/dispose coverage stays truthful.
5. Cipher 🔓 (Lead Orchestrator) records the phase outcomes in `plans/mobile-opencode-companion-20260918/plan.md` and appends the dated change-log entry in `user-stories/mobile-opencode-companion.md`.

## Output

- **Artifacts:** pairing-state-aware TUI modal that resolves to connected/revoked/expired instead of waiting forever.
- **Schema / shape:** the loopback 409 payload-route body carries only a static error string plus one non-secret pairing state string; no secret, key, or host-path data crosses any boundary.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/opencode-plugin typecheck && pnpm --filter @coderelay/opencode-plugin test` |

## Gate

- ⬜ Every numbered step completed in order under the one-step dispatch rule
- ⬜ Bastion 🧱 (Backend & Scripts Architect) final `[PASS]` on `gateway.ts` and `tui.tsx`
- ⬜ Crucible 🔥 (Test Architect) final `[PASS]` on `gateway.test.ts` and `tui.test.ts`
- ⬜ Verify commands exit 0
- ⬜ Manual TUI retry recorded — the modal shows connected after a successful pairing — or explicitly blocked with evidence

## Abort conditions

- Halt if exposing pairing state would leak secret, key, or host-path data.
- Halt if the waiting-payload success path or renew flow would change behavior.
- Halt if any per-step gate cannot reach final `[PASS]` after remediation.
