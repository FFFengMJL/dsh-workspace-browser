/**
 * Narrow adapter between the DSH client services and this plugin's UI.
 *
 * Why this file exists: the plugin is loaded through Cordis slots, so its
 * runtime context is resolved dynamically. Everything the browser needs is
 * described here as a small port with plain string ids, and the single cast
 * from the host context to these ports lives in the plugin entry
 * (`client.tsx`). Views therefore depend only on this port, which keeps the
 * rendering code free of `any` and of host package internals.
 *
 * Ids are branded strings in the host API (`SessionId`, `WorkspaceId`). The
 * browser only passes them through as opaque keys, so the ports use `string`
 * and never inspect their contents.
 */
import { useCallback, useSyncExternalStore } from 'react'
import type { SessionRecord, SessionSelection, WorkspaceRecord } from '../logic.js'

/**
 * Observable snapshot source: the shape `useSyncExternalStore` needs.
 *
 * The host stores return identity-stable snapshots, so `getSnapshot()` may be
 * called on every render.
 */
export interface Source<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Workspace catalog projection (`ctx.workspaces.list`). */
export interface WorkspaceCatalogSnapshot {
  readonly items?: readonly WorkspaceRecord[]
  /** Registry-global archive set, independent of workspace membership. */
  readonly archivedSessionIds?: readonly string[]
  /** Registry-global pin set, most recently pinned first. */
  readonly pinnedSessionIds?: readonly string[]
  readonly state?: 'idle' | 'loading' | 'error'
}

/**
 * One session row exactly as the Host projects it into `ctx.sessions.list`.
 *
 * The pure logic model (`SessionRecord` in `logic.ts`) stays host-agnostic, so
 * host-only bookkeeping is declared here, at the adapter boundary, and never
 * leaks into the filtering rules. Two Host facts matter to this panel:
 *
 * - `blank` means "no turn has started". It does **not** mean "no draft": an
 *   unsent message can live in a blank session, which is why DSH keeps the
 *   identity around instead of discarding it.
 * - `retainedBy` counts local holders (the main conversation view and others).
 *   It is a UI retention counter, never conversation content.
 */
export interface HostSessionRow extends SessionRecord {
  /** Local holder counts keyed by purpose; `mainView` marks the open session. */
  readonly retainedBy?: Readonly<Record<string, number>>
}

/** Session catalog projection (`ctx.sessions.list`); metadata only. */
export interface SessionCatalogSnapshot {
  /** Host list order; every id has a matching `byId` row. */
  readonly ids?: readonly string[]
  readonly byId?: Readonly<Record<string, HostSessionRow>>
  readonly state?: 'idle' | 'loading' | 'error'
}

/**
 * Read what the catalog says about the session currently open.
 *
 * Mirrors the Host's own rule (`mainView` retention > 0, first match in list
 * order), so lists derived here agree with the native session tree.
 *
 * Holder metadata is trusted only when it is complete. The installed Host
 * writes `retainedBy` on every row (it falls back to an empty holder map, not
 * to omission), but that is an implementation detail of one version, not a
 * contract: a truncated or re-synthesized snapshot could carry the field on
 * some rows only. A missing field on the row that happens to be the open draft
 * would then read as "nothing is open" and hide that draft.
 *
 * The whole list therefore decides `known`, and any unreadable row downgrades
 * the result to "unknown" — even when a holder was already seen, because the
 * caller must not act on a snapshot we could only read halfway.
 */
export function readSessionSelection(
  ids: readonly string[],
  byId: Readonly<Record<string, HostSessionRow>>,
): SessionSelection {
  if (ids.length === 0) return { known: false }
  let currentSessionId: string | undefined
  for (const id of ids) {
    const row = byId[id]
    if (!row || row.retainedBy === undefined) return { known: false }
    // First positive match in list order, the same row the Host picks.
    if (currentSessionId === undefined && (row.retainedBy.mainView ?? 0) > 0) currentSessionId = id
  }
  return { currentSessionId, known: true }
}

/**
 * Navigation and session actions owned by the workspace UI service.
 *
 * These are the plugin's only mutations of DSH state; they call public client
 * services and never rewrite session logs directly.
 */
export interface WorkspaceActions {
  /** Open a known session in the native conversation view. */
  openSession(sessionId: string): void
  /** Open (or reuse) a blank session in a workspace. */
  startSession(workspaceId?: string): void
  archiveSession(sessionId: string, options?: { readonly stopActivity?: boolean }): Promise<void>
  unarchiveSession(sessionId: string): Promise<void>
  pinSession(sessionId: string): Promise<void>
  unpinSession(sessionId: string): Promise<void>
  /** @returns the created child session id. */
  forkSession(sessionId: string): Promise<string>
}

/** Registry-order mutation used by the manual workspace sort buttons. */
export interface WorkspaceOrderActions {
  insertBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<void>
}

/** The host context surface this plugin actually touches. */
export interface PluginRuntime {
  slots: {
    inject(name: string, factory: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): unknown
  }
  workspaces: {
    list: Source<WorkspaceCatalogSnapshot>
    insertBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<void>
  }
  sessions: {
    list: Source<SessionCatalogSnapshot>
  }
  uiWorkspace: WorkspaceActions
  remote: {
    session: {
      rename(request: { sessionId: string; title: string }): Promise<{
        readonly ok: boolean
        readonly error?: { readonly code?: string; readonly message?: string }
      } | undefined>
    }
  }
  layout: unknown
}

/** Props injected into {@link import('./WorkspaceBrowser.js').WorkspaceBrowser}. */
export interface BrowserServices {
  readonly workspaces: Source<WorkspaceCatalogSnapshot>
  readonly sessions: Source<SessionCatalogSnapshot>
  readonly uiWorkspace: WorkspaceActions
  readonly workspaceController: WorkspaceOrderActions
  /** Rename through the public remote; throws a user-facing error on refusal. */
  renameSession(sessionId: string, title: string): Promise<void>
}

/**
 * Translate the runtime context into the port consumed by the view.
 *
 * Called lazily when the panel mounts, so plugin load never requires the
 * remote transport to be ready.
 */
export function createBrowserServices(runtime: PluginRuntime): BrowserServices {
  return {
    workspaces: runtime.workspaces.list,
    sessions: runtime.sessions.list,
    uiWorkspace: runtime.uiWorkspace,
    workspaceController: {
      insertBefore: (workspaceId, beforeWorkspaceId) => runtime.workspaces.insertBefore(workspaceId, beforeWorkspaceId),
    },
    renameSession: async (sessionId, title) => {
      // The remote reports business refusals in the result envelope instead of
      // rejecting; normalize both channels to one thrown error.
      const result = await runtime.remote.session.rename({ sessionId, title })
      if (!result?.ok) {
        throw new Error(result?.error?.message ?? result?.error?.code ?? 'DSH 拒绝了重命名请求')
      }
    },
  }
}

/** Subscribe a component to one host snapshot source. */
export function useSource<T>(source: Source<T>): T {
  const subscribe = useCallback((listener: () => void) => source.subscribe(listener), [source])
  const getSnapshot = useCallback(() => source.getSnapshot(), [source])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
