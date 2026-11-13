# DSH Workspace Browser

A pure client-side DSH plugin that adds a full-width workspace-first browser. Open the sidebar entry to browse workspaces, inspect their sessions, and hand conversation navigation back to DSH.

## AI implementation disclosure

The bulk of this plugin's implementation, its refactors, and the related documentation were produced by an AI coding agent; the requirements and product direction came from a human. AI authorship is not a guarantee of quality, security, or compatibility — review the source, the tests, and the verified DSH version before relying on it.

## Features

- Workspace grid and detail view, with registry/name/recent-activity ordering and native workspace reordering.
- Workspace cards keep only pin, new session, and a "more" control on the card (icon buttons, one line); hide, rename, move up/down, and delete live in an overflow menu with keyboard, Escape, and outside-click handling.
- Add workspace from the panel through the desktop shell's directory bridge when one is installed, otherwise DSH's native directory chooser; the selected existing host directory is registered through DSH's public workspace service. If the chooser refuses (for example because the Host is composed for in-app browsing), the add dialog opens with its Host directory listing already loading, and retry plus manual path entry remain available; repeat paths resolve to the existing workspace.
- Optional "simplify native session tree": off by default; when on, a compact entry replaces DSH's native workspace/session area. Its "Opened sessions" list records sessions only when actually entered, groups them by current workspace, preserves manual-entry order, and persists locally; removing a shortcut never closes or deletes the session. Long lists scroll inside the entry with a persistent slim scrollbar and a bottom fade while more content is below. The entry measures the space left below the navigation and lets a scrolling list use it, so the list runs down to the account entry instead of stopping above a bottom action row; the add-workspace action is a "+" icon in the section header, and short lists stay compact. On DSH `0.2.2-rc.2`+ the entry also binds the shell's section scroller, so one wheel gesture moves the navigation away first and then continues into the list. Turn it off in the plugin panel's settings (or unload the plugin) to restore the native tree.
- Right-clicking a session row in the compact tree, or pressing the menu key / Shift+F10 while it is focused, opens DSH's shared session menu for that row: copy session ID, rename, pin/unpin, fork, and archive/restore. The host owns these actions, so permissions, dialogs, and failure feedback stay native; the gesture captures that row without opening it.
- Optional "enhance native workspace picker": off by default; when on, the menu opened by the existing workspace button on new/blank-session pages becomes a searchable list. Matching covers title and full-path substrings, toneless full pinyin, and pinyin initials (for example "广州项目" matches "广州", "guangzhou", or "gzxm"). The popover reuses the native menu's surface material, radius, row height, and icon color; the search field uses host theme tokens, and each workspace row shows its name and path on one line. Selection still calls the owner's `onPick`, so session ownership and draft handling stay native; turning it off or unloading the plugin restores the native menu.
- Every real workspace group heading in the compact sidebar has a new-session button on its right. It shares one 24px hover/focus/touch-revealed action style with the per-session remove control, so both controls have the same hit area, radius, icon weight, and alignment. It calls the native `startSession(workspaceId)`; the unowned group has no button.
- Metadata search across workspace names/paths and session titles/IDs, with all/workspace/session scopes. A compact toolbar keeps search and sorting visible and puts filters plus plugin settings behind one disclosure.
- Workspace, parent-directory grouping, and flat-session views; ungrouped sessions are shown without scanning disk or changing ownership.
- Delegated subagent sessions are hidden by default and can be shown with a toggle; the marker comes from the catalog's `origin` field, so ordinary forks stay visible.
- Blank sessions (`blank`) follow the native session tree by default: only the one you have open is listed, labelled "New session / not started yet", and it leaves the list when you switch away. Nothing is deleted — switch on "Show blank sessions" to list every unsent draft and search it by metadata.
- One consistent compact density. A legacy saved "comfortable" value is ignored without resetting other preferences.
- Selective restore for hidden workspaces: search the list, restore individual entries, restore a checked subset, or restore everything.
- Session manual/recent ordering, archive filters, native pin/rename/archive/restore, fork, copy ID, and new-session actions. Status-only actions (including archiving the currently selected session) keep the browser open; opening a session or starting a new one are explicit navigation actions.
- Workspace rename and delete through DSH's public workspace service; deleting removes only the registration, keeps the folder and session logs, and returns those sessions to Ungrouped.
- Responsive layout, visible keyboard focus, and no per-session history loading from the browser.

