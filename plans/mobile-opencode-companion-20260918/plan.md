# Plan — Mobile OpenCode companion

> **Status:** active
> **Started:** 2026-09-18 02:55
> **Subject:** Turborepo Expo Android app and OpenCode QR-pairing plugin
> **Layout:** subfolder pattern

## Context

- Prompted by: the user asked for a full-TypeScript Turborepo with an Expo Android app and an OpenCode plugin that generates a QR code so a phone can connect to the running OpenCode session.
- Goal: ship a Linux-first MVP where one Android phone pairs to one host and can chat and supervise the same session.
- Outcome: a pnpm/Turborepo workspace with a shared protocol, an OpenCode plugin gateway plus TUI pairing screen, and an Expo Android companion. Execution waits for explicit user authorization.

Official contracts used: OpenCode server multiple-client architecture and `GET /event` SSE at https://opencode.ai/docs/server ; session history, `prompt_async`, and permission reply at the same page; plugin events including `message.updated`, `message.part.updated`, `permission.asked`, and `permission.replied` at https://opencode.ai/docs/plugins ; SDK `event.subscribe()` at https://opencode.ai/docs/sdk ; permission outcomes `once` / `always` / `reject` at https://opencode.ai/docs/permissions ; Expo monorepos at https://docs.expo.dev/guides/monorepos/ ; Turborepo `apps/*` plus `packages/*` at https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository.

## Goals

- ⬜ **G1:** A pnpm/Turborepo workspace builds, type-checks, and tests an Expo Android app, an OpenCode plugin package, and a platform-neutral protocol package entirely in TypeScript.
  - Done when: `pnpm exec turbo run typecheck test` exits 0 from the repo root against those three packages.
- ⬜ **G2:** The OpenCode TUI pairing screen starts the CodeRelay gateway, detects LAN and Tailscale addresses, accepts custom endpoints, validates the selected endpoint, and displays a short-lived QR without configuring external networking services.
  - Done when: the pairing screen can show at least one detected endpoint or a custom URL, render a QR that expires, and never invokes Tailscale Serve, tunnel, DNS, or router commands.
- ⬜ **G3:** One Android device can pair with one Linux host through a single-use credential and communicate over an authenticated, replay-resistant, end-to-end encrypted protocol, with reconnect and host-side revocation.
  - Done when: a pairing secret is one-use and time-bounded, subsequent payloads use AES-256-GCM with a 12-byte nonce and 16-byte tag, reconnect resynchronizes from session history, and the host can revoke the phone.
- ⬜ **G4:** The Android app first selects a project, including a project with no root sessions, then lists only that project's root/main sessions, follows the selected session's message and status updates, sends prompts, aborts a run, and answers permission requests with only approve-once or reject.
  - Done when: picker results exclude every session with `parentID`, zero-root projects remain selectable and visibly empty, project/session ordering is recent-first, all six operations route through the host-owned project context, and the phone receives no host paths, OpenCode `always` replies, or shell/file/auth APIs.
- ⬜ **G5:** Automated protocol, plugin, and mobile tests plus a physical Android integration checklist verify pairing, reconnect, endpoint switching, permission safety, QR expiry, revocation, and failure behavior.
  - Done when: the new test files pass under turbo and the phase-05 gate records the device checklist results for those cases.

## Current state

