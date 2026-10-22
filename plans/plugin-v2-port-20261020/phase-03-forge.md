# Phase 3 — V2 CLI plugin and pairing screen

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** `T1` returned `COMPLETED` and Cipher 🔓 (Lead Orchestrator) accepted it. Required input identity: `T1`'s post-edit `packages/opencode-plugin/package.json` and `pnpm-lock.yaml`, which must already resolve `@opencode/plugin@2.0.32` and the `@opentui/*` peer floor this phase compiles against. `T2` is **not** a predecessor — `tui.tsx` does not consume the server port — so this phase may start before `T2` finishes, but the two are not fully isolated (see Readiness below) and their cross-file test runs are provisional. Resource access: exclusive write footprint below. Capacity: available from the coordinator-owned ledger.
> **Reads:** `T1`'s accepted output value — the resolved dependency surface; `packages/opencode-plugin/src/tui.tsx`; `packages/opencode-plugin/src/tui.test.ts`; `packages/opencode-plugin/package.json`; `tui.jsonc`; `https://opencode.ai/v2/docs/build/plugins/cli`
> **Writes:** `packages/opencode-plugin/src/tui.tsx`; `packages/opencode-plugin/src/tui.test.ts`; `tui.jsonc`

> Contract-sized: one coherent responsibility — bind the TUI pairing screen to the V2 CLI plugin contract so the QR pairing modal works again. Interfaces produced: the CLI plugin default export, the `coderelay.pair` palette command, the `coderelay-pairing` route. Interfaces consumed: `@opencode/plugin/tui` context. Server-side gateway, allowlist and catalog behaviour are out of scope.

## Assignment and resources

