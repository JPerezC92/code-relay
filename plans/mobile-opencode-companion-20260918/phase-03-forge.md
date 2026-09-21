# Phase 3 — OpenCode plugin gateway and TUI

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phase 02 gate passed; `@coderelay/protocol` exports parseable pairing, events, and actions.
> **Reads:** `packages/protocol/src/index.ts`; https://opencode.ai/docs/plugins ; https://opencode.ai/docs/server ; https://opencode.ai/docs/permissions
> **Writes:** packages/opencode-plugin/package.json; packages/opencode-plugin/src/index.ts; packages/opencode-plugin/src/gateway.ts; packages/opencode-plugin/src/pairing.ts; packages/opencode-plugin/src/endpoints.ts; packages/opencode-plugin/src/crypto.ts; packages/opencode-plugin/src/allowlist.ts; packages/opencode-plugin/src/tui.ts; packages/opencode-plugin/src/gateway.test.ts; packages/opencode-plugin/src/pairing.test.ts; packages/opencode-plugin/src/allowlist.test.ts; packages/opencode-plugin/src/endpoints.test.ts

## Steps

1. Write `packages/opencode-plugin/src/allowlist.ts` that maps protocol actions to OpenCode SDK calls: `session.list`, `session.status`, `session.messages`, `session.promptAsync`, `session.abort`, and permission reply body `{ response: "once" | "reject" }` only. Any other path returns a typed deny error.2. Write `packages/opencode-plugin/src/crypto.ts` implementing the protocol crypto interfaces with `node:crypto`: AES-256-GCM (12-byte nonce, 16-byte tag) and an X25519 key-agreement identity (`generateKeyPairSync('x25519')`, `diffieHellman`) plus HKDF-SHA256 session-key derivation from the ECDH shared secret, the one-time secret as salt, and the transcript as info. Replace the Ed25519 host-signature scheme.
3. Write `packages/opencode-plugin/src/endpoints.ts` `detectEndpoints()`: collect IPv4 addresses from `os.networkInterfaces()` excluding internals `127.0.0.1` and `0.0.0.0`; if a `tailscale` binary exists, run `tailscale ip -4` and optionally read MagicDNS name from `tailscale status --json`; never run `tailscale up`, `tailscale serve`, or any configure command. Return `{ kind: "lan" | "tailscale" | "custom", url: string }[]`.
4. Write `packages/opencode-plugin/src/pairing.ts`: create a 256-bit one-time secret, store only its hash, expire in 120 seconds, invalidate on first successful pair or on a transcript/AEAD/hash failure (a wrong `pairingId` does not burn the pairing), bind one device slot, and expose `revoke()`. The pairing acceptance decrypts the device's sealed one-time secret (AES-GCM under a pairing key derived from ECDH + HKDF), compares it to the stored hash in constant time, binds the device's X25519 public key, and returns a sealed confirmation under the derived session key.
5. Write `packages/opencode-plugin/src/gateway.ts`: listen on port 47821 on non-loopback interfaces selected for pairing; keep OpenCode SDK traffic on localhost; require pairing then session encryption for every request; subscribe to OpenCode events via the plugin `event` hook and enqueue only allowlisted names; on sequence gap, tell the device to refetch `session.messages` rather than replay speculative state. `dispose` stops the HTTP listener.
6. Write `packages/opencode-plugin/src/index.ts` as the server `Plugin` default export that starts the gateway on load and returns `event` and `dispose` hooks plus a `coderelay_pair` tool that returns current pairing status, never the raw one-time secret after first display.
7. Write `packages/opencode-plugin/src/tui.ts` as the TUI entry: a pairing view listing detected endpoints, a custom URL field, a test-selection action, QR rendering of the JSON payload, countdown to `expiresAt`, and connected/waiting/revoked status. Selecting endpoints must not call networking-vendor CLIs other than the read-only detect commands in step 3.
8. Update `packages/opencode-plugin/package.json` dependencies on `@coderelay/protocol`, `@opencode-ai/plugin` `1.18.31`, and `@opencode-ai/sdk` `1.18.31` only if those versions were approved in phase 01.
9. Write tests: allowlist denies shell/file/auth; pairing secret cannot be reused; detectEndpoints does not invoke `tailscale serve`; gateway drops unknown events.
10. After each non-test file, wait for the architecture auditor dispatch. After each test file, wait for Crucible 🔥 (Test Architect) [PASS] or [FAIL].

## Output

- **Artifact:** `packages/opencode-plugin/src/index.ts`
- **Schema / shape:** default server plugin export; TUI export at `./tui`; gateway bound to port 47821; pairing secret hashed; no vendor configure commands.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/opencode-plugin test` |

## Gate

- ⬜ Verify command exits 0
- ⬜ Grep of `packages/opencode-plugin/src` finds no `tailscale serve`, `tailscale up`, or `cloudflared`
- ⬜ Crucible 🔥 (Test Architect) [PASS] or [FAIL] on the four plugin test files written this phase

## Abort conditions

- Halt if the plugin proxies OpenCode `/session/:id/shell` or `/file`
- Halt if TUI automation writes Tailscale or tunnel configuration
- Halt if a second device can pair without `revoke()`
