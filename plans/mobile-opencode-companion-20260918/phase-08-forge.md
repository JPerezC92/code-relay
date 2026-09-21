# Phase 8 — Project-first root session navigation

> **Owner:** Forge 🔨 (Implementer)
> **Pre:** Phase 07 automated verification, Bastion 🧱 (Backend & Scripts Architect), and Crucible 🔥 (Test Architect) passed; Android evidence shows one flat session list including `@... subagent` sessions; Sentinel 🛡️ (Quality Guardian) re-audit [PASS] recorded in `plan.md`; the user authorized implementation and the zero-root-project/visual extension on 2026-09-20.
> **Reads:** `packages/opencode-plugin/src/index.ts`; `packages/opencode-plugin/src/gateway.ts`; `packages/opencode-plugin/src/allowlist.ts`; `packages/opencode-plugin/src/allowlist.test.ts`; `packages/opencode-plugin/src/permission-policy.test.ts`; `packages/opencode-plugin/src/gateway.test.ts`; `packages/opencode-plugin/src/reconnect.test.ts`; `apps/mobile/app.json`; `apps/mobile/src/modules/session/domain/entities/session.ts`; `apps/mobile/src/modules/session/services/session.service.ts`; `apps/mobile/src/modules/session/hooks/use-session.ts`; `apps/mobile/src/modules/session/components/ChatScreen.tsx`; `apps/mobile/src/modules/session/components/ChatScreen.test.tsx`; installed `@opencode-ai/sdk` 1.18.31 declarations.
> **Writes:** packages/opencode-plugin/src/session-catalog.ts; packages/opencode-plugin/src/session-catalog.test.ts; packages/opencode-plugin/src/index.ts; packages/opencode-plugin/src/gateway.ts; packages/opencode-plugin/src/allowlist.ts; packages/opencode-plugin/src/allowlist.test.ts; packages/opencode-plugin/src/permission-policy.test.ts; packages/opencode-plugin/src/gateway.test.ts; packages/opencode-plugin/src/reconnect.test.ts; apps/mobile/app.json; apps/mobile/src/modules/session/domain/entities/session.ts; apps/mobile/src/modules/session/services/session.service.ts; apps/mobile/src/modules/session/services/session.service.test.ts; apps/mobile/src/modules/session/hooks/use-session.ts; apps/mobile/src/modules/session/components/ChatScreen.tsx; apps/mobile/src/modules/session/components/ChatScreen.test.tsx; plans/mobile-opencode-companion-20260918/plan.md; user-stories/mobile-opencode-companion.md

## Execution rule

Every Forge 🔨 (Implementer) step below is one mutation unit (one file) and is dispatched alone: the dispatch prompt names exactly one numbered step, pastes it verbatim, and prohibits starting any other step. After each step, Cipher 🔓 (Lead Orchestrator) runs the per-step gate: non-test plugin source → Bastion 🧱 (Backend & Scripts Architect); every test file → Crucible 🔥 (Test Architect); non-test mobile source → Atrium 🏛️ (Frontend Architect). A step closes only on that owner's final `[PASS]`; `[FAIL]` or `[UNCERTAIN]` keeps the step open.

## Steps