## Install

The plugin is not published to npm. Releases ship as prebuilt tarballs attached to GitHub Releases; installing one compiles nothing and runs no install scripts.

### From a release tarball (recommended)

1. Open a **published** release and copy its `.tgz` asset URL, for example
   `https://github.com/FFFengMJL/dsh-workspace-browser/releases/download/v0.4.2/dsh-workspace-browser-0.4.2.tgz`.
   Draft releases expose no downloadable assets, so their URLs only resolve after publication.
2. Install it into the profile that runs the Web UI:

   ```sh
   dsh plugin --profile web add <tarball-url>
   ```

   DSH registers the new bundle in that profile as part of the install, so there is no manual `dsh.profile.bundles` edit to make.
3. Restart that profile, then refresh the Web UI. The entry appears in the sidebar panel list.

DSH installs plugins from an npm name, a git address, or a tarball URL. This project uses the tarball form on purpose: a release is already built, so users never need this repository's development dependencies or build-script approvals.

If the bundle is present but switched off, re-enable it in the plugin manager; reinstalling an existing package does not toggle it back on.

Optional integrity check before installing:

```sh
curl -fLO <tarball-url>
curl -fLO <tarball-url>.sha256
sha256sum -c dsh-workspace-browser-0.4.2.tgz.sha256
dsh plugin --profile web add "$PWD/dsh-workspace-browser-0.4.2.tgz"
```

### From a local checkout (development)

1. Run `pnpm install` and `pnpm build` in the repository.
2. Run `dsh plugin --profile <profile> add link:/absolute/path/to/dsh-workspace-browser`.
3. Restart the profile. A `link:` install references your working tree and is not a distributable release.

### Compatibility

The manifest declares DSH `0.2.2-rc.2`, `0.2.2-rc.1`, and `0.2.1-rc.5` as compatible. Release 0.4.2 was built and verified against `0.2.2-rc.2`; on the older two the compact entry uses the fallbacks introduced in 0.4.0 (no section-scroller binding, stylesheet height cap), which the tests exercise with synthetic hosts. The shared session context menu needs `0.2.2-rc.1`; on `0.2.1-rc.5` the compact tree still renders and falls back to the browser's own context menu. From `0.2.2-rc.2` the shell serves the sidebar section from a scrollable viewport and offers a section-scroller hook: the compact tree binds its session list to it, so a wheel gesture moves the navigation away first and continues into the list, and scrolling up returns the list to its top before the navigation reappears. Hosts without that hook keep their own native scrolling. Other versions have not been tested, and DSH's own compatibility check may require an explicit approval before loading an unverified version. The plugin does not patch DSH host code. The `./client` export is a DSH module-loader entry, not a general-purpose ESM import surface.

The client bundle includes `pinyin-pro` 3.29.5 (MIT) for full-pinyin and initials indexing; its copyright and license text are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Scope and known limitations

