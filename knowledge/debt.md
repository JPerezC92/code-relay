# Accepted Debt Register

Records of deferred technical or process debt that are **non-blocking** for release.

## Entry format

Each entry MUST include:

- **ID** — unique identifier (e.g. `DEBT-001`)
- **Date** — when the deferral decision was made
- **Description** — what is deferred
- **Direct evidence** — the evidence that justifies deferral
- **Resolution criteria** — what must be true for the debt to be cleared
- **Explicit deferral decision** — who decided, and when

## Rules

- An accepted debt is nonblocking only when its record here carries direct evidence, resolution criteria, and an explicit deferral decision (see Herald 📯 (Release Manager) spec).
- Disclose the ID and unresolved criteria in any operation report that touches it.
- Clear and retire a debt in the same PR: the PR that clears a debt deletes its entry from this register, and its body and commit carry the Resolution evidence (criteria met, validation and audit results). Git history is the permanent record for retired entries; this register holds open debts only. Never open a dedicated PR whose sole purpose is pruning cleared entries — each debt is retired by exactly one PR: its clearing PR.

## Register

### DEBT-001 — Rate limiters are process-global, not per-source

- **Date:** 2026-09-18
- **Description:** The CodeRelay gateway's sliding-window limiters for `/pair`, `/envelope`, and `/pairing-payload` are single in-process instances shared by all peers, rather than keyed by remote address. A hostile LAN peer can spend a shared budget and cause 429 responses for the legitimate device.
- **Direct evidence:** `packages/opencode-plugin/src/gateway.ts` — one `pairLimiter`, one `envelopeLimiter`, and one `pairingPayloadLimiter` per gateway instance; bounds `MAX_PAIR_ATTEMPTS = 5`, `MAX_ENVELOPE_ATTEMPTS = 120`, `MAX_PAIRING_PAYLOAD_REQUESTS = 240` per 60 s window; Bastion 🧱 (Backend & Scripts Architect) phase-03 advisories 3 and finding 8.
- **Resolution criteria:** limiters keyed by `request.socket.remoteAddress` (or equivalent per-peer key) with the same bounds; tests proving one exhausted source does not consume another source's budget.
- **Explicit deferral decision:** Cipher 🔓 (Lead Orchestrator), 2026-09-18 — accepted for the single-host, single-device MVP; no passive-decryption or auth bypass results.

### DEBT-002 — Revocation is host-local only; no remote revoke endpoint

- **Date:** 2026-09-18
- **Description:** `revoke()` is an in-process method with no network route and no production caller. The paired device cannot be revoked from the phone; revocation is only reachable by invoking the host-local method (currently no live caller exists).
- **Direct evidence:** `packages/opencode-plugin/src/gateway.ts` `handleHttpRequest` routes only `/pair`, `/envelope`, and `/pairing-payload`; `gateway.revoke()` has no production caller (only tests invoke it) and `index.ts` teardown calls `gateway.dispose()` and `pendingSecret?.clear()`, neither of which invokes `revoke()`; Bastion 🧱 (Backend & Scripts Architect) phase-03 advisory 5 and finding 8.
- **Resolution criteria:** an authenticated revoke path (host-local command or an authenticated request) with tests and a documented threat model; or an explicit decision that host-local-only is permanent.
- **Explicit deferral decision:** Cipher 🔓 (Lead Orchestrator), 2026-09-18 — host-local-only is the safer default (no unauthenticated remote kill) and is accepted for the MVP; G3's "host-side revocation" is satisfied by the host-local `revoke()`.

### DEBT-003 — Lumen bootstrap docs absent; visual gate uncertified

