# DSH Workspace Browser

A pure client-side DSH plugin that adds a full-width workspace-first browser. Open the sidebar entry to browse workspaces, inspect their sessions, and hand conversation navigation back to DSH.

## AI implementation disclosure

The bulk of this plugin's implementation, its refactors, and the related documentation were produced by an AI coding agent; the requirements and product direction came from a human. AI authorship is not a guarantee of quality, security, or compatibility — review the source, the tests, and the verified DSH version before relying on it.

## Features

- Workspace grid and detail view, with registry/name/recent-activity ordering and native workspace reordering.
- Metadata search across workspace names/paths and session titles/IDs, with all/workspace/session scopes.
- Workspace, parent-directory grouping, and flat-session views; ungrouped sessions are shown without scanning disk or changing ownership.
- Delegated subagent sessions are hidden by default and can be shown with a toggle; the marker comes from the catalog's `origin` field, so ordinary forks stay visible.
- Blank sessions (`blank`) follow the native session tree by default: only the one you have open is listed, labelled "New session / not started yet", and it leaves the list when you switch away. Nothing is deleted — switch on "Show blank sessions" to list every unsent draft and search it by metadata.
- Compact (default) and comfortable density for the workspace grid and session rows.
- Selective restore for hidden workspaces: search the list, restore individual entries, restore a checked subset, or restore everything.
- Session manual/recent ordering, archive filters, native pin/rename/archive/restore, fork, copy ID, and new-session actions.
- Responsive layout, visible keyboard focus, and no per-session history loading from the browser.

## Install

The plugin is not published to npm. Releases ship as prebuilt tarballs attached to GitHub Releases; installing one compiles nothing and runs no install scripts.

### From a release tarball (recommended)

1. Open a **published** release and copy its `.tgz` asset URL, for example
   `https://github.com/FFFengMJL/dsh-workspace-browser/releases/download/v0.1.1/dsh-workspace-browser-0.1.1.tgz`.
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
sha256sum -c dsh-workspace-browser-0.1.1.tgz.sha256
dsh plugin --profile web add "$PWD/dsh-workspace-browser-0.1.1.tgz"
```

### From a local checkout (development)

1. Run `pnpm install` and `pnpm build` in the repository.
2. Run `dsh plugin --profile <profile> add link:/absolute/path/to/dsh-workspace-browser`.
3. Restart the profile. A `link:` install references your working tree and is not a distributable release.

### Compatibility

The only verified target is DSH `0.2.1-rc.4`; that is what `dsh.compatibility` in the manifest declares. Other versions have not been tested, and DSH's own compatibility check may require an explicit approval before loading an unverified version. The plugin does not patch DSH host code. The `./client` export is a DSH module-loader entry, not a general-purpose ESM import surface.

## Scope and known limitations

- Search matches catalog metadata only; it never searches conversation bodies.
- Grouping, ordering, archive filter, density, subagent visibility, and workspace pin/hide preferences persist under the plugin-owned versioned browser key `dsh-workspace-browser.preferences.v1` and synchronize across same-origin tabs via `storage` events. They do not sync with the native sidebar or other browser profiles. If browser storage is unavailable, preferences remain in memory for the current page only. Search, detail view, and scroll position remain transient.
- Rename uses the public `ctx.remote.session.rename` endpoint without rewriting session logs. Archiving a running session requires an in-page confirmation and then requests stop-and-archive through the native workspace service.
- Forking does not navigate automatically; the result notice offers an explicit open action.
- Workspace creation remains in the native sidebar. Workspace deletion, session deletion/migration, and repair of old session ownership are out of scope.

Workspace pin/hide markers are plugin-owned browser preferences. They do not change native order, registration, or session ownership. Uninstalling the plugin does not clear its browser preference key. Session pin/archive and workspace reorder actions use DSH public services.

Hidden workspace ids whose workspace is no longer registered are counted separately and never rendered as phantom cards; they stay in storage so a user preference is not silently dropped.

## Development

The build tools set the floor: Node.js 22.18+ (or 24.11+/26+ after the locked `tsdown` retired earlier minors) and pnpm 12.15.0, pinned through `packageManager`. The published plugin itself has no Node runtime requirement beyond what DSH needs.

```sh
pnpm install
pnpm verify     # typecheck, tests, build, loader smoke test, then pack and inspect
```

Individual steps: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:bundle`, `pnpm check`, `pnpm check:package`.

`pnpm check:package` writes the release tarball to `.release/` (git-ignored), unpacks it, and asserts the manifest DSH reads, the exact file set, the loader contract inside the unpacked package, no development paths or secrets, and a SHA-256 checksum. `pnpm pack` runs `pnpm check` through `prepack`, so a tarball is never produced from an unverified build.

Tests cover metadata search, membership derivation, archive and subagent filtering, ordering, pin priority, hidden-workspace splitting, parent-path grouping, preference migration, and synthetic 10,000-session catalogs. They do not inspect local DSH session bodies or production data.

### Source layout

| Path | Responsibility |
| --- | --- |
| `src/client.tsx` | Cordis boundary: `inject` list, sidebar entry, keyed `main` view, and the single runtime-context narrowing. |
| `src/ui/runtime.ts` | Narrow service ports and the snapshot subscription hook; no Cordis calls. |
| `src/ui/WorkspaceBrowser.tsx` | Panel state, derived lists, DSH action wiring. |
| `src/ui/cards.tsx` | Presentational workspace card and session row. |
| `src/ui/dialogs.tsx` | Accessible modal shell, archive/rename confirmations, hidden-workspace manager. |
| `src/ui/preferences.ts` | Preference loading, persistence, and cross-tab sync. |
| `src/ui/styles.ts` | Single injected stylesheet; density lives in CSS custom properties. |
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

The plugin subscribes only to workspace and session catalog snapshots. Its persisted preferences contain workspace IDs and filter enums only; they do not store session bodies or paths. It does not scan project directories, read credentials or conversation history, add model tools, modify host source, or edit DSH-generated state. Uninstalling it does not delete or move DSH data.

## Contributing and support

Run `pnpm verify` before opening a pull request; describe the DSH version you tested against. Report security-sensitive findings privately through the repository's advisory form rather than a public issue. These checks are a guard against packaging mistakes, not a security audit.

## License

MIT; see [LICENSE](LICENSE).

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