- Search matches catalog metadata only; it never searches conversation bodies.
- Grouping, ordering, archive filter, subagent visibility, workspace pin/hide, the simplified-sidebar preference, and the enhanced-picker preference persist under the plugin-owned versioned browser key `dsh-workspace-browser.preferences.v1`; opened-session IDs have a separate key, `dsh-workspace-browser.opened-sessions.v1`. Neither stores session titles, paths, or bodies. Same-origin tabs synchronize through local and storage events, with an unavoidable narrow last-writer race because localStorage does not offer transactional read-modify-write; writes refused by the browser fall back to in-memory state. The preference schema remains unchanged; an old saved density field is ignored while every other preference is preserved. Search, detail view, filter expansion, and scroll position remain temporary.
- Rename uses the public `ctx.remote.session.rename` endpoint without rewriting session logs. Archiving a running session requires an in-page confirmation and then requests stop-and-archive through the native workspace service.
- Forking does not navigate automatically; the result notice offers an explicit open action.
- Adding a workspace uses the same chooser chain as DSH's native flow: an installed desktop bridge (`__DSH_DIRECTORY_PICKER__.pick()`) wins, otherwise the public `uiWorkspace.pickDirectory()` is called; the selected path is then registered through `workspaces.create({ path })`. The chooser opens on the DSH host display (not necessarily the remote browser's computer) and depends on the host's configured picker backend and desktop environment; a bridge answer that is neither a non-blank path nor `null` is reported as an error instead of being treated as cancellation. Cancellation has no effect. If the chooser refuses, the add dialog opens, keeps the raw refusal in its message, and immediately starts one `uiWorkspace.listDirectory` request so a browse-only composition is usable without another click; retry, manual entry, and browsing stay available, a failed listing is shown separately from the chooser error, and registration failures are never reported as chooser failures. The path must be an existing host directory; canonicalization, existence, permissions, and repeat-path reuse remain Host decisions. The plugin does not create directories or scan disk. Session deletion/migration and repair of old session ownership remain out of scope.
- "Simplify native session tree" shadows the whole native workspace/session area (header, search, list, and its dialogs) through a lower-priority `sidebar.workspaces` registration. While shadowed, the native search and add-workspace shortcuts still belong to the native registration and may target an unmounted view; turn the option off in the plugin panel's settings when you need them or native conversation-content search. It is an optional compact navigation mode, not a complete replacement for the native tree.
- "Enhance native workspace picker" replaces the picker popover through a lower-priority `conversation.hero.workspace` registration while preserving the native trigger, page, and `onPick` session-transfer semantics. The replacement deliberately does not declare the `conversation.hero.workspace.directoryFlow` child slot: the native picker already declares it, and a second declaration is rejected by the slot registry. Its "Add workspace…" action therefore uses the plugin's existing public directory services (`uiWorkspace.pickDirectory()` / `listDirectory()` and `workspaces.create`), offering the desktop-bridge/Host chooser, manual path entry, and in-app browsing; a refused chooser opens the dialog already loading Host directories. Pinyin uses `pinyin-pro` default readings; there is no polyphonic-combination expansion, typo correction, or path transliteration. Paths match by literal substring. Search reads workspace catalog metadata only and never scans disk or conversation bodies.
- The compact entry does not backfill recent history and has no five-row cap; it records sessions actually entered, seeding at most the reliably selected current session when first upgraded. The current row is highlighted without a "current" tag. Leading status icons use DSH's public unified UI status in priority order: pending interaction, running, unread completion reminder, idle. `completionUnread` is DSH's process-local observed reminder, not durable unread state; if unified status is unavailable, the icon falls back only to catalog running metadata. Delegated subagents are omitted. Archived shortcuts remain listed but cannot be opened directly; clicking one opens the workspace browser to filter and restore it, and the row's shared menu still offers unarchive and copy ID.

Workspace pin/hide markers are plugin-owned browser preferences. They do not change native order, registration, or session ownership. Uninstalling the plugin does not clear its browser preference key. Session pin/archive and workspace reorder/rename/delete actions use DSH public services.

Hidden workspace ids whose workspace is no longer registered are counted separately and never rendered as phantom cards; they stay in storage so a user preference is not silently dropped.

## Development

The build tools set the floor: Node.js 22.18+ (or 24.11+/26+ after the locked `tsdown` retired earlier minors) and pnpm 12.15.0, pinned through `packageManager`. The published plugin itself has no Node runtime requirement beyond what DSH needs.

```sh
pnpm install
pnpm verify     # typecheck, tests, build, loader smoke test, then pack and inspect
```

