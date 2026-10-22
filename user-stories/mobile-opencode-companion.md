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
- ✅ The Android app first selects a project, including a project with no root sessions, and then lists only that project's root/main sessions, follows message and status updates for the selected session, sends prompts, aborts a run, and answers permission requests with approve-once or reject only; subagent sessions and host filesystem paths are never shown, and picker hierarchy, selected state, touch targets, and light-mode readability are accessible. (Picker/prompts/live-sync device-confirmed 2026-09-21; `once | reject` are the only parseable decisions end-to-end; the live host-ask delivery to the phone is deferred as `DEBT-005` with the release item unticked; transcript-only override per the 2026-10-16 session-activity decision — a subagent row opens a child view and edit cards carry paths, while the picker stays root-only)
- ✅ Automated protocol, plugin, and mobile tests plus a physical Android checklist cover pairing, reconnect, endpoint switching, permission safety, QR expiry, revocation, and failure behavior. (Tests pass under turbo; the phase-05 gate recorded every checklist result 2026-09-21 — reconnect and live sync device-confirmed; permission cards, QR expiry, endpoint switching, and on-device revocation recorded as accepted debts `DEBT-002`/`DEBT-005`/`DEBT-006`/`DEBT-007`, never silently skipped)
- ✅ The project list opens from a hamburger menu. Choosing a project still selects it, including a project with no root sessions, and host paths stay hidden. (ChatScreen hamburger tests passed 2026-10-13; mobile 37/37)
- ✅ Sessions for the selected project are chosen from a select on the main page, latest first, and that session still drives messages, send, and abort. (Newest-first fixture asserted; reselecting the current session does not clear messages)
- ✅ The app lists only models from the host configured-provider set (`config.providers`), and the selected model is sent on the next prompt. Provider secrets are not shown. Catalog-only ids such as `nano-gpt/deepseek-reasoner` are not listed. (plugin 163/163; live `config.providers` equals `opencode models`, 109/109, no `nano-gpt`)
- ✅ Opening the model select does not mount every row first, and the open list scrolls inside a bounded virtualized sheet. (ChatScreen test: row absent before open; FlatList max-height; mobile 18/18)
- ✅ Each open model row shows the provider id under the model name. Session rows do not. (ChatScreen test asserts provider id under GPT 5; mobile 18/18)
- ✅ The open model sheet has a search field that filters rows by name or provider id. The session sheet does not. (ChatScreen test: query hides non-match; Session has no Search models; mobile 18/18)
- ✅ A separate Variant select lists the selected model's variant ids, and the chosen id is sent with the prompt. Models with no variants omit it. (plugin projects ids only; mobile prompt includes chosen id and omits it when empty; plugin 163/163, mobile 18/18)
- ✅ Reasoning parts render as a collapsed chat row. Pressing the row expands the reasoning text in the same chat. A live row reads Thinking. A finished row reads Thought plus duration when the host sent start and end. (ChatScreen test: reasoning row starts collapsed and reveals the body in the same list; plugin 168/168, mobile 48/48 — 2026-10-16)
- ✅ Edit, write, apply_patch, and patch parts render a chat card with tool name, status, and file path. Tool output and host cwd stay on the host. (ChatScreen test: edit card shows its path; plugin strips tool output and host cwd; plugin 168/168, mobile 48/48 — 2026-10-16)
- ✅ A task row in the parent chat opens a fullscreen view of that child session, including its text, thinking, and edit cards, and Back returns to the parent transcript without clearing it. The session picker still lists only root sessions. (ChatScreen test: task press opens the child transcript and Back restores the parent; child events route via the routed root's directory; picker stays root-only; plugin 168/168, mobile 48/48 — 2026-10-16)

## Change log

- before 2026-10-12 — earlier history: see git history for this file
- 2026-10-13 — chat-nav-model-select-20261013 (f3b5d461): the project-first picker chrome extends — projects move to a hamburger menu, sessions to a latest-first select, and a host model select is added. Project-then-root-session selection is unchanged.
- 2026-10-13 — model-picker-connected-20261013 (2b8323b8): the host-model list comes from `config.providers` rather than `connected` or the full `all` catalog, with `nano-gpt/deepseek-reasoner` rejected as a catalog-only id. The model sheet opens without mounting every row, scrolls in a bounded virtualized list, shows the provider id under the name, filters by name or provider id, and offers a separate Variant select whose chosen id is sent with the prompt. The session sheet has no search field.
- 2026-10-16 — session-activity-20261013 (9e925088): reasoning rows render collapsed with their thinking text, edit cards show their file path, and a task row opens a fullscreen subagent view with Back. Child-session events route through the gateway keyed to the routed root's directory; the child's own directory is never stored or published and the picker stays root-only.

## Revision tracking

- 2026-10-21 — V2 plugin port: the server plugin and the TUI pairing screen were moved from the V1 plugin/SDK API to the V2 API. Approved by the user across 2026-10-20/21. **Delivery anchor pending** — the delivering commit does not exist until this work is committed, and per `user-story/references/_consistency-checklist.md` **Staged persistence and history finalization** no anchor may be fabricated and no release artifact may be opened to obtain one. The `## Change log` entry for this delivery must be written in the completing turn, once that commit exists, and must cite it. Recorded here as staged persistence, outside the feature log.

## Resolved decisions

- 2026-09-18 — Chat and supervise MVP: view sessions and messages, send prompts, abort, approve-once or reject. No always-allow, shell, or file APIs.
- 2026-09-18 — Provider-neutral networking: detect LAN and Tailscale and allow custom URLs; do not install or control Tailscale, tunnels, DNS, or routers.
- 2026-09-18 — Direct Wi-Fi uses an encrypted application protocol; cleartext HTTP is only a transport.
- 2026-09-18 — One Linux host and one Android phone. Product TypeScript only; existing governance Python stays.
- 2026-09-18 — Pairing UX is an OpenCode TUI command or route, not a CLI-only ASCII QR and not a hosted relay.
- 2026-09-20 — Project-first navigation: `parentID` absent defines a root/main session for the picker; host project/directory routing stays private and no mobile action accepts a filesystem path.
- 2026-09-20 — Empty projects and visual accessibility: the host returns a mobile-safe project list separately from root summaries so zero-root projects can show an empty state; the mobile surface uses an explicit light appearance and accessible picker affordances.
- 2026-10-13 — Navigation chrome: hamburger for projects and a latest-first session select replace the horizontal chip rows. Model choice is a projected `{ providerID, modelID, label }` list; provider secrets stay on the host.
- 2026-10-13 — Retracted: the host-model list is not SDK `connected`. Keep this story. The list is `config.providers`. Do not add a second story and do not call the op-model skill from the app.
- 2026-10-13 — Model sheet: fold the open-speed and scroll work into `model-picker-connected-20261013` instead of a second plan.
- 2026-10-13 — Model row: show the provider id under the name in the open sheet only.
- 2026-10-13 — Model list source: `config.providers`, not the connected catalog. `nano-gpt/deepseek-reasoner` is a rejected catalog id.
- 2026-10-13 — Model search: the open model sheet filters by name or provider id. The session sheet does not.
- 2026-10-13 — Variant select: a separate control lists variant ids and the prompt sends the chosen id. Variant bodies and headers stay on the host.
- 2026-10-13 — Chat activity overrides the earlier "subagent sessions and host filesystem paths are never shown" rule for the transcript only. Thinking expands inline. Edit cards may show file paths. A subagent row opens a fullscreen child view with Back. The session picker stays root-only and is not redesigned.
- 2026-10-16 — Subagent child routing: the transcript may follow a task row into a child session, so child events are routed via the parent root's directory (never the child's own directory, never on phone payloads). The picker still lists root sessions only.