1. Forge 🔨 (Implementer) creates `packages/opencode-plugin/src/session-catalog.ts`: host-only catalog over the authenticated legacy client — `client.project.list()`, then `client.session.list({ query: { directory: project.worktree } })` per project (never SDK v2); field-style result normalization; keep only sessions with no `parentID`; sort by descending `time.updated` then ID; emit only `{ id, title, updatedAt, projectKey, projectLabel }`; `projectKey` is a deterministic SHA-256 digest of host-only identity (raw `projectID` never leaves the host; `projectID === "global"` digests include the directory); labels are basename-only; the `sessionID -> directory` route map stays private with an explicit `clear()`.
2. Forge 🔨 (Implementer) creates `packages/opencode-plugin/src/session-catalog.test.ts`: root-only filtering, child exclusion, project grouping and recent-first ordering, opaque keys (no `projectID`/`directory`/`worktree`/`parentID` in summaries), global-project separation, SDK error/missing-data handling, route-map refresh and clear semantics — deterministic, typed fakes only.
3. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/allowlist.ts`: accept an optional host-derived `directory` on the execution path and attach `query: { directory }` to session status, messages, promptAsync, abort, and permission-reply SDK calls; `session.list` options are unchanged; six mobile actions and `once | reject` remain the only contracts.
4. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.ts`: take the session catalog as a constructor dependency; answer `session.list` with catalog summaries; for every session-bound action resolve the session ID through the host route map (refreshing once on a miss), reject unknown or child IDs with `GatewayError`; pass only the host-derived directory to the allowlist; clear the route map on revoke and dispose.
5. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/index.ts`: construct the catalog from `input.client`; start one authenticated `client.global.event({ signal })` subscription whose `AbortController` is aborted in `dispose`; forward only allowlisted events whose session ID exists in the root route map; keep the local plugin `event` hook for pairing cleanup only, without double-forwarding.
6. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/allowlist.test.ts`: prove the five session-bound calls carry the host-derived `query.directory` and that `session.list` options are unchanged.
7. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/permission-policy.test.ts`: prove permission replies expose only the mobile-safe acknowledgement value.
8. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.test.ts`: encrypted `session.list` returns catalog summaries (never `directory`/`worktree`/`parentID`/SDK metadata); unknown and child session IDs are rejected; routing refresh-on-miss and route-map clearing on revoke/dispose are covered; replay/renew/loopback/secret-lifecycle coverage stays intact.
9. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/reconnect.test.ts`: adapt the resync path to catalog-backed `session.list` summaries while keeping deterministic completion semantics.
10. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/domain/entities/session.ts`: add `projectKey` and `projectLabel` to `SessionSummary`; no host-path fields.
11. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/services/session.service.ts`: parse `projectKey`/`projectLabel` and reject any summary entry that omits either; keep the strict raw-array contract for the list result.
12. Forge 🔨 (Implementer) creates `apps/mobile/src/modules/session/services/session.service.test.ts`: project metadata parsing, rejection of malformed picker records, and proof that no host-path field enters the mobile domain.
13. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/hooks/use-session.ts`: selected-project state derived from summaries; auto-select the most-recent project and its newest root session; reset messages/permissions/selection on project change.
14. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/components/ChatScreen.tsx`: project picker above the selected project's root-session buttons, recent-first; empty-state message when a project has no root sessions.
15. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/components/ChatScreen.test.tsx`: project separation, subagent exclusion, switching projects resets chat, and empty-project state.
16. Cipher 🔓 (Lead Orchestrator) dispatches and records Bastion 🧱 (Backend & Scripts Architect) final `[PASS]` over `session-catalog.ts`, `allowlist.ts`, `gateway.ts`, and `index.ts`.
17. Cipher 🔓 (Lead Orchestrator) dispatches and records Crucible 🔥 (Test Architect) final `[PASS]` over `session-catalog.test.ts`, `allowlist.test.ts`, `permission-policy.test.ts`, `gateway.test.ts`, `reconnect.test.ts`, `session.service.test.ts`, and `ChatScreen.test.tsx`; any `[FAIL]` keeps the failing step open for remediation and re-audit.
18. Cipher 🔓 (Lead Orchestrator) dispatches and records Atrium 🏛️ (Frontend Architect) final `[PASS]` over the mobile source edits (entities, service, hook, ChatScreen).
19. Cipher 🔓 (Lead Orchestrator) dispatches Lumen ✨ (Visual Director) for the project-picker hierarchy, touch targets, and readability; the gate closes on final `[PASS]`, or on an `[ADVISORY]` only after the user explicitly accepts it and the acceptance is recorded under `## Resolved decisions`.
20. Cipher 🔓 (Lead Orchestrator) runs the three Verify commands below and requires exit 0.
21. The user retries Android pairing through the `question` tool: project picker separates projects, no subagent sessions appear, and a selected root session loads messages and sends a prompt.
22. Cipher 🔓 (Lead Orchestrator) records the phase outcomes in `plans/mobile-opencode-companion-20260918/plan.md` and appends the dated change-log entry in `user-stories/mobile-opencode-companion.md`.
23. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/session-catalog.ts`: return a mobile-safe catalog object with every discovered project `{ key, label }`, including projects with no root sessions, and ordered root-session summaries; preserve host-only route maps and opaque keys.
24. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/session-catalog.test.ts`: cover empty-project catalog entries, opaque project fields, project ordering, and unchanged route-map semantics.
25. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.ts`: return the safe catalog object for `session.list` while preserving host-only session routing and encrypted response behavior.
26. Forge 🔨 (Implementer) edits `packages/opencode-plugin/src/gateway.test.ts`: prove encrypted `session.list` includes a safe empty project and no host-only fields.
27. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/domain/entities/session.ts`: include the safe project list in the session-list result view model.
28. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/services/session.service.ts`: parse the safe catalog object and preserve strict malformed-result handling.
29. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/services/session.service.test.ts`: cover safe empty-project parsing and malformed catalog-object rejection.
30. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/hooks/use-session.ts`: derive picker projects from the host-safe project list so an empty project remains selectable without a fabricated hook state.
31. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/components/ChatScreen.tsx`: remediate picker hierarchy, selected-state signaling, touch-target sizing, and light-mode readability with native controls and styles; keep the latest message visible by jumping the message list to its end when session history loads or the selected session changes, and by following the end while the user remains near the bottom without pulling a user who scrolled away.
32. Forge 🔨 (Implementer) edits `apps/mobile/src/modules/session/components/ChatScreen.test.tsx`: remove the hook override and prove the real hook renders an empty selected project from safe service data; cover auto-scroll (initial jump on history load, follow while near the bottom, no pull after scrolling away, reset on session change).
33. Forge 🔨 (Implementer) edits `apps/mobile/app.json`: force the tested light appearance so hard-coded light chat surfaces remain readable.
34. Cipher 🔓 (Lead Orchestrator) repeats the Bastion 🧱 (Backend & Scripts Architect), Crucible 🔥 (Test Architect), Atrium 🏛️ (Frontend Architect), and Lumen ✨ (Visual Director) final gates and all Verify commands after steps 23–33.