Individual steps: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:bundle`, `pnpm check`, `pnpm check:package`.

`pnpm check:package` writes the release tarball to `.release/` (git-ignored), unpacks it, and asserts the manifest DSH reads, the exact file set, the loader contract inside the unpacked package, no development paths or secrets, and a SHA-256 checksum. `pnpm pack` runs `pnpm check` through `prepack`, so a tarball is never produced from an unverified build.

Tests cover metadata search, membership derivation, archive and subagent filtering, ordering, pin priority, hidden-workspace splitting, parent-path grouping, workspace-title and path pre-checks, manual move boundaries, Host failure text, directory-listing normalization, compact-sidebar lifecycle and complete selection, opened-session ordering/removal/grouping/pruning and storage fallback, unified status priority, cross-tab preference merging, legacy density compatibility, workspace search indexing (Chinese, English, full pinyin, initials, paths, multiple terms, NFKC), picker shadow lifecycle and component keyboard/IME interaction, the sidebar group new-session button, compact-sidebar session menu gestures (pointer, keyboard, archived, blank, and older-host fallback), the section-scroller binding (mount, unmount, rail, older-host fallback), the section-height measurement (shared offsets, offset-less fallback, unmount cleanup), and the header add-workspace action, and synthetic 10,000-session catalogs. They do not inspect local DSH session bodies or production data.

### Source layout

| Path | Responsibility |
| --- | --- |
| `src/client.tsx` | Cordis boundary: `inject` list, sidebar entry, keyed `main` view, optional compact-sidebar and picker-enhancement installation, and the single runtime-context narrowing. |
| `src/panel.ts` | Stable panel id/title shared by the sidebar entry and the main view. |
| `src/ui/runtime.ts` | Narrow service ports and the snapshot subscription hook; the desktop-bridge/Host chooser adapter, workspace creation, directory-listing normalization, and error text. |
| `src/ui/WorkspaceBrowser.tsx` | Panel state, derived lists, DSH action wiring. |
| `src/ui/cards.tsx` | Presentational workspace card (with its overflow menu) and session row. |
| `src/ui/dialogs.tsx` | Accessible modal shell, archive/rename/delete confirmations, add-workspace path/browse flow, hidden-workspace manager. |
| `src/ui/sidebar.tsx` | Optional compact sidebar entry, shortcuts for entered sessions, native session-menu gesture binding, the header add-workspace and per-group new-session buttons, and the preference-driven shadow controller. |
| `src/ui/workspacePicker.tsx` | Searchable replacement for the native new-session workspace popover, its add-workspace flow, and the preference-driven shadow controller. |
| `src/ui/icons.tsx` | Shared inline SVG icons; no icon dependency. |
| `src/ui/intents.ts` | One-shot add-workspace intent from the sidebar entry to the panel. |
| `src/ui/preferences.ts` | Display preference loading, persistence, and same-tab/cross-tab sync. |
| `src/ui/openedSessions.ts` | Entered-session ID records, safe catalog pruning, and browser-local synchronization. |
| `src/ui/styles.ts` | Single injected stylesheet; the main panel uses one compact layout, with separate sidebar-entry and picker styles. |
| `src/workspaceSearch.ts` | React-free workspace search index: name/path normalization, full pinyin and initials, AND-term filtering. |
| `src/logic.ts` | React-free data rules (filter, sort, group, preference parsing) covered by tests. |
| `scripts/check-bundle.mjs` | Replays the DSH client loader contract and the injected service port. |
| `scripts/check-package.mjs` | Packs, unpacks, and verifies the installable tarball. |

Comments in these files explain constraints rather than restating code: why `origin` and a fork's `parentId` differ, why preferences are plugin-local, why storage failures degrade to memory, and why every list shares one filter.

## Publishing a release

`.github/workflows/release.yml` builds the tarball when you push a `v*` tag and attaches it to a **draft** GitHub Release. The maintainer publishes the draft by hand, so nothing is distributed automatically.

**A release is built from the commit the tag points at.** The workflow checks out `refs/tags/<tag>` explicitly and, before building, asserts that the run came from a tag and that the checked-out `HEAD` equals the commit that triggered the run. It never pulls the tip of `main`, so commits pushed to `main` after tagging cannot slip into the package. A tag names a commit, not a branch: there is no reason to create a branch per release.

1. Set the new version in `package.json` and run `pnpm verify`.
2. Commit, then `git tag v<version>` and push the tag.
3. The workflow fails unless the tag equals `v<version>`; it then rebuilds, re-checks the tarball and its checksum, and opens the draft with generated install notes.
4. Review the draft and press Publish. Until then the asset URL returns nothing; re-running a release for an existing tag fails instead of overwriting published bytes.

CI (`.github/workflows/ci.yml`) runs the same `pnpm verify` on every push and pull request and keeps the tarball as a downloadable artifact. That copy only proves `main` still builds; it is **not** the release source, and the Release workflow does not consume it.

The manifest carries the canonical `repository`, `homepage`, and `bugs` fields, so a package tarball links back to this project.

## Safety and data

The plugin subscribes to workspace/session catalog snapshots and the public session UI-status snapshot. Persisted state contains opaque workspace/session IDs and display/filter preferences only; it does not store conversation bodies, titles, or paths. The plugin does not scan project directories, read credentials or conversation history, add model tools, modify host source, or edit DSH-generated state. Uninstalling it does not delete or move DSH data.

## Contributing and support

Run `pnpm verify` before opening a pull request; describe the DSH version you tested against. Report security-sensitive findings privately through the repository's advisory form rather than a public issue. These checks are a guard against packaging mistakes, not a security audit.

## License

MIT; see [LICENSE](LICENSE).

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
