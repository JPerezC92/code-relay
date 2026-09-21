# Phase 11 — Chat screen safe-area layout correction

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** The user confirmed 2026-09-21 that Phase 09's TUI pairing status resolves (`status: connected`), then reported the Android chat screen overflows at the top and bottom; the user approved adding `react-native-safe-area-context` the same day (question tool); Phase 10 verified green (Turbo 6/6, plugin 152/152, mobile 30/30).
> **Reads:** `apps/mobile/App.tsx`; `apps/mobile/src/modules/session/components/ChatScreen.tsx`; `apps/mobile/src/modules/session/components/ChatScreen.test.tsx`; `apps/mobile/package.json`.
> **Writes:** apps/mobile/App.tsx; apps/mobile/src/modules/session/components/ChatScreen.tsx; apps/mobile/src/modules/session/components/ChatScreen.test.tsx; apps/mobile/package.json; pnpm-lock.yaml; plans/mobile-opencode-companion-20260918/plan.md; user-stories/mobile-opencode-companion.md

## Execution rule

Every Forge 🔨 (Implementer) step below is one mutation unit (one file) and is dispatched alone: the dispatch prompt names exactly one numbered step, pastes it verbatim, and prohibits starting any other step. After each step, Cipher 🔓 (Lead Orchestrator) runs the per-step gate: non-test mobile source → Atrium 🏛️ (Frontend Architect); every test file → Crucible 🔥 (Test Architect); dependency manifests and lockfile → Warden 🔒 (Dependency Warden). A step closes only on that owner's final `[PASS]`; `[FAIL]` or `[UNCERTAIN]` keeps the step open.

## Steps

1. Warden 🔒 (Dependency Warden) audits `react-native-safe-area-context` at the Expo SDK 57 pinned version for security, license compliance, and supply-chain health, and returns `[APPROVE]` or `[BLOCK]` before any manifest or lockfile change.
2. Cipher 🔓 (Lead Orchestrator) installs the Warden-approved pinned version and records it in `apps/mobile/package.json` and `pnpm-lock.yaml`; no other dependency changes.
3. Forge 🔨 (Implementer) edits `apps/mobile/App.tsx`: wrap the application in a safe-area provider so runtime inset consumers work, keeping the restore/paired routing behavior unchanged.
4. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/components/ChatScreen.tsx`: apply top and bottom safe-area insets to the screen container; convert the Project and Sessions chip rows to single-line horizontal scrollers that preserve the 44px touch targets and every existing chip text contract; keep the composer visible above the keyboard by wrapping it in a keyboard-avoiding container.
5. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/components/ChatScreen.test.tsx`: preserve every existing text, picker, and auto-scroll contract; add coverage proving the safe-area inset padding is applied and the picker remains operable under a mocked inset provider.
6. Cipher 🔓 (Lead Orchestrator) records the phase outcomes in `plans/mobile-opencode-companion-20260918/plan.md` and appends the dated change-log entry in `user-stories/mobile-opencode-companion.md`.

## Output

- **Artifacts:** Android chat screen that respects status-bar and navigation-bar insets, caps picker height with horizontally scrollable rows, and keeps the composer visible above the keyboard; the pinned safe-area dependency; regression coverage.
- **Schema / shape:** no protocol, catalog, action, or event surface changes; mobile layout plus the approved dependency only.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/mobile typecheck && pnpm --filter @coderelay/mobile test` |
| Cipher 🔓 (Lead Orchestrator) | `pnpm exec turbo run test typecheck` |

## Gate

- ⬜ Every numbered step completed in order under the one-step dispatch rule
- ⬜ Warden 🔒 (Dependency Warden) `[APPROVE]` for the pinned safe-area dependency before any manifest or lockfile change
- ⬜ Atrium 🏛️ (Frontend Architect) final `[PASS]` on `App.tsx` and `ChatScreen.tsx`
- ⬜ Crucible 🔥 (Test Architect) final `[PASS]` on `ChatScreen.test.tsx`
- ⬜ Verify commands exit 0
- ⬜ Manual Android retry recorded — no top/bottom clipping and the composer stays visible with the keyboard open — or explicitly blocked with evidence

## Abort conditions

- Halt if Warden 🔒 blocks the dependency, or if resolving it would require an unapproved version bump of an existing package.
- Halt if any existing chip text, permission, layout text, or auto-scroll contract would change.
- Halt if any per-step gate cannot reach final `[PASS]` after remediation.