## Output

- **Artifacts:** host-only root-session catalog and route cache; mobile project picker and root-session list.
- **Schema / shape:** encrypted `session.list` results contain only a mobile-safe project list and root-session summaries with `projectKey` and `projectLabel`; the phone never receives `directory`, `worktree`, `parentID`, or SDK request/response metadata.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/opencode-plugin typecheck && pnpm --filter @coderelay/opencode-plugin test` |
| Cipher 🔓 (Lead Orchestrator) | `pnpm --filter @coderelay/mobile typecheck && pnpm --filter @coderelay/mobile test` |
| Cipher 🔓 (Lead Orchestrator) | `pnpm exec turbo run test typecheck` |

## Gate

- ⬜ Every numbered step completed in order under the one-step dispatch rule
- ⬜ Bastion 🧱 (Backend & Scripts Architect) final `[PASS]` on `session-catalog.ts`, `allowlist.ts`, `gateway.ts`, and `index.ts`
- ⬜ Crucible 🔥 (Test Architect) final `[PASS]` on every Phase 08 test file; any `[FAIL]` remediated to `[PASS]` before phase close
- ⬜ Atrium 🏛️ (Frontend Architect) final `[PASS]` on mobile source edits
- ⬜ Lumen ✨ (Visual Director) final `[PASS]`, or a user-accepted `[ADVISORY]` recorded under `## Resolved decisions`
- ⬜ Verify commands exit 0
- ⬜ Manual Android retry recorded — project picker separates projects, excludes subagents, and selected root sessions load and send — or explicitly blocked with evidence

## Abort conditions

- Halt if project listing requires accepting a directory or worktree from the phone.
- Halt if directory/worktree/parentID or raw SDK wrapper metadata would cross the encrypted mobile boundary.
- Halt if routing a selected root session requires a seventh mobile action or broadens the SDK allowlist beyond the six mobile operations.
- Halt if the global event stream cannot be aborted during plugin disposal.
- Halt if a project picker would expose a child session or fail to reset the selected session across projects.
- Halt if any per-step gate cannot reach final `[PASS]` after remediation.
