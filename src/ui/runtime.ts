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
import type { SessionRecord, WorkspaceRecord } from '../logic.js'

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

/** Session catalog projection (`ctx.sessions.list`); metadata only. */
export interface SessionCatalogSnapshot {
  /** Host list order; every id has a matching `byId` row. */
  readonly ids?: readonly string[]
  readonly byId?: Readonly<Record<string, SessionRecord>>
  readonly state?: 'idle' | 'loading' | 'error'
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
