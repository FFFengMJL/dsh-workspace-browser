# DSH Workspace Browser Development Guide

This is a client-side DSH plugin. Use [README.md](README.md) for setup,
commands, scope, and release procedures; [README.zh-CN.md](README.zh-CN.md)
is its Chinese counterpart. Keep shared guidance portable; put machine-specific
paths and profile details in an untracked `AGENTS.local.md`.

## Client and Host boundaries

- Keep Cordis registration and the runtime-context narrowing in
  [src/client.tsx](src/client.tsx). When adding a Host service, update its
  `inject` declaration, the narrow ports in [runtime.ts](src/ui/runtime.ts),
  and the loader smoke test together. Resolve the panel services lazily at mount.
- Keep [src/logic.ts](src/logic.ts) React-free and side-effect free. Treat Host
  IDs as opaque strings; consume catalog metadata, not conversation bodies or
  filesystem scans. Mutations go through public DSH client services.
- Preserve the complete-snapshot check in `readSessionSelection`: an unreadable
  row means selection is unknown, even if another row has a positive holder.
  Do not reinterpret missing retention metadata as "no session is open".
  See [adapter tests](tests/runtime.test.ts).
- Subagent filtering uses `origin`, not `parentId`: ordinary forks also have
  parents. A blank session can contain an unsent draft; hiding is not deletion.
- When adding a persisted preference, update its type, defaults, parser, and
  tests together. Missing fields must retain compatible defaults; changing the
  versioned storage key requires a migration plan, not a silent reset.

## Build and package traps

- Use `pnpm build`, not `tsdown` alone. The build wraps the CJS intermediate
  with `window.__ModuleLoader__.load`; the published client entry is not a
  normal ESM module. See [wrap-client.mjs](scripts/wrap-client.mjs).
- Keep React external to the bundle; it is supplied by the Host loader.
- Preserve the lifecycle direction: `verify` -> `check` + `check:package`;
  `check:package` -> `pnpm pack`; `prepack` -> `check`. Making `prepack` call
  `verify` would recurse. See [check-package.mjs](scripts/check-package.mjs).
- Edit sources, not generated `lib/`, `.build/`, or `.release/` output. The
  package check enforces an exact release file set; development instructions
  are not release assets. Update the allowlists deliberately if that changes.

## Verification and documentation

- Run `pnpm verify` for the full automated gate; exact scripts live in
  [package.json](package.json). Use synthetic metadata, not production sessions.
- The [loader smoke test](scripts/check-bundle.mjs) uses a fake context and does
  not render the panel. Unit tests, packaging checks, and an isolated install
  do not establish that dialogs or navigation work in a running profile.
  Report automated checks and actual GUI interaction evidence separately.
- Keep user-facing behavior and installation/release instructions aligned in
  both READMEs. Link to their release procedure instead of duplicating it here;
  releases are built from tags and published from manually reviewed drafts.
