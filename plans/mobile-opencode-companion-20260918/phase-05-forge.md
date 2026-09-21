# Phase 5 — Tests and device checklist

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phases 02 through 04 gates passed; protocol, plugin, and mobile sources exist.
> **Reads:** `packages/opencode-plugin/src/allowlist.ts`; `packages/opencode-plugin/src/pairing.ts`; `packages/opencode-plugin/src/gateway.ts`; `apps/mobile/src/modules/session/components/PermissionCard.tsx`; `apps/mobile/src/modules/pairing/components/QrScannerScreen.tsx`; `apps/mobile/src/modules/session/components/ChatScreen.tsx`
> **Writes:** apps/mobile/src/modules/pairing/components/QrScannerScreen.test.tsx; apps/mobile/src/modules/session/components/ChatScreen.test.tsx; apps/mobile/src/modules/session/components/PermissionCard.test.tsx; packages/opencode-plugin/src/reconnect.test.ts; packages/opencode-plugin/src/permission-policy.test.ts

## Steps

1. Write `packages/opencode-plugin/src/permission-policy.test.ts` proving the gateway maps only `once` and `reject`, drops `always`, and denies shell/file/auth actions.
2. Write `packages/opencode-plugin/src/reconnect.test.ts` proving a sequence gap returns a resync instruction and that a revoked device is refused after `revoke()`.
3. Write `QrScannerScreen.test.tsx` covering: camera permission not granted shows a request path; a valid QR calls pairing; an expired QR shows a failure and does not pair.
4. Write `ChatScreen.test.tsx` covering: a user message with the selected `sessionID` renders; a message for another session does not; abort control is present while status is busy.
5. Write `PermissionCard.test.tsx` covering: two actions Approve once and Reject; no Always control is rendered.
6. After each test file, wait for Crucible 🔥 (Test Architect) [PASS] or [FAIL]. Fix [FAIL]. [UNCERTAIN] does not pass this phase.
7. Cipher 🔓 (Lead Orchestrator) runs `pnpm exec turbo run test typecheck` after the test files pass architecture review.
8. Cipher 🔓 (Lead Orchestrator) records a physical Android checklist in the phase completion report, not in a new repo file: Tailscale connected remote path, same-Wi-Fi LAN path, custom URL path, QR expiry, revoke, reconnect after toggling the phone radio, PC-submitted message appears on the phone, permission approve-once and reject. Missing hardware is recorded as blocked, not as passed.

## Output

- **Artifact:** `packages/opencode-plugin/src/permission-policy.test.ts`
- **Schema / shape:** tests fail if `always` is accepted or if Always is rendered; turbo `test` and `typecheck` exit 0.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm exec turbo run test typecheck` |

## Gate

- ⬜ Verify command exits 0
- ⬜ Crucible 🔥 (Test Architect) [PASS] or [FAIL] on all five test files written this phase
- ⬜ Device checklist recorded as passed or explicitly blocked on missing hardware; never silently skipped

## Abort conditions

- Halt if tests require a new test runner not approved by Warden 🔒 (Dependency Warden)
- Halt if device-checklist failures on available hardware are ignored
- Halt if any test mocks away the allowlist so denied APIs appear to succeed