- **Date:** 2026-09-21
- **Description:** Lumen ✨ (Visual Director) requires non-placeholder `PRODUCT.md` and `DESIGN.md` at the repository root before any design audit. Both are absent, so the requested final visual audit of `apps/mobile/src/modules/session/components/ChatScreen.tsx` and `apps/mobile/app.json` returned `[FAIL]` bootstrap-blocked without reviewing source. Light-appearance contrast, selected state, 44px targets, heading hierarchy, auto-scroll reading-position behavior, and reduced-motion handling therefore remain visually uncertified; the mobile unit tests cover the behavior but not the visual/accessibility judgment.
- **Direct evidence:** `output/design/audit-chatscreen-2026-09-20.md` (`[FAIL]` — bootstrap-blocked, source not reviewed); `output/design/audit-android-project-picker-remediation-2026-09-20.md` (`[ADVISORY]` — the four original picker findings verified fixed, reduced-motion blocker since remediated and re-gated); no `PRODUCT.md` or `DESIGN.md` at the repository root; `plans/mobile-opencode-companion-20260918/plan.md` Resolved decisions 2026-09-18 — "Cut hosted relay, EAS, `PRODUCT.md` / `DESIGN.md`, and Lumen ✨ (Visual Director) until those docs exist."
- **Resolution criteria:** create non-placeholder `PRODUCT.md` and `DESIGN.md` at the repository root, load them through the design-context bootstrap, and rerun the Lumen ✨ audit to a final `[PASS]` — or to findings the user explicitly accepts — over `apps/mobile/src/modules/session/components/ChatScreen.tsx` and `apps/mobile/app.json`.
- **Explicit deferral decision:** User, 2026-09-21 — instructed "dont bootstrap, keep it as a debt"; accepted as non-blocking release debt, with the visual gate left uncertified rather than reported as passed.

### DEBT-004 — Warden dependency advisories F1/F2/F4 accepted at release

- **Date:** 2026-09-21
- **Description:** Three Warden 🔒 (Dependency Warden) lockfile advisories are accepted as documented release debt so `pnpm-lock.yaml` and the workspace manifests can be staged: F1 — transitive `uuid@7.0.3` moderate GHSA-w5hq-g745-h8pq (75 paths, all via `xcode`→`@expo/config-plugins`); F2 — `@opencode-ai/plugin@1.18.31`/`@opencode-ai/sdk@1.18.31` canonical-project mapping unverified (no `repository.url`, provenance Tier-3 indeterminate, digest-match holds); F4 — transitive `@babel/core@7.28.0` low GHSA-4x5r-pxfx-6jf8 / CVE-2026-49356 via `@opentui/solid@0.4.5`'s exact pin. F3 (`minimumReleaseAgeExclude` waiver) is resolved — the stale entry was removed from `pnpm-workspace.yaml`.
- **Direct evidence:** `output/audits/2026-09-18-baseline.md`; `output/audits/2026-09-18-opencode-plugin-tui-type-deps-lockfile.md` (F1/F2/F4 full reachability analysis: F1 unreachable — no first-party import, sole consumer calls `uuid.v4()`, iOS build tooling not shipped; F4 type-only devDependency that never compiles code, root `@babel/core` patched at 7.29.7); 2026-09-21 Phase-11 post-install Warden gate (`pnpm audit` unchanged: advisories 1119441 uuid moderate, 1123528 `@babel/core` low; F1/F2/F4 open, F3 resolved); `pnpm-lock.yaml` digest coverage 846/846.
- **Resolution criteria:** F1 — upstream `xcode`/Expo resolution ships a patched `uuid` within the supported matrix; F2 — `@opencode-ai` maintainers publish `repository.url` or provenance attestations; F4 — `@opentui/solid` releases a pin compatible with `@babel/core` ≥7.29.6 (or the user authorizes an upstream-reviewed override re-gated by a fresh Warden audit). Each closure is confirmed by a fresh Warden audit, and the clearing PR deletes this entry per the retire-in-clearing-PR rule.
- **Explicit deferral decision:** User, 2026-09-21 — instructed "register them as a debt, then make a PR"; exact pins (`@opencode-ai/*@1.18.31`, `@opentui/*@0.4.5`) are retained, remediation deferred to upstream availability.

### DEBT-005 — Host permission asks do not surface as cards on the paired phone

