# Phase 2 — Protocol package

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phase 01 gate passed; `@coderelay/protocol` stub exists; Warden 🔒 (Dependency Warden) approved `zod` if used.
> **Reads:** `packages/protocol/package.json`; `packages/protocol/src/index.ts`; https://opencode.ai/docs/server ; https://opencode.ai/docs/plugins
> **Writes:** packages/protocol/package.json; packages/protocol/src/index.ts; packages/protocol/src/envelope.ts; packages/protocol/src/pairing.ts; packages/protocol/src/events.ts; packages/protocol/src/actions.ts; packages/protocol/src/crypto.ts; packages/protocol/src/envelope.test.ts; packages/protocol/src/pairing.test.ts; packages/protocol/src/crypto.test.ts

## Steps

1. Replace `packages/protocol/src/envelope.ts` with versioned codec types: `version: 1`, `direction` of `host-to-device` or `device-to-host`, monotonic `sequence`, `pairingId`, ciphertext blob fields `nonce`, `ciphertext`, `tag`.
2. Write `packages/protocol/src/pairing.ts` with: a QR payload type with keys `version`, `endpoints` (array of URLs), `pairingId`, `oneTimeSecret`, `hostPublicKey` (host X25519 public key, base64 of 32 bytes), `expiresAt`; a pairing request type `{ version, pairingId, devicePublicKey, sealedSecret: { nonce, ciphertext, tag } }`; and a pairing complete response `{ version, pairingId, deviceCredentialId, sealedConfirmation: { nonce, ciphertext, tag } }` (strict, never carrying the one-time secret). The one-time secret is 32 bytes.
3. Write `packages/protocol/src/events.ts` allowing only `session.created`, `session.updated`, `session.deleted`, `session.status`, `session.idle`, `session.error`, `message.updated`, `message.part.updated`, `message.part.removed`, `message.removed`, `permission.asked`, `permission.replied`, `question.asked`, `question.replied`. Unknown event names are dropped, not forwarded as raw OpenCode payloads.
4. Write `packages/protocol/src/actions.ts` allowing only `session.list`, `session.status`, `session.messages`, `session.prompt`, `session.abort`, `permission.reply` with `decision` of `once` or `reject`. `session.prompt` is the protocol action name; the host maps it to the OpenCode SDK `session.promptAsync` in phase 03. Reject any `always` or `remember` field at the type and runtime parse layer.
5. Write `packages/protocol/src/crypto.ts` as a platform-neutral interface: (a) `encrypt` / `decrypt` AES-256-GCM, 12-byte nonce, 16-byte tag, AAD = `version | pairingId | direction | sequence`; (b) an X25519 key-agreement interface `generateKeyPair()` and `deriveSharedSecret(privateKey, peerPublicKey)`; (c) an HKDF-SHA256 key-derivation description with `pairingKey` info and `sessionKey` info, where the session key is derived from the ECDH shared secret with the one-time secret as salt and a transcript (`version|pairingId|hostPublicKey|devicePublicKey`) as info. No Node or Expo imports in this file.
6. Export those modules from `packages/protocol/src/index.ts`. Update `packages/protocol/package.json` `exports` to `.` -> `./src/index.ts`.
7. Write `envelope.test.ts`, `pairing.test.ts`, and `crypto.test.ts` covering: QR expiry parse failure, replay of a used sequence, reject of `always`, one AES-256-GCM round-trip using a test double of the crypto interface, the X25519 ECDH shared-secret agreement via a two-party test double, and that the session-key transcript changes when the device public key changes.
8. After each non-test TypeScript file, wait for Cipher 🔓 (Lead Orchestrator) to dispatch the architecture auditor. Protocol code is shared TS, not NestJS and not React Native; if Bastion 🧱 (Backend & Scripts Architect) returns [UNCERTAIN], Cipher 🔓 (Lead Orchestrator) records that and continues only when the types match this runbook.
9. After each `*.test.ts` file, wait for Crucible 🔥 (Test Architect) [PASS] or [FAIL]. Fix [FAIL]. Do not accept [UNCERTAIN] for these test files.

## Output

- **Artifact:** `packages/protocol/src/index.ts`
- **Schema / shape:** named exports for envelope, pairing, events, actions, and crypto interface; no Node/Expo imports; `always` cannot be parsed as a permission decision.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/protocol test` |

## Gate

- ⬜ Verify command exits 0
- ⬜ Crucible 🔥 (Test Architect) [PASS] or [FAIL] on the three protocol test files; [UNCERTAIN] does not pass
- ⬜ `packages/protocol/src/crypto.ts` has no `node:`, `expo-`, or `react-native` import

## Abort conditions

- Halt if Forge 🔨 (Implementer) adds undeclared dependencies
- Halt if the protocol allows `always` permission replies
- Halt if QR payload includes Tailscale auth keys, OpenCode passwords, or provider API keys
