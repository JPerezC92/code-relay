# Phase 6 — TUI pairing modal correction

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phase 05 automated gates passed (`pnpm exec turbo run test typecheck` exit 0, plugin 74 tests / mobile 9 tests); user approved the palette-command + xlarge-modal pairing UX and the project-local root `tui.jsonc` on 2026-09-19.
> **Reads:** `packages/opencode-plugin/src/tui.ts`; `packages/opencode-plugin/src/gateway.ts`; `packages/opencode-plugin/src/pairing.ts`; `packages/opencode-plugin/src/endpoints.ts`; `packages/opencode-plugin/src/index.ts`; `packages/opencode-plugin/node_modules/@opencode-ai/plugin/dist/tui.d.ts`; `packages/protocol/src/pairing.ts`
> **Writes:** packages/opencode-plugin/src/tui.tsx; packages/opencode-plugin/src/tui.ts; packages/opencode-plugin/src/tui.test.ts; packages/opencode-plugin/tsconfig.json; packages/opencode-plugin/package.json; packages/opencode-plugin/src/gateway.ts; packages/opencode-plugin/src/gateway.test.ts; packages/opencode-plugin/src/index.ts; tui.jsonc

## Steps

1. Create `packages/opencode-plugin/src/tui.tsx` from the current `tui.ts` sources — keep the pure helpers (`createPairingViewState`, `createPairingView`, `secondsUntil`, `pairingPayloadJson`, `fetchPairingPayload`, `startPairingPayloadPolling`, route registration, endpoint selection) — then delete `packages/opencode-plugin/src/tui.ts`.
2. Edit `packages/opencode-plugin/tsconfig.json` `compilerOptions`: add `"jsx": "preserve"` and `"jsxImportSource": "solid-js"`. No new dependency may be added; `solid-js` and the OpenTUI peers are already devDependencies/peerDependencies.
3. Edit `packages/opencode-plugin/package.json` `exports["./tui"]` from `./src/tui.ts` to `./src/tui.tsx`.
4. Edit `packages/opencode-plugin/src/gateway.ts`: add a loopback-only `POST /pairing-renew` route — 403 for non-loopback peers; 403 when `pairing.status().state === 'paired'`; 200 with the current payload (`no-store`) when `waiting`; when `expired` or `revoked`, call `pairing.createPairing` with the detected endpoints and return the fresh payload (200, `no-store`); reuse the existing `pairingPayloadLimiter` for rate limiting. `GET /pairing-payload` must serve the pairing manager's CURRENT payload, never a startup-captured one.
5. Edit `packages/opencode-plugin/src/index.ts`: wire the gateway's `pairingPayload` provider to the live manager payload so renewals are reflected on both the loopback route and the `coderelay_pair` tool; preserve the tool's one-time-secret semantics — a consumed or expired secret is never re-served.
6. Rework `packages/opencode-plugin/src/tui.tsx`: default-export the `TuiPluginModule` shape `{ id: 'coderelay', tui }` while keeping the named `tui` export; register `CodeRelay: Pair device` via `api.keymap.registerLayer({ commands: [{ namespace: 'palette', name: 'coderelay.pair', title: 'CodeRelay: Pair device', category: 'CodeRelay', run: ... }], bindings: [] })`; the command calls `POST /pairing-renew`, then `api.ui.dialog.replace` with the pairing dialog followed by `api.ui.dialog.setSize('xlarge')` (`replace` resets size to medium); render the QR from `QRCode.create(pairingPayloadJson(payload)).modules` as per-row block-glyph text with a 4-module quiet zone — never the `qrToString` ANSI string inside the dialog; display status, selected endpoint, and the live countdown from `payload.expiresAt`; on a 409 from the payload route, countdown reaching zero, dialog close, or `lifecycle.onDispose`, stop polling and clear the payload and QR from view state; when the terminal is too narrow for the QR plus padding, `api.route.navigate('coderelay-pairing')` instead of opening the dialog.
7. Write `packages/opencode-plugin/src/tui.test.ts` covering: the palette command registration shape (`namespace: 'palette'`, title `CodeRelay: Pair device`); command run performs renew, then `dialog.replace`, then `dialog.setSize('xlarge')` in that order; QR row rendering from a fixed module matrix (row count, width, 4-module quiet zone, and absence of ANSI escape sequences); countdown reaching zero clears payload and QR; dialog close and dispose stop polling; the narrow-width fallback navigates to `coderelay-pairing`; gateway renew behavior — refused with 403 when paired, 200 with current payload when waiting, fresh payload after expiry, 403 for non-loopback peers.
8. Wait for Bastion 🧱 (Backend & Scripts Architect) [PASS] on `gateway.ts`, `index.ts`, and `tui.tsx`, and Crucible 🔥 (Test Architect) [PASS] or [FAIL] on `tui.test.ts` and the `gateway.test.ts` additions. Fix every [FAIL] before continuing.
9. Cipher 🔓 (Lead Orchestrator) runs `pnpm exec turbo run test typecheck`; then the user restarts OpenCode and verifies `Ctrl+P` → `CodeRelay: Pair device` opens the QR modal. The manual result is recorded as passed or explicitly blocked, never silently skipped.

## Output

- **Artifact:** `packages/opencode-plugin/src/tui.tsx`
- **Schema / shape:** default export `{ id: 'coderelay', tui }` satisfying `TuiPluginModule` from `@opencode-ai/plugin/tui`; the palette command opens an xlarge dialog rendering the QR matrix without ANSI escapes; root `tui.jsonc` loads the module project-locally; plugin typecheck and tests exit 0.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/opencode-plugin typecheck && pnpm --filter @coderelay/opencode-plugin test` |
| Cipher 🔓 (Lead Orchestrator) | `pnpm exec turbo run test typecheck` |

## Gate

- ✅ Verify commands exit 0 (plugin typecheck; plugin 106/106 tests; Turbo 6/6)
- ✅ Bastion 🧱 (Backend & Scripts Architect) [PASS] on `gateway.ts`, `index.ts`, `tui.tsx` (including the root-text adapter, payload lifecycle, and expiry-before-cap correction)
- ✅ Crucible 🔥 (Test Architect) [PASS] on `tui.test.ts` and the `gateway.test.ts` additions; all timer and HTTP completion paths are deterministic
- ⬜ Manual TUI check recorded — `Ctrl+P` entry opens the QR modal after an OpenCode restart — or explicitly blocked with evidence; never silently skipped

## Abort conditions

- Halt if the OpenCode 1.18.31 runtime rejects the `TuiPluginModule` shape or `keymap.registerLayer` is absent and the deprecated command shim also fails — record evidence and return to planning
- Halt if the QR cannot render scannably from matrix glyphs within the xlarge dialog width without ANSI escapes
- Halt if the renew route cannot be added without weakening loopback binding, rate limiting, or the paired-state refusal
- Halt if JSX typechecking requires any new dependency — the Warden 🔒 (Dependency Warden) approval gate applies before any install