| Area | Current file / behavior | Evidence (file + line / command output) |
|---|---|---|
| Product workspace | No root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/`, or `packages/` | Explore report: those paths are absent from `/home/dexm76/projects-personal/CodeRelay/` |
| Mobile / plugin code | No Expo app, no `.opencode/plugins/`, no QR pairing source | Explore report: no Expo, Android, React Native, or plugin registration |
| User stories | Only AICore adoption exists; no mobile companion story | `user-stories/index.md:3-5` before this plan; new story added at plan creation |
| OpenCode config | Project `opencode.jsonc` has no `plugin` array | `opencode.jsonc` has models, permissions, MCP; no plugin entry |
| Local plugin SDK | Ignored `.opencode/package.json` depends on `@opencode-ai/plugin` 1.18.30 | `.opencode/package.json` dependency line; not a tracked product workspace |
| Git gate | Live main `cb4b6cea391c4b7ca8a523e8b868f2eb6b53073e`; no stash | Herald 📯 (Release Manager) read-only inventory this session |

## Behavior change

| Goal | Before | After | Interface contracts | Do-not-break |
|---|---|---|---|---|
| G1 | Repo is governance-only, no JS workspace | Root pnpm/Turborepo workspace with `apps/mobile`, `packages/protocol`, `packages/opencode-plugin`, `packages/typescript-config` | Root `package.json` scripts `build`, `dev`, `lint`, `typecheck`, `test`; workspace globs `apps/*` and `packages/*` | Existing Python skill scripts and `.opencode/` agent specs stay |
| G2 | No pairing UI | OpenCode TUI pairing route/tool starts a loopback-plus-bound gateway and shows a QR | Plugin exports server entry `.` and TUI entry `./tui`; default listen port 47821 | No writes to this repo's `opencode.jsonc` |
| G3 | No pairing protocol | Version-1 QR envelope, X25519 handshake with a sealed one-time secret, AES-256-GCM session traffic, host-side revoke | QR JSON keys `version`, `endpoints`, `pairingId`, `oneTimeSecret`, `hostPublicKey`, `expiresAt` | Tailscale/VPN apps remain user-owned |
| G4 | No Android client | Expo app scans QR, stores device credential, chats and supervises one session | Allowlisted host ops: session list/status/messages, `prompt_async`, abort, permission `once` or `reject` | OpenCode file, shell, auth, and config APIs stay host-local |
| G5 | No product tests | Package tests plus a device checklist for pairing and failure paths | Test files listed in phase-05 Writes | No new test framework beyond what Warden 🔒 (Dependency Warden) approves for the workspace |

## Design decisions

- pnpm + Turborepo + Expo — requested by the user; Expo documents first-class workspace support and Turborepo documents `apps/*` and `packages/*` (simplest alternative considered: npm workspaces without Turbo, rejected because the user asked for Turborepo).
- Product TypeScript only — existing governance Python remains (simplest alternative considered: rewrite Python validators, rejected as out of scope).
- No `packages/cli` — endpoint detection and QR live in the OpenCode plugin TUI (simplest alternative considered: a separate CLI package, rejected as extra surface for G2).
- Provider-neutral endpoints — detect LAN via `os.networkInterfaces()`, detect Tailscale via `tailscale ip -4` only when the binary exists, accept a custom URL; never run `tailscale serve` or tunnel commands (simplest alternative considered: automate Tailscale Serve, rejected because the user wants CodeRelay unattached to one vendor).
- Encrypted application protocol on possibly-cleartext transports — AES-256-GCM, 12-byte nonce, 16-byte tag, AAD bound to protocol version, host/device ids, direction, and sequence (simplest alternative considered: HTTPS-only MVP, rejected because the user chose encrypted LAN).
- Plugin gateway in front of OpenCode — phone never talks to the full OpenCode server (simplest alternative considered: expose OpenCode HTTP/SSE directly, rejected because that API includes shell, files, and auth).
- Permission policy enforced on the host — map mobile approve-once to OpenCode `once` and reject to `reject`; drop `always` / `remember` (simplest alternative considered: pass through all three UI outcomes, rejected as too much standing authority).
- One host, one phone — overwrite or refuse a second pairing until revoke (simplest alternative considered: multi-device from day one, rejected as MVP bloat).
- Linux host first, Android only — no iOS, macOS, or Windows host work (simplest alternative considered: all desktop OSes, rejected as unvalidated).
- Hoisted pnpm `node-linker` — Expo/React Native duplicate-native-module risk (simplest alternative considered: isolated installs, rejected for the first native app until proven).
- Atrium 🏛️ (Frontend Architect) web-only rules (sonner, Tailwind delete classes, JSend) are inapplicable to React Native; services still follow layering, `{Feature}ServiceError`, kebab-case `use-{feature}.ts`, and shared protocol types. Cipher 🔓 (Lead Orchestrator) adjudicates those web-only [FAIL] items as not applicable.
- Cut hosted relay, EAS, `PRODUCT.md` / `DESIGN.md`, and Lumen ✨ (Visual Director) until those docs exist.

## Write/delete manifest

| Action | Path |
|---|---|
| Add | `package.json` |
| Add | `pnpm-workspace.yaml` |
| Add | `pnpm-lock.yaml` |
| Add | `.npmrc` |
| Add | `turbo.json` |
| Modify | `.gitignore` |
| Add | `.env.example` |
| Add | `packages/typescript-config/package.json` |
| Add | `packages/typescript-config/base.json` |
| Add | `packages/protocol/package.json` |
| Add | `packages/protocol/tsconfig.json` |
| Add | `packages/protocol/src/index.ts` |
| Add | `packages/protocol/src/envelope.ts` |
| Add | `packages/protocol/src/pairing.ts` |
| Add | `packages/protocol/src/events.ts` |
| Add | `packages/protocol/src/actions.ts` |
| Add | `packages/protocol/src/crypto.ts` |
| Add | `packages/protocol/src/envelope.test.ts` |
| Add | `packages/protocol/src/pairing.test.ts` |
| Add | `packages/protocol/src/crypto.test.ts` |
| Add | `packages/opencode-plugin/package.json` |
| Add | `packages/opencode-plugin/tsconfig.json` |
| Add | `packages/opencode-plugin/src/index.ts` |
| Add | `packages/opencode-plugin/src/gateway.ts` |
| Add | `packages/opencode-plugin/src/pairing.ts` |
| Add | `packages/opencode-plugin/src/endpoints.ts` |
| Add | `packages/opencode-plugin/src/crypto.ts` |
| Add | `packages/opencode-plugin/src/allowlist.ts` |
| Add | `packages/opencode-plugin/src/tui.tsx` |
| Delete | `packages/opencode-plugin/src/tui.ts` |
| Add | `packages/opencode-plugin/src/tui.test.ts` |
| Modify | `packages/opencode-plugin/src/gateway.ts` |
| Modify | `packages/opencode-plugin/src/index.ts` |
| Modify | `packages/opencode-plugin/src/gateway.test.ts` |
| Modify | `packages/opencode-plugin/tsconfig.json` |
| Modify | `packages/opencode-plugin/package.json` |
| Add | `tui.jsonc` |
| Add | `packages/opencode-plugin/src/gateway.test.ts` |
| Add | `packages/opencode-plugin/src/pairing.test.ts` |
| Add | `packages/opencode-plugin/src/allowlist.test.ts` |
| Add | `packages/opencode-plugin/src/endpoints.test.ts` |
| Add | `packages/opencode-plugin/src/reconnect.test.ts` |
| Add | `packages/opencode-plugin/src/permission-policy.test.ts` |
| Add | `apps/mobile/package.json` |
| Add | `apps/mobile/app.json` |
| Add | `apps/mobile/tsconfig.json` |
| Add | `apps/mobile/babel.config.js` |
| Add | `apps/mobile/index.ts` |
| Add | `apps/mobile/App.tsx` |
| Add | `apps/mobile/src/modules/pairing/domain/entities/pairing.ts` |
| Add | `apps/mobile/src/modules/pairing/domain/errors/pairing-service.error.ts` |
| Add | `apps/mobile/src/modules/pairing/services/pairing.service.ts` |
| Add | `apps/mobile/src/modules/pairing/hooks/use-pairing.ts` |
| Add | `apps/mobile/src/modules/pairing/components/QrScannerScreen.tsx` |
| Add | `apps/mobile/src/modules/session/domain/entities/session.ts` |
| Add | `apps/mobile/src/modules/session/domain/errors/session-service.error.ts` |
| Add | `apps/mobile/src/modules/session/services/session.service.ts` |
| Add | `apps/mobile/src/modules/session/hooks/use-session.ts` |
| Add | `apps/mobile/src/modules/session/components/ChatScreen.tsx` |
| Add | `apps/mobile/src/modules/session/components/PermissionCard.tsx` |
| Add | `apps/mobile/src/shared/crypto/aes-gcm.ts` |
| Add | `apps/mobile/src/shared/transport/gateway-client.ts` |
| Add | `apps/mobile/src/modules/pairing/components/QrScannerScreen.test.tsx` |
| Add | `apps/mobile/src/modules/session/components/ChatScreen.test.tsx` |
| Add | `apps/mobile/src/modules/session/components/PermissionCard.test.tsx` |
| Add | `packages/opencode-plugin/src/session-catalog.ts` |
| Add | `packages/opencode-plugin/src/session-catalog.test.ts` |
| Modify | `packages/opencode-plugin/src/index.ts` |
| Modify | `packages/opencode-plugin/src/gateway.ts` |
| Modify | `packages/opencode-plugin/src/allowlist.ts` |
| Modify | `packages/opencode-plugin/src/allowlist.test.ts` |
| Modify | `packages/opencode-plugin/src/gateway.test.ts` |
| Modify | `packages/opencode-plugin/src/reconnect.test.ts` |
| Modify | `apps/mobile/src/modules/session/domain/entities/session.ts` |
| Modify | `apps/mobile/src/modules/session/services/session.service.ts` |
| Add | `apps/mobile/src/modules/session/services/session.service.test.ts` |
| Modify | `apps/mobile/src/modules/session/hooks/use-session.ts` |
| Modify | `apps/mobile/src/modules/session/components/ChatScreen.tsx` |
| Modify | `apps/mobile/src/modules/session/components/ChatScreen.test.tsx` |
| Modify | `plans/mobile-opencode-companion-20260918/plan.md` |
| Modify | `user-stories/mobile-opencode-companion.md` |
| Modify | `knowledge/debt.md` |

## Phase index — dispatch table

| # | Phase | Owner | Runbook | Output | Goals |
|---|---|---|---|---|---|
| 1 | Workspace bootstrap | Cipher 🔓 (Lead Orchestrator) | `phase-01-cipher.md` | `package.json` | G1 |
| 2 | Protocol package | Forge 🔨 (Implementer) | `phase-02-forge.md` | `packages/protocol/src/index.ts` | G3 |
| 3 | OpenCode plugin gateway and TUI | Forge 🔨 (Implementer) | `phase-03-forge.md` | `packages/opencode-plugin/src/index.ts` | G2 G3 |
| 4 | Expo Android companion | Forge 🔨 (Implementer) | `phase-04-forge.md` | `apps/mobile/App.tsx` | G3 G4 |
| 5 | Tests and device checklist | Forge 🔨 (Implementer) | `phase-05-forge.md` | `packages/opencode-plugin/src/permission-policy.test.ts` | G5 |
| 6 | TUI pairing modal correction | Forge 🔨 (Implementer) | `phase-06-forge.md` | `packages/opencode-plugin/src/tui.tsx` | G2 |
| 7 | SDK result normalization and test seam correction | Forge 🔨 (Implementer) | `phase-07-forge.md` | `packages/opencode-plugin/src/allowlist.ts` | G4 |
| 8 | Project-first root session navigation | Forge 🔨 (Implementer) | `phase-08-forge.md` | `packages/opencode-plugin/src/session-catalog.ts` | G4 G5 |
| 9 | TUI pairing status resolution | Forge 🔨 (Implementer) | `phase-09-forge.md` | `packages/opencode-plugin/src/tui.tsx` | G2 G3 |
| 10 | Revocation queue and audit-debt correction | Forge 🔨 (Implementer) | `phase-10-forge.md` | `packages/opencode-plugin/src/gateway.ts` | G3 G5 |
| 11 | Chat screen safe-area layout correction | Forge 🔨 (Implementer) | `phase-11-forge.md` | `apps/mobile/App.tsx` | G4 |

## Critical files / tools

- User story: `user-stories/mobile-opencode-companion.md`
- OpenCode server docs: https://opencode.ai/docs/server
- OpenCode plugin docs: https://opencode.ai/docs/plugins
- OpenCode SDK docs: https://opencode.ai/docs/sdk
- OpenCode permissions docs: https://opencode.ai/docs/permissions
- Expo monorepo docs: https://docs.expo.dev/guides/monorepos/
- Expo Camera QR: https://docs.expo.dev/versions/latest/sdk/camera/
- Turborepo structure: https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository
- Pin `@opencode-ai/plugin` and `@opencode-ai/sdk` to `1.18.31` after Warden 🔒 (Dependency Warden) approval

## Verification

- ✅ Phase 01: `test -f package.json -a -f pnpm-workspace.yaml -a -f turbo.json -a -f pnpm-lock.yaml` → exit 0 (verified; Warden manifests [APPROVE], lockfile [ADVISORY] F1–F3, staging hold recorded)
- ✅ Phase 02: `pnpm --filter @coderelay/protocol test` → exit 0 (26 tests pass; Crucible [PASS]; Bastion [UNCERTAIN] recorded — shared library out of NestJS zone)
- ✅ Phase 03: `pnpm --filter @coderelay/opencode-plugin test` → exit 0 (42 tests pass; Crucible [PASS]; Bastion [PASS]; grep gate clean)
- ✅ Phase 04: `pnpm --filter @coderelay/mobile typecheck` → exit 0 (Atrium [PASS]; gate greps clean; entities moved to `domain/entities/`)
- ✅ Phase 05: `pnpm exec turbo run test typecheck` → exit 0 (6/6 tasks; plugin 74, mobile 9; Crucible [PASS]; device checklist BLOCKED — no Android hardware/Tailscale in this environment)
- ✅ Phase 06: `pnpm --filter @coderelay/opencode-plugin typecheck && pnpm --filter @coderelay/opencode-plugin test` and `pnpm exec turbo run test typecheck` → exit 0 (plugin 106/106, Turbo 6/6, Bastion [PASS], Crucible [PASS]; manual Ctrl+P confirmed by repeated device use, 2026-09-21)
- ✅ Phase 07: `pnpm --filter @coderelay/opencode-plugin typecheck && pnpm --filter @coderelay/opencode-plugin test` and `pnpm exec turbo run test typecheck` → exit 0 (verified 2026-09-19: plugin 109/109; Turbo 6/6; SDK wrappers normalize to raw data; typed HTTP test seams; Bastion [PASS]; Crucible [PASS]; manual Android session-list retry confirmed via Phase-08 device use, 2026-09-21)
- ✅ Phase 08: project-first root-session navigation → automated work verified 2026-09-21 (safe opaque `{ projects, sessions }` catalog including selectable zero-root projects; host-only routing; picker hierarchy, selected state, 44px targets, light-appearance pin, auto-scroll with reduced-motion handling; plugin 152/152, mobile 32/32, Turbo 6/6; Bastion/Atrium/Crucible per-file [PASS]); manual Android evidence user-confirmed 2026-09-21 (project picker, root sessions only, messages load, composer usable); the user-deferred Lumen ✨ bootstrap remains uncertified under `DEBT-003`
- ✅ Phase 09: `pnpm --filter @coderelay/opencode-plugin typecheck && pnpm --filter @coderelay/opencode-plugin test` → exit 0 (verified 2026-09-20: plugin 151/151; gateway 409 carries non-secret pairing state; TUI resolves connected/revoked/expired/idle; Bastion [PASS] gateway.ts+tui.tsx; Crucible [PASS] gateway.test.ts+tui.test.ts; manual TUI retry user-confirmed 2026-09-21 — "it worked")
- ✅ Phase 10: `pnpm exec turbo run test typecheck` → exit 0 (verified 2026-09-21: Turbo 6/6, plugin 152/152, mobile 32/32; `revoke()` clears queued projected events; pre-revocation event cannot reach a later pairing; malformed-project and reduced-motion regressions covered; Bastion [PASS] gateway.ts; Crucible [PASS] on all three test files; `DEBT-003` recorded for the user-deferred Lumen ✨ bootstrap)
- ✅ Phase 11: `pnpm --filter @coderelay/mobile typecheck && pnpm --filter @coderelay/mobile test` and `pnpm exec turbo run test typecheck` → exit 0 (verified 2026-09-21: mobile 32/32, Turbo 6/6; `SafeAreaProvider` wrapping both branches; top/bottom insets composed with base padding; single-line horizontal picker scrollers preserving 44px chips; keyboard-avoiding composer; Warden [PASS] on `react-native-safe-area-context@5.7.0` with digest-verified lockfile and no new advisories; Atrium [PASS] on `App.tsx`+`ChatScreen.tsx`; Crucible [PASS] on `ChatScreen.test.tsx`; manual Android retry user-confirmed 2026-09-21 — no top/bottom overflow, composer visible)

## Phase verify commands

Every phase runbook has an Executor/Command table. Cipher 🔓 (Lead Orchestrator) runs turbo/pnpm verify commands. Forge 🔨 (Implementer) does not run `pnpm install`. Warden 🔒 (Dependency Warden) must APPROVE before any install.

## Audit

- Auditor: Sentinel 🛡️ (Quality Guardian)
- Verdict: [PASS]
- Findings: 0 — re-audits certify the 2026-09-20 Phase 08 legacy-SDK catalog, opaque project-key, manifest, trace, parity, executor, and story constraints; the same-day follow-up certified the rewritten one-mutation-unit runbook after Sentinel's initial [FAIL] was remediated; the 2026-09-20 Phase-09 addition (TUI pairing status resolution, G2/G3 trace) passed with its three advisories recorded; the 2026-09-21 Phase-10 addition (revocation queue clear plus parser/reduced-motion coverage and `DEBT-003`) passed after the debt-entry contract was corrected to the six-field register format; the 2026-09-21 Phase-11 addition (safe-area layout correction with a Warden-gated exact dependency pin) passed after the phase-09/11 `Writes` story-path and `DEBT-003` date advisories were reconciled. Lumen's visual gate stays uncertified under `DEBT-003` by explicit user direction.
- Date: 2026-09-21

## Out of scope / Do-not-touch

- `.aicore/`, `AGENTS.md`, `opencode.jsonc`, `.opencode/agents/`, `.opencode/skills/`
- `user-stories/aicore-adoption-sync.md` body (index row already added beside it)
- iOS app, Windows/macOS host support, hosted relay, Tailscale Serve automation, multi-device accounts, persistent `always` permissions, shell/file/auth proxying, EAS release
- Existing Python governance scripts

## Pending

- [confirmed 2026-09-21] phase-08: user-approved project picker with root/main sessions only; automated work complete and verified 2026-09-21 (plugin 152/152, mobile 32/32, Turbo 6/6; per-file Bastion/Atrium/Crucible [PASS]); manual Android evidence user-confirmed (project picker, root sessions only, messages load, composer usable). Remaining: the user-deferred Lumen ✨ bootstrap (DEBT-003) and the phase-05 physical checklist. Implementation authorized by the user 2026-09-20 ("execute the plan"); executing one step at a time under the phase-08 execution rule.
- [deferred] Lumen ✨ final visual gate: bootstrap-blocked `[FAIL]` because root `PRODUCT.md`/`DESIGN.md` are absent; the user directed that the bootstrap stays debt rather than being created (2026-09-21). Tracked as `DEBT-003` in `knowledge/debt.md`; the visual gate is recorded as uncertified, never as passed.
- [confirmed 2026-09-21] phase-11: user-reported Android overflow — the chat screen drew under the status bar and navigation bar and its wrapping picker rows could push the composer off-screen. Fix implemented and gated (mobile 32/32, Turbo 6/6; Warden/Atrium/Crucible [PASS]); manual Android retry user-confirmed — overflow fixed and the composer/keyboard behavior is correct.
- [confirmed 2026-09-21] manual phase-06 TUI retry: the user repeatedly opened the `Ctrl+P` → `CodeRelay: Pair device` modal across phase 07–09 device testing with no orphan-text crash; session-confirmed.
- [confirmed 2026-09-21] manual phase-07 Android retry: superseded and confirmed by Phase-08 device use — the user paired, reconnected across app reloads, and loaded the session list after the catalog handoff fixed `Host session list was malformed`.
- [blocked on] physical Android device checklist (phase 05 step 8): no Android hardware or Tailscale endpoint available in this environment, so pairing, reconnect, endpoint switching, QR expiry, revocation, and PC-to-phone live sync are not device-verified. Automated tests cover the protocol/plugin/mobile unit behavior. Recorded as blocked, never as passed.
- [confirmed 2026-09-21] manual phase-09 TUI retry: the user confirmed the pairing modal now resolves (`it worked`) after Phase 09's state-aware 409.
- [resolved 2026-09-21] Warden 🔒 lockfile [ADVISORY] F1–F4: registered as `DEBT-004` (F1/F2/F4 accept-and-document, exact pins retained; F3 already resolved) at the user's direction, lifting the `pnpm-lock.yaml` staging hold.

## Resolved decisions

- 2026-09-18 — Chat and supervise MVP, TUI QR pairing, one Linux host, one Android phone, product TypeScript only.
- 2026-09-18 — Detect and choose LAN, Tailscale, or custom URL; CodeRelay does not configure networking services.
- 2026-09-18 — Encrypted application protocol for direct Wi-Fi; Tailscale is an optional detected route, not a required vendor integration.
- 2026-09-18 — Sentinel 🛡️ (Quality Guardian) audited the plan `[PASS]`; Warden 🔒 (Dependency Warden) approved the corrected pin matrix and gated `pnpm install`; lockfile [ADVISORY] F1–F3 accepted to continue implementation, staging hold retained.
- 2026-09-18 — Handshake revision (Warden N1, user-approved): the session key is no longer `sha256(oneTimeSecret)`. The device generates an ephemeral X25519 keypair and sends a sealed one-time secret; both sides derive the session key with ECDH (X25519) + HKDF-SHA256 bound to the transcript; the QR's `hostPublicKey` is the host's X25519 public key and authenticates the host. This replaces the Ed25519 signature scheme and satisfies G3 against a passive on-path observer. Mobile adds `@noble/curves` + `@noble/hashes`; host uses `node:crypto`. No new file paths — the revision stays within the existing protocol, plugin, and mobile files.
- 2026-09-18 — Accepted limitations recorded: `DEBT-001` (rate limiters are process-global, not per-source) and `DEBT-002` (revocation is host-local only, no remote revoke endpoint) in `knowledge/debt.md`; both accepted for the single-host single-device MVP with resolution criteria stated.
- 2026-09-18 — TUI QR surface: the pairing screen polls a loopback-only `GET /pairing-payload` route and renders the terminal QR, satisfying G2's pairing-screen QR. The `coderelay_pair` tool also returns the payload and QR on first display.
- 2026-09-18 — Test runner split accepted: `jest` + `jest-expo` for the React Native app (`@coderelay/mobile`) because RN native-module resolution is Jest-only in this toolchain, and `vitest` for the pure-TypeScript `@coderelay/protocol` and `@coderelay/opencode-plugin` packages. Recorded as an accepted platform exception (Atrium 🏛️ observation 5).
- 2026-09-18 — Mobile view-model entities live in `modules/{feature}/domain/entities/` (`session.ts`, `pairing.ts`), not in service files, per Atrium 🏛️ findings 1 and 2.
- 2026-09-19 — G2 correction (user-approved): the TUI pairing QR is surfaced through the command palette (`CodeRelay: Pair device`) opening an xlarge modal rendered from the QR matrix without ANSI escapes; a loopback-only renew route refreshes expired pairings; a project-local root `tui.jsonc` loads the TUI module with no global config change; the full-screen route remains the narrow-terminal fallback. Recorded as phase 06.
- 2026-09-19 — Phase-06 runtime correction (user-reported orphan-text crash): the production TUI adapter now wraps route/dialog formatter text in an OpenTUI root `text` element; QR modules use two-row half-block packing (69 columns by 35 rows for the current payload); payload/secret holders clear on pairing, revoke, and dispose; expiry clears the displayed QR before polling reaches its cap.
- 2026-09-19 — G4 correction (user-reported Android session-list failure): OpenCode SDK calls return a field-style wrapper, while mobile correctly expects raw session data. Phase 07 normalizes the wrapper in the plugin allowlist boundary rather than weakening the mobile parser or changing the protocol scope.
- 2026-09-19 — Phase-07 scope expansion (user-approved): replace pre-existing `as unknown as` Node HTTP fakes in the existing gateway and reconnect test files with typed structural seams, because Crucible 🔥 (Test Architect) rejected them during the required Phase-07 audit. No production HTTP contract or file-path expansion is allowed.
- 2026-09-20 — G4 scope clarification (user-approved): Android starts at a project picker and shows only root/main sessions (`parentID` absent) within the chosen project; child/subagent sessions are excluded. Project identity and routing directory remain host-owned, while encrypted mobile summaries contain no filesystem path. Recorded as Phase 08.
- 2026-09-20 — Phase-08 implementation authorized by the user ("execute the plan"); the `plan-enforce` skill stays at v1.12.1 untouched, and the one-step dispatch discipline is a self-contained phase-08 execution rule.
- 2026-09-20 — Phase-08 scope expansion (user-approved): add `packages/opencode-plugin/src/permission-policy.test.ts` only to replace its raw permission-reply response expectation with the safe `null` acknowledgement required by the host action-result sanitizer. No goal, product behavior, or additional production path changes.
- 2026-09-20 — Phase-08 scope extension (user-approved): return a mobile-safe project list separately from root summaries so a zero-root project is selectable and visibly empty; remediate Lumen's readability, hierarchy, touch-target, and selected-state findings. Add only `apps/mobile/app.json` to the Phase-08 manifest; all other implementation paths are already in scope.
- 2026-09-20 — User-reported defects (user-approved dispositions): (1) the TUI pairing modal stays on `waiting for pairing payload…` after a successful pairing because the payload route's 409 carries no state and the TUI never transitions — fixed as new Phase 09 (G2/G3 trace); (2) the chat message list opens on the oldest message — latest-message auto-scroll (initial jump, follow while near bottom, no pull when scrolled away) is folded into the already-scoped Phase-08 ChatScreen steps 31–32.
- 2026-09-21 — Phase-08 completion evidence: the safe `{ projects, sessions }` catalog including selectable zero-root projects, the mobile parser/hook handoff that cleared the reported `Host session list was malformed`, picker/visual remediation, auto-scroll, and reduced-motion handling are all implemented and gated (plugin 152/152, mobile 30/30, Turbo 6/6). The chat auto-scroll honors `AccessibilityInfo` reduced-motion with an unmount-safe listener.
- 2026-09-21 — Phase-10 scope (final audit follow-ups): `revoke()` now clears queued projected events so a pre-revocation event cannot be sealed to a later paired device; malformed individual project records and reduced-motion follow behavior gained regression coverage. Sentinel 🛡️ (Quality Guardian) audited the Phase-10 plan `[PASS]` after the debt-entry contract was corrected to the six-field register format.
- 2026-09-21 — Lumen ✨ bootstrap deferral (user-directed): the final visual audit returns `[FAIL]` bootstrap-blocked while root `PRODUCT.md`/`DESIGN.md` are absent. The user decided not to create them and to keep the bootstrap as debt; recorded as `DEBT-003` with direct evidence, resolution criteria, and the explicit deferral. The Phase-08 visual gate therefore stays uncertified rather than reported as `[PASS]`.
- 2026-09-21 — Phase-11 scope (user-approved): the Android chat screen overflows under the status and navigation bars because Expo SDK 57 enforces edge-to-edge and no safe-area handling exists; wrapping picker rows can also push the composer off-screen. Fix: `SafeAreaProvider` plus top/bottom insets in `ChatScreen`, single-line horizontal picker scrollers that keep 44px targets, and a keyboard-avoiding composer. No protocol, catalog, action, or event surface changes.
- 2026-09-21 — Safe-area dependency (user-approved): add `react-native-safe-area-context` at the Expo SDK 57 pinned version instead of a hand-rolled `StatusBar.currentHeight` patch, because the canonical provider covers the Android navigation bar reliably. The addition is gated by Warden 🔒 and touches `apps/mobile/package.json` and `pnpm-lock.yaml`, which already sits behind the pending Warden F1–F4 lockfile acknowledgment.
- 2026-09-21 — Phase-11 outcome: `react-native-safe-area-context@5.7.0` installed with an exact pin, zero transitive dependencies, digest-verified lockfile integrity, and no new advisories (Warden `[PASS]`, F1–F4 staging hold unchanged). `App.tsx` wraps both branches in `SafeAreaProvider`; `ChatScreen` composes top/bottom insets with its base padding, caps both picker rows as single-line horizontal scrollers with 44px chips, and wraps the screen in a keyboard-avoiding view. Mobile 32/32, Turbo 6/6; only the manual Android retry remains.
- 2026-09-21 — Warden advisory disposition (user-directed): F1/F2/F4 registered as `DEBT-004` in `knowledge/debt.md` (accept-and-document; exact `@opencode-ai/*@1.18.31` and `@opentui/*@0.4.5` pins retained; F3 already resolved by removal), lifting the `pnpm-lock.yaml` staging hold for the release PR.
- 2026-09-21 — First release PR authorized by the user ("register them as a debt, then make a PR"). The plan stays active — the phase-05 physical checklist remains blocked on hardware and the phase-08/11 manual Android retries are pending — so the plan folder is tracked mid-work per the plan lifecycle and its archive deletions will ride a later completing PR. `opencode.jsonc` (local plugin wiring with a machine-specific absolute path) stays uncommitted as out-of-scope local configuration.
- 2026-09-21 — Device evidence confirmed by the user after the PR opened: the Phase-11 safe-area fix removes the top/bottom overflow, the pairing modal no longer shows the pending `waiting for pairing payload…` state, and the Phase-08 project picker/session/composer flow works on the Android device. Both retries are recorded as user-confirmed; phase-05's remaining checklist items (reconnect, QR expiry, revocation, live sync) stay tracked as blocked-open.
