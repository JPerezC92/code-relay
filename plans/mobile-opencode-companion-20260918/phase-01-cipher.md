# Phase 1 — Workspace bootstrap

> **Owner:** Cipher 🔓 (Lead Orchestrator)
> **Pre:** This plan is active; user has authorized execution; no stash overlap remains; Warden 🔒 (Dependency Warden) has not yet been asked to approve because manifests do not exist.
> **Reads:** `plans/mobile-opencode-companion-20260918/plan.md`; https://docs.expo.dev/guides/monorepos/ ; https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository
> **Writes:** package.json; pnpm-workspace.yaml; pnpm-lock.yaml; .npmrc; turbo.json; .gitignore; .env.example; packages/typescript-config/package.json; packages/typescript-config/base.json; packages/protocol/package.json; packages/protocol/tsconfig.json; packages/protocol/src/index.ts; packages/opencode-plugin/package.json; packages/opencode-plugin/tsconfig.json; packages/opencode-plugin/src/index.ts; apps/mobile/package.json; apps/mobile/app.json; apps/mobile/tsconfig.json; apps/mobile/index.ts; apps/mobile/App.tsx; apps/mobile/babel.config.js

## Steps

1. Write root `package.json` with `"private": true`, `"packageManager"` pnpm, scripts `build`, `dev`, `lint`, `typecheck`, and `test` each calling `turbo run` of the same name, and `devDependencies` limited to `turbo` and `typescript` pending Warden 🔒 (Dependency Warden) versions.
2. Write `pnpm-workspace.yaml` with packages `apps/*` and `packages/*`.
3. Write `.npmrc` with exactly `node-linker=hoisted`.
4. Write `turbo.json` tasks `build`, `lint`, `typecheck`, `test` with `dependsOn: ["^build"]` where needed, and `dev` with `persistent: true` and `cache: false`.
5. Modify `.gitignore` by appending `.turbo/`, `.expo/`, `dist/`, `coverage/`, `.env`, `.env.*`, `!.env.example`, `android/`, `ios/`.
6. Write `.env.example` containing only comments that CodeRelay MVP needs no runtime secrets in git; pairing secrets stay on the host and in Android SecureStore.
7. Write `packages/typescript-config/package.json` name `@coderelay/typescript-config` and `base.json` with `strict: true`, `moduleResolution: bundler`, `skipLibCheck: true`.
8. Write stub `packages/protocol/package.json` name `@coderelay/protocol`, `private: true`, scripts `typecheck` and `test`, dependency on the typescript-config workspace, and `packages/protocol/tsconfig.json` extending that base. Write `packages/protocol/src/index.ts` as `export {}`.
9. Write stub `packages/opencode-plugin/package.json` name `@coderelay/opencode-plugin`, `private: true`, `exports` for `.` and `./tui`, scripts `typecheck` and `test`, and `packages/opencode-plugin/src/index.ts` as `export {}`.
10. Write stub `apps/mobile/package.json` name `@coderelay/mobile`, scripts `start`=`expo start`, `android`=`expo start --android`, `typecheck`, `test`. Write `apps/mobile/app.json` with Android package `app.coderelay.mobile`, plugins list empty until Warden 🔒 (Dependency Warden) approves `expo-camera`. Write `apps/mobile/tsconfig.json` with path alias `@/*` -> `src/*`. Write `apps/mobile/babel.config.js` using `babel-preset-expo`. Write `apps/mobile/index.ts` registering `App`. Write `apps/mobile/App.tsx` rendering a single `Text` of `CodeRelay`.
11. Dispatch Warden 🔒 (Dependency Warden) with the proposed dependency set: `turbo`, `typescript`, `expo`, `react`, `react-native`, `expo-camera`, `expo-crypto`, `expo-secure-store`, `@opencode-ai/plugin@1.18.31`, `@opencode-ai/sdk@1.18.31`, `zod`, and the workspace protocol package. Halt on BLOCK.
12. After APPROVE, run `pnpm install` from the repo root. Do not let Forge 🔨 (Implementer) run install.
13. Re-dispatch Warden 🔒 (Dependency Warden) on `pnpm-lock.yaml`. Halt on BLOCK.

## Output

- **Artifact:** `package.json`
- **Schema / shape:** private pnpm workspace root with turbo scripts; lockfile present; three package stubs plus typescript-config compile as empty modules.

## Verify commands

| Executor | Command |
|---|---|
| Cipher 🔓 (Lead Orchestrator) | `test -f package.json -a -f pnpm-workspace.yaml -a -f turbo.json -a -f pnpm-lock.yaml -a -f packages/protocol/src/index.ts -a -f apps/mobile/App.tsx` |

## Gate

- ⬜ Warden 🔒 (Dependency Warden) APPROVE on the proposed manifests and a later [PASS] or APPROVE on `pnpm-lock.yaml`
- ⬜ Verify command exits 0
- ⬜ No edits under `.aicore/`, `AGENTS.md`, `opencode.jsonc`, or `.opencode/`

## Abort conditions

- Halt if Warden 🔒 (Dependency Warden) returns BLOCK
- Halt if `pnpm install` fails or writes files outside the manifest
- Halt if the user has not authorized execution