- **Date:** 2026-09-21
- **Description:** The mobile approve-once/reject permission path is implemented and unit-tested, but a live host permission ask was never observed reaching the phone. On the first on-device probe, no permission card appeared on the paired, connected phone and the ask resolved host-side. Root cause is undiagnosed. Hypotheses (unverified): the host TUI intercepts/answers the ask before plugin forwarding; session-scoped event fan-out filtered the projection (phone bound to a different session than the ask); or the SDK `permission.updated` notification did not fire for this ask source.
- **Direct evidence:** 2026-09-21 live probe — a host `cp` command matched the project `opencode.jsonc` permission rule `cp *: "ask"`; the ask was rejected host-side (the tool call returned a rejection) while the user, on the paired phone, reported "is not appearing". The code path exists: `packages/opencode-plugin/src/gateway.ts:202-205` maps SDK `permission.updated` to protocol `permission.asked`, projected at `gateway.ts:228-242`; `allowlist.ts:180-191` sends `permission.reply` with `once | reject` only; coverage in `gateway.test.ts:1414-1444`, `permission-policy.test.ts`, and `allowlist.test.ts:99-109`. All tests pass (plugin 152/152, 2026-09-21) — the gap is host-live behavior, not unit behavior.
- **Resolution criteria:** reproduce with host-side logging on the projection/fan-out path, fix forwarding so a host permission ask renders a card on the paired phone and approve-once/reject round-trips end-to-end with recorded device evidence — or record an explicit permanent decision (for example, host-TUI-only permission answering) — with a fresh Bastion 🧱/Crucible 🔥 gate over any changed path. The release PR test-plan permission item stays unticked while this debt is open.
- **Explicit deferral decision:** User, 2026-09-21 — instructed "is not appearing, mark it as a debt" immediately after the live probe.

### DEBT-006 — QR expiry and renew not device-verified

- **Date:** 2026-09-21
- **Description:** The phase-05 physical QR-expiry check was not performed: the host TUI's expiry display and renew flow, and the paired phone staying functional across a QR lapse, were never observed on device. Recorded as deferred, never as passed.
- **Direct evidence:** plan phase-05 checklist item "QR expiry" closed with no device evidence (user ended the walkthrough 2026-09-21 directing remaining items be registered as debts). Automated coverage exists: `packages/opencode-plugin/src/pairing.test.ts` (120 s expiry, hash-only secret), `tui.test.ts` (countdown reaching zero clears payload and QR; renew flow), `apps/mobile/src/modules/pairing/components/QrScannerScreen.test.tsx` (expired QR shows failure and does not pair).
- **Resolution criteria:** an on-device expiry walk — open `Ctrl+P` → `CodeRelay: Pair device`, let the QR lapse, confirm an explicit expired state with no stale code, renew refreshes, and the paired phone keeps working throughout — recorded as user-confirmed evidence; or an explicit permanent decision that the automated coverage suffices.
- **Explicit deferral decision:** User, 2026-09-21 — instructed "add the others 2 as debts" for the remaining phase-05 checklist items.

### DEBT-007 — Endpoint switching not device-verified

- **Date:** 2026-09-21
- **Description:** The phase-05 endpoint-switching check (reconnect across LAN ↔ Tailscale ↔ custom URL) was never exercised: this environment has no Tailscale endpoint, and only the LAN path carries device evidence (pairing, airplane-mode reconnect, live sync). Cross-endpoint reconnect behavior on device is unknown.
- **Direct evidence:** `packages/opencode-plugin/src/endpoints.test.ts` covers detection/selection in unit tests; plan phase-05 checklist item "endpoint switching" closed with no device evidence; all 2026-09-21 device evidence ran over the LAN path; the plan Pending section records "no Tailscale endpoint available in this environment" (2026-09-18, reaffirmed 2026-09-21).
- **Resolution criteria:** a second real endpoint (Tailscale or a custom URL) exercised on device with a reconnect across the switch recorded as user-confirmed evidence; or an explicit permanent decision that LAN-only is the supported MVP path.
- **Explicit deferral decision:** User, 2026-09-21 — instructed "add the others 2 as debts" for the remaining phase-05 checklist items.
