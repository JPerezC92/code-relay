# Phase 4 — Expo Android companion

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phase 03 gate passed; QR payload schema is exported from `@coderelay/protocol`.
> **Reads:** `packages/protocol/src/pairing.ts`; `packages/protocol/src/actions.ts`; https://docs.expo.dev/versions/latest/sdk/camera/ ; https://opencode.ai/docs/sdk
> **Writes:** apps/mobile/package.json; apps/mobile/app.json; apps/mobile/App.tsx; apps/mobile/src/modules/pairing/domain/entities/pairing.ts; apps/mobile/src/modules/pairing/domain/errors/pairing-service.error.ts; apps/mobile/src/modules/pairing/services/pairing.service.ts; apps/mobile/src/modules/pairing/hooks/use-pairing.ts; apps/mobile/src/modules/pairing/components/QrScannerScreen.tsx; apps/mobile/src/modules/session/domain/entities/session.ts; apps/mobile/src/modules/session/domain/errors/session-service.error.ts; apps/mobile/src/modules/session/services/session.service.ts; apps/mobile/src/modules/session/hooks/use-session.ts; apps/mobile/src/modules/session/components/ChatScreen.tsx; apps/mobile/src/modules/session/components/PermissionCard.tsx; apps/mobile/src/shared/crypto/aes-gcm.ts; apps/mobile/src/shared/transport/gateway-client.ts

## Steps

1. Update `apps/mobile/app.json` plugin `expo-camera` with `barcodeScannerEnabled: true` and camera permission string `Allow CodeRelay to scan the OpenCode pairing QR` only after that package was approved in phase 01. Do not set Android `usesCleartextTraffic` true.
2. Write `apps/mobile/src/shared/crypto/aes-gcm.ts` using `expo-crypto` to implement the protocol crypto interface (AES-256-GCM, 12-byte nonce, 16-byte tag).
3. Write `apps/mobile/src/shared/transport/gateway-client.ts` that tries QR `endpoints` in order, completes pairing over HTTP POST with the one-time secret and the device public key, stores the resulting device credential in `expo-secure-store`, then sends and receives encrypted envelopes. On disconnect, reconnect and refetch `session.messages`. Never log the one-time secret.
4. Write `PairingServiceError` in `apps/mobile/src/modules/pairing/domain/errors/pairing-service.error.ts` with `this.name = 'PairingServiceError'`.
5. Write `pairing.service.ts` as a plain object that scans no camera itself; it parses QR JSON with protocol types, calls `gateway-client`, and returns `T | PairingServiceError`. Import pairing types from `@coderelay/protocol`, not local duplicates. Return `Promise<...>`; do not use JSend helpers.
6. Write `use-pairing.ts` hook wrapping that service for the scanner screen.
7. Write `QrScannerScreen.tsx` using `CameraView` with `barcodeScannerSettings={{ barcodeTypes: ["qr"] }}` and `onBarcodeScanned`. Unmount the camera when leaving the screen.
8. Write `SessionServiceError` and `session.service.ts` for allowlisted actions only: list sessions, fetch messages, subscribe to events, `session.prompt`, `session.abort`, `permission.reply` with `once` or `reject`. The service must strip any UI attempt to send `always`.
9. Write `use-session.ts`, `ChatScreen.tsx`, and `PermissionCard.tsx`. Chat shows user and assistant text from `message.updated` / `message.part.updated` for the selected `sessionID`. Permission card has two buttons: Approve once and Reject.
10. Replace `apps/mobile/App.tsx` to show `QrScannerScreen` until paired, then `ChatScreen`. Use React Native `StyleSheet`, `Text`, `View`, `Button`. Do not add `sonner` or web Dialog packages.
11. After every non-test TS/TSX file, wait for Atrium 🏛️ (Frontend Architect). Cipher 🔓 (Lead Orchestrator) marks web-only findings (sonner, Tailwind delete classes, JSend `parseJsendData`) as not applicable when the file is React Native and already uses protocol schemas.
12. Do not run `pnpm install`; if a new native module is required, stop and report to Cipher 🔓 (Lead Orchestrator).

## Output

- **Artifact:** `apps/mobile/App.tsx`
- **Schema / shape:** unpaired app opens QR scanner; paired app shows session chat with abort and two-choice permissions; credentials live in SecureStore.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/mobile typecheck` |

## Gate

- ⬜ Verify command exits 0
- ⬜ Atrium 🏛️ (Frontend Architect) [PASS], or Cipher 🔓 (Lead Orchestrator) recorded adjudication for web-only rules that do not apply to React Native
- ⬜ `apps/mobile` source has no `always` permission decision string and no `usesCleartextTraffic`

## Abort conditions

- Halt if the app talks to OpenCode port 4096 instead of the CodeRelay gateway
- Halt if camera or crypto packages are added without Warden 🔒 (Dependency Warden) approval
- Halt if pairing secrets are logged or stored in AsyncStorage
