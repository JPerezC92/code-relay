# User story — mobile-opencode-companion

> **Created:** 2026-09-18
> **Title:** Mobile OpenCode companion
> **Status:** active
> **Epic:** mobile-companion
> **Affected areas:** `apps/mobile/`, `packages/protocol/`, `packages/opencode-plugin/`

## Persona

- A developer who runs OpenCode on a Linux PC and wants to watch and steer the same session from an Android phone without typing host addresses.

## Goal

- **G:** One Android phone can pair with one Linux OpenCode host by scanning a QR code and then chat and supervise that host's session.
  - Done when: the phone shows PC-submitted messages for the selected session, can send prompts, abort a run, and answer permissions with approve-once or reject only, over an authenticated encrypted CodeRelay protocol.

## Scenario

- The developer opens the CodeRelay pairing screen in the OpenCode TUI, selects a detected LAN or Tailscale address or a custom URL, scans the QR with the Android app, and immediately sees the same OpenCode session. A message submitted on the PC appears on the phone; a prompt or permission reply from the phone is applied on the host.

## Acceptance criteria

- ✅ A pnpm and Turborepo TypeScript workspace contains the Expo Android app, the OpenCode plugin, and a shared protocol package. (Turbo 6/6, plugin 152/152, mobile 32/32 — 2026-09-21)
- ✅ The TUI pairing screen starts the CodeRelay gateway, detects LAN and Tailscale addresses, accepts a custom endpoint, and shows a short-lived QR without configuring Tailscale, tunnels, or routers. (Palette modal with expiry countdown + loopback-only renew; no tunnel/serve/router commands, unit-gated; LAN device-proven; Tailscale detection code+unit only per `DEBT-007`)
- ✅ One phone pairs to one Linux host with a single-use credential; later traffic is authenticated, replay-resistant, and end-to-end encrypted, with reconnect and host-side revocation. (Pairing + airplane-mode reconnect device-confirmed 2026-09-21; AES-256-GCM 12-byte nonce/16-byte tag unit-gated; host-local `revoke()` with queue clear satisfies revocation per the recorded `DEBT-002` decision)
- ✅ The Android app first selects a project, including a project with no root sessions, and then lists only that project's root/main sessions, follows message and status updates for the selected session, sends prompts, aborts a run, and answers permission requests with approve-once or reject only; subagent sessions and host filesystem paths are never shown, and picker hierarchy, selected state, touch targets, and light-mode readability are accessible. (Picker/prompts/live-sync device-confirmed 2026-09-21; `once | reject` are the only parseable decisions end-to-end; the live host-ask delivery to the phone is deferred as `DEBT-005` with the release item unticked)
- ✅ Automated protocol, plugin, and mobile tests plus a physical Android checklist cover pairing, reconnect, endpoint switching, permission safety, QR expiry, revocation, and failure behavior. (Tests pass under turbo; the phase-05 gate recorded every checklist result 2026-09-21 — reconnect and live sync device-confirmed; permission cards, QR expiry, endpoint switching, and on-device revocation recorded as accepted debts `DEBT-002`/`DEBT-005`/`DEBT-006`/`DEBT-007`, never silently skipped)

## Change log

- 2026-09-18 — mobile-opencode-companion-20260918: created the durable definition for the Expo Android companion and OpenCode QR-pairing plugin MVP.
- 2026-09-19 — mobile-opencode-companion-20260918: phase-06 correction — pairing QR surfaced via the OpenCode command palette (`CodeRelay: Pair device`) opening an xlarge modal QR rendered from the QR matrix (no ANSI), with a loopback-only renew route and a project-local root `tui.jsonc`; full-screen route kept as the narrow-terminal fallback.
- 2026-09-19 — mobile-opencode-companion-20260918: phase-07 correction — normalize OpenCode SDK field-style action results in the host allowlist so the Android session service receives raw session/message/status data rather than SDK request wrappers.
- 2026-09-20 — mobile-opencode-companion-20260918: phase-08 correction — add project-first root-session navigation so subagent sessions are excluded and host routing paths remain private.
- 2026-09-20 — mobile-opencode-companion-20260918: phase-08 extension — expose only opaque project labels/keys so projects without root sessions remain selectable; remediate picker accessibility and light-mode readability.
- 2026-09-20 — mobile-opencode-companion-20260918: phase-09 correction — the TUI pairing modal now resolves via the payload route's non-secret 409 pairing state (`connected`/`revoked`/`expired`/`idle`) instead of showing `waiting for pairing payload…` forever after a successful pairing.
- 2026-09-21 — mobile-opencode-companion-20260918: phase-08/10 outcomes — the host returns an opaque project list including zero-root projects, the mobile list parser and picker consume it, chat auto-scrolls to the latest message and honors reduced-motion, and `revoke()` clears queued events so a revoked pairing cannot deliver stale events to a later device. The Lumen visual gate remains uncertified under `DEBT-003` (user-deferred `PRODUCT.md`/`DESIGN.md` bootstrap).
- 2026-09-21 — mobile-opencode-companion-20260918: phase-11 outcome — the Android chat screen now respects status-bar and navigation-bar insets via `SafeAreaProvider`/`useSafeAreaInsets`, caps the Project and Sessions pickers as single-line horizontal scrollers with 44px targets, and keeps the composer above the keyboard; adds the pinned `react-native-safe-area-context@5.7.0` dependency.
- 2026-09-21 — mobile-opencode-companion-20260918: plan completion reconciliation — all five acceptance criteria dispositioned with evidence; the physical checklist closed with reconnect and live sync device-confirmed and four accepted debts (`DEBT-002` on-device revocation, `DEBT-005` live permission-card delivery, `DEBT-006` QR expiry walk, `DEBT-007` endpoint switching) recorded at the user's direction; plan archived to `plans/.completed/` with its tracked deletions staged into the completing release PR.

## Resolved decisions

- 2026-09-18 — Chat and supervise MVP: view sessions and messages, send prompts, abort, approve-once or reject. No always-allow, shell, or file APIs.
- 2026-09-18 — Provider-neutral networking: detect LAN and Tailscale and allow custom URLs; do not install or control Tailscale, tunnels, DNS, or routers.
- 2026-09-18 — Direct Wi-Fi uses an encrypted application protocol; cleartext HTTP is only a transport.
- 2026-09-18 — One Linux host and one Android phone. Product TypeScript only; existing governance Python stays.
- 2026-09-18 — Pairing UX is an OpenCode TUI command or route, not a CLI-only ASCII QR and not a hosted relay.
- 2026-09-20 — Project-first navigation: `parentID` absent defines a root/main session for the picker; host project/directory routing stays private and no mobile action accepts a filesystem path.
- 2026-09-20 — Empty projects and visual accessibility: the host returns a mobile-safe project list separately from root summaries so zero-root projects can show an empty state; the mobile surface uses an explicit light appearance and accessible picker affordances.
