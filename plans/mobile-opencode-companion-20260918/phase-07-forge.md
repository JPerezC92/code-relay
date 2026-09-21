# Phase 7 — SDK result normalization and test seam correction

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phase 06 automated gates and Bastion 🧱 (Backend & Scripts Architect) / Crucible 🔥 (Test Architect) audits passed; live Android evidence shows `Host session list was malformed` after a successful pairing.
> **Reads:** `packages/opencode-plugin/src/allowlist.ts`; `packages/opencode-plugin/src/gateway.ts`; `packages/opencode-plugin/src/allowlist.test.ts`; `packages/opencode-plugin/src/gateway.test.ts`; `packages/opencode-plugin/src/permission-policy.test.ts`; `packages/opencode-plugin/src/reconnect.test.ts`; `apps/mobile/src/modules/session/services/session.service.ts`; installed `@opencode-ai/sdk` result types under `node_modules/.pnpm/@opencode-ai+sdk@1.18.31/**`
> **Writes:** packages/opencode-plugin/src/allowlist.ts; packages/opencode-plugin/src/allowlist.test.ts; packages/opencode-plugin/src/gateway.test.ts; packages/opencode-plugin/src/permission-policy.test.ts; packages/opencode-plugin/src/reconnect.test.ts

## Steps

1. In `packages/opencode-plugin/src/allowlist.ts`, model the OpenCode SDK field-style result structurally (`data`, `error`) at the SDK boundary instead of weakening all methods to `Promise<unknown>`; retain parameter types derived from `OpencodeClient`.
2. Normalize each allowlisted SDK result before creating `AllowedActionResult`: return its `data` as `value`; return `AllowlistError` when `error` is present or `data` is absent. Do not forward the SDK request/response wrapper across the encrypted CodeRelay boundary.
3. Preserve the exact allowlist: only `session.list`, `session.status`, `session.messages`, `session.promptAsync`, `session.abort`, and `postSessionIdPermissionsPermissionId` may execute. `once` / `reject` remain the only permission decisions.
4. Update every `OpenCodeClientLike` mock in `allowlist.test.ts`, `gateway.test.ts`, `permission-policy.test.ts`, and `reconnect.test.ts` to the real SDK field result shape (`{ data, error: undefined, request, response }`), so no raw-result fake masks the production contract. In `allowlist.test.ts`, prove `session.list`, `session.status`, and `session.messages` return their raw `data`; error or missing-data wrappers return `AllowlistError` rather than becoming action values.
5. Update `gateway.test.ts` so an encrypted `session.list` envelope contains `result.value` as the raw session array, never the SDK wrapper. Keep existing replay, renew, loopback, and secret-lifecycle coverage intact.
6. Replace every `as unknown as` fake Node HTTP request, response, and server in `gateway.test.ts` and `reconnect.test.ts` with typed structural test seams. Preserve the existing runtime behavior and deterministic completion semantics; do not introduce production abstractions, unsafe casts, or new files.
7. Wait for Bastion 🧱 (Backend & Scripts Architect) [PASS] on `allowlist.ts` and Crucible 🔥 (Test Architect) [PASS] or [FAIL] on all four wrapper test suites and the corrected HTTP seams; fix every [FAIL].
8. Cipher 🔓 (Lead Orchestrator) runs `pnpm exec turbo run test typecheck`; the user reloads the Android app or retries session loading and records whether the session list appears instead of `Host session list was malformed`.

## Output

- **Artifacts:** `packages/opencode-plugin/src/allowlist.ts`; typed HTTP test seams in `gateway.test.ts` and `reconnect.test.ts`
- **Schema / shape:** allowlisted calls accept the SDK field-style response wrapper only at the host boundary; CodeRelay action results expose validated raw `data` or a typed `AllowlistError`; no SDK request/response metadata crosses to mobile. Tests use structural request/response/server fakes without unsafe casts.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/opencode-plugin typecheck && pnpm --filter @coderelay/opencode-plugin test` |
| Cipher 🔓 (Lead Orchestrator) | `pnpm exec turbo run test typecheck` |

## Gate

- ✅ Verify commands exit 0 — 2026-09-19: plugin typecheck plus 109 tests; Turbo 6/6 tasks
- ✅ Bastion 🧱 (Backend & Scripts Architect) [PASS] on `allowlist.ts` — 2026-09-19
- ✅ Crucible 🔥 (Test Architect) [PASS] on `allowlist.test.ts`, `gateway.test.ts`, `permission-policy.test.ts`, and `reconnect.test.ts` — 2026-09-19; typed HTTP seams and response completion re-audited
- ⬜ Manual Android retry recorded — the paired phone receives a session list, not `Host session list was malformed` — or explicitly blocked with evidence

## Abort conditions

- Halt if SDK type inspection contradicts the verified field-style `{ data, error, request, response }` response contract
- Halt if result normalization would broaden the allowlist or expose an SDK request/response object to mobile
- Halt if a test bypasses the real wrapper shape with raw-array mocks
- Halt if the mobile parser must accept SDK wrappers rather than the host adapter returning raw data
- Halt if a typed test seam would change production HTTP contracts or require production code changes