- Workflow / task / instance: `plugin-v2-port-20261020` / `T3` / `T3-instance-1`; Forge 🔨 (Implementer) owns the CLI plugin binding and the pairing screen.
- Accepted predecessors / input identities: `T1` `COMPLETED`, accepted by Cipher 🔓 (Lead Orchestrator), with the `package.json` / `pnpm-lock.yaml` content identity recorded in `T1`'s Output block. May not start against a `T1` that is incomplete, failed, stale or still mutating.
- Permitted resource access: write access is exactly the three `Writes` paths above, whole-file, including the deletion of `tui.jsonc`. Read access to `gateway.ts`, `allowlist.ts`, `session-catalog.ts`, `index.ts`, `endpoints.ts`, `pairing.ts`, `crypto.ts` is read-only. Shell: `pnpm install`, `pnpm --filter @coderelay/opencode-plugin test`, `pnpm --filter @coderelay/opencode-plugin typecheck`, and PowerShell `Select-String`/`Get-ChildItem`/`Test-Path` read-only discovery. `rg` is **not** on PATH in agent shells — do not use it. No Git mutation.
- Ownership / output destination: sole active writer of the three `Writes` paths. Report returns to Cipher 🔓 (Lead Orchestrator).
- Required gates / continuation / join owner: Bastion 🧱 (Backend & Scripts Architect) `[PASS]` or `[FAIL]` on `tui.tsx` (`[UNCERTAIN]` is not acceptable); Crucible 🔥 (Test Architect) `[PASS]` or `[FAIL]` on `tui.test.ts`. Both return `AWAITING_REVIEW`; the parent accepts the existing owner's current verdict and explicitly redispatches continuation. Join owner: Cipher 🔓 (Lead Orchestrator).
- Capacity allocation / accounting owner: Cipher 🔓 (Lead Orchestrator) holds the single shared ledger; this instance consumes one implementation slot from it.
- Readiness / serialization evidence: serialized behind `T1` by an actual dependency — the OpenTUI peer floor and `@opencode/plugin` resolution come from `T1`'s dependency work. Disjoint write footprint from `T2`, but not fully isolated: this phase's read set includes `index.ts` (`T2`'s sole source write target) and its package-wide `test`/`typecheck` compiles `index.ts` in whatever state `T2` has left it. Under `knowledge/agents.md` **Safe parallel task coordination**, those cross-file runs are provisional; the authoritative green run is `T5`'s whole-suite gate on the accepted combined candidate.

> Apply the shared coordination contract. Whole-file edits conflict even across text regions; deleting a directory conflicts with its descendants. Reviewer autofix access is a write assignment.

**Verbatim subagent contract — the dispatch carrying this runbook must also carry these two clauses unchanged:**

> Never invoke the user-facing `question` tool. If required input, instruction, or evidence is missing, halt and report to Cipher 🔓 (Lead Orchestrator) the task as received, exact missing item, inspected sources, bounded options, and recommended default. Never guess, assume, silently continue, or stall.

> Report discipline: lead with the requested verdict (`[PASS]` / `[FAIL]` / `[BLOCK]` / `[UNCERTAIN]` / `[ADVISORY]`) for audit or verification work; cite `file:line` and the governing rule; do not dump file excerpts; hard bound **≤ 60 lines**.

## Steps

1. Read `https://opencode.ai/v2/docs/build/plugins/cli` in full before editing. Its `Publish and load` section is authoritative for the package shape.
2. In `packages/opencode-plugin/src/tui.tsx`, replace the V1 import at `:6` (`import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from '@opencode-ai/plugin/tui';`) and the V1 plugin export shape with `Plugin.define({ id, setup(context) })` imported from `@opencode/plugin/tui`. Give it the stable id literal **`coderelay.tui`**. That literal is prescribed here so distinctness from the server plugin holds **by construction** rather than by reading `T2`'s in-flight `index.ts`, which may be mutating concurrently; the server plugin's prescribed id literal is **`coderelay.server`** (`phase-02-forge.md` step 2). Do not derive either id at runtime and do not read `index.ts` to discover it.
3. Register the palette command through `context.keymap.layer(...)`, preserving the command id `coderelay.pair` (`PAIRING_COMMAND_NAME`), its title `CodeRelay: Pair device` (`PAIRING_COMMAND_TITLE`) and its category `CodeRelay` (`PAIRING_COMMAND_CATEGORY`) as exported constants at `tui.tsx:26-28`.
4. Register the pairing route through `context.ui.router.register({ name: ..., render })`, preserving the route name `coderelay-pairing` (`PAIRING_ROUTE_NAME`, `tui.tsx:17`).
5. Render the modal through `context.ui.dialog`, preserving the tier-selection constants at `tui.tsx:45-50` — the smallest dialog tier that fits the QR, with `PAIRING_DIALOG_MEDIUM_COLUMNS` and `PAIRING_DIALOG_LARGE_COLUMNS` tiers and the narrow-terminal fallback.
6. Preserve the QR rendering contract exactly (`tui.tsx:31-43`): one cell per module, the four glyph constants, `PAIRING_QR_MAX_MODULES_PER_SIDE`, and `PAIRING_QR_MAX_WIDTH_COLUMNS`. The QR shrinks its quiet zone toward `QR_QUIET_ZONE_MODULES` to fit and falls back to the endpoint URL via `PAIRING_QR_TOO_NARROW_LINE` when the matrix cannot fit.
7. Preserve the Esc behaviour recorded in the story: Esc clears the dialog, stops the payload polling (`PAIRING_PAYLOAD_POLL_INTERVAL_MS` × `PAIRING_PAYLOAD_POLL_MAX_ATTEMPTS`), and drops the payload. The payload is read from the gateway's loopback-only routes `PAIRING_PAYLOAD_PATH` and `PAIRING_RENEW_PATH` (`tui.tsx:18-19`), never reconstructed from the one-time secret.
8. Return a cleanup function from `setup` that unregisters the route and keymap layer and stops any polling timer, per the V2 lifecycle.
9. Delete `tui.jsonc`. The V2 CLI guide states that exposing `./tui` beside `.` in `package.json` gives automatic loading, and `package.json:8` already exports `"./tui": "./src/tui.tsx"`. `tui.jsonc` is V1 terminal-client configuration that V2 does not read and is therefore stale wiring; leaving it would imply a registration path that does not exist.
10. Do **not** add the plugin to `~/.config/opencode/cli.json`. The V2 guide reserves that `plugins` key for CLI-only packages; ours has a server entry and loads automatically.
11. Update `packages/opencode-plugin/src/tui.test.ts` to the V2 context surface. Preserve every existing assertion's intent, including the QR-fit, tier-selection, Esc, and endpoint-fallback behaviour; change an assertion only where the V2 API name differs.
12. Run `pnpm --filter @coderelay/opencode-plugin typecheck` and confirm exit 0. If the OpenTUI peer bump breaks this package's `tsconfig.json`, stop and report `BLOCKED` — `tsconfig.json` is outside this phase's footprint.
13. Run `pnpm --filter @coderelay/opencode-plugin test` and confirm exit 0.
14. Run `Test-Path tui.jsonc` and confirm `False`.
15. Run `Select-String -Path packages\opencode-plugin\src\*.ts,packages\opencode-plugin\src\*.tsx,packages\opencode-plugin\package.json -Pattern "@opencode-ai"` and confirm no match.

## Output

- **Artifact:** `packages/opencode-plugin/src/tui.tsx`
- **Schema / shape:** a default export of `Plugin.define({ id, setup(context) })` from `@opencode/plugin/tui`, registering the `coderelay.pair` palette command, the `coderelay-pairing` route and the QR dialog, and returning a cleanup that unregisters them and stops polling. Exported pairing constants retain their names and values. `tui.jsonc` is absent.
- **Attribution / identities:** task `T3`; consumed input identity is `T1`'s accepted dependency surface. Produced content identity is the post-edit hash of `tui.tsx`, `tui.test.ts` and the recorded `tui.jsonc` deletion. Relevant review scope: Bastion 🧱 (Backend & Scripts Architect) over `tui.tsx`; Crucible 🔥 (Test Architect) over `tui.test.ts`.
- **Parent handoff:** returns `AWAITING_REVIEW` with task identity `T3`, the changed paths, their content identity, the required owner gates, completed operations and current resource-use state. Author completion is not acceptance.

## Verify commands

| Executor | Command |
|---|---|
| Forge 🔨 (Implementer) | `pnpm --filter @coderelay/opencode-plugin test` |
| Forge 🔨 (Implementer) | `pnpm --filter @coderelay/opencode-plugin typecheck` |
| Forge 🔨 (Implementer) | `Test-Path tui.jsonc` |
| Forge 🔨 (Implementer) | `Select-String -Path packages\opencode-plugin\src\*.ts,packages\opencode-plugin\src\*.tsx,packages\opencode-plugin\package.json -Pattern "@opencode-ai"` |

- Executor authority note: `agents.crucible.permissions` in the root `opencode.jsonc` denies shell `*` and allows only `pnpm install`, `rg *`, `ls *`, `wc *` and read-only `git log/show/diff`, so Crucible 🔥 (Test Architect) cannot be declared the test executor. Forge 🔨 (Implementer) inherits global `shell: * allow`. Crucible 🔥 (Test Architect)'s test-architecture verdict remains a required gate.
- `rg` is not on PATH in agent shells, so these commands use PowerShell `Select-String` and `Test-Path`.
- Expected red is never the gate PASS: this phase requires final green and the applicable architecture verdicts.

## Gate

- ⬜ `pnpm --filter @coderelay/opencode-plugin test` exits 0 including `tui.test.ts`.
- ⬜ `pnpm --filter @coderelay/opencode-plugin typecheck` exits 0.
- ⬜ `Test-Path tui.jsonc` returns `False`, and `package.json` still exports `"./tui": "./src/tui.tsx"` so V2 auto-loads the CLI plugin.
- ⬜ `Select-String ... -Pattern "@opencode-ai"` over `packages/opencode-plugin` sources and manifest returns no match.
- ⬜ The pairing screen behaviour is unchanged: `coderelay.pair` / `CodeRelay: Pair device` / `CodeRelay` preserved; the QR is one cell per module and shrinks its quiet zone to fit; it falls back to the endpoint URL when the matrix cannot fit; the smallest fitting dialog tier is used; Esc clears the dialog, stops polling and drops the payload; the payload comes from the loopback routes and never from the one-time secret.
- ⬜ No stale wiring survives: the V1 `TuiPlugin`/`TuiPluginApi`/`TuiPluginModule` imports and the V1 `tui.jsonc` registration path are gone, and nothing references `tui.jsonc` as a live configuration source.
- ⬜ Bastion 🧱 (Backend & Scripts Architect) returned `[PASS]` or `[FAIL]` on `tui.tsx` and Crucible 🔥 (Test Architect) returned `[PASS]` or `[FAIL]` on `tui.test.ts`; `[UNCERTAIN]` is not acceptable and a `[FAIL]` blocks the gate.
- ⬜ Relevant content/dependencies stayed stable for review, identities/scope are recorded, and current applicable verdicts are accepted.
- ⬜ The parent accepted every relevant return and the combined candidate, keeping review/execution verdicts separate.

## Abort conditions

- Halt if the OpenTUI peer bump to `>=0.5.8` requires a change to `packages/opencode-plugin/tsconfig.json`, which is outside this phase's footprint. Report `BLOCKED` with the exact compiler error and bounded options.
- Halt if the V2 CLI plugin API cannot express one of the preserved behaviours — the palette command registration, the named route, the dialog tier selection, or the Esc-cancels-polls-drops-payload sequence. Report `BLOCKED` with the missing capability, the documentation consulted, and bounded options.
- Halt if removing `tui.jsonc` would break any other registration path. Inspect `opencode.jsonc`, `packages/opencode-plugin/package.json` and `~/.config/opencode/cli.json` first; report `BLOCKED` with what references it.
- Halt if preserving the exported pairing constants would require editing `gateway.ts`, `pairing.ts` or `packages/protocol/**`, all outside this footprint. Report `BLOCKED` with the exact conflict.
- Stop before any out-of-assignment write/mutation or incompatible access; report `BLOCKED` to the parent.
