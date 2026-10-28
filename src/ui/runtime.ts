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
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
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
  /** Host list order; every id has a matching `byId` row when phase is ready. */
  readonly ids?: readonly string[]
  readonly byId?: Readonly<Record<string, HostSessionRow>>
  /** Public Session Controller baseline lifecycle; only `ready` proves catalog completeness. */
  readonly phase?: 'pending' | 'ready'
  /** Direct-child projection, when public catalog metadata has materialized it. */
  readonly projectionsBySession?: Readonly<Record<string, {
    readonly values?: { readonly subagentCatalog?: readonly { readonly id: string }[] }
  }>>
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
 * User-facing text for a rejected Workspace command.
 *
 * The client service funnels every Host refusal through `commandError`, which
 * flattens the structured `RemoteFailure` into
 * `workspace <operation> failed: <code>: <message>`. The code survives only in
 * that string, so it is recovered from there; an unrecognized shape falls back
 * to the Host text instead of inventing a reason. The dialog pre-checks the two
 * avoidable refusals (blank and duplicate titles) so this is the rare path: a
 * lost race, or a workspace removed in another tab.
 */
const WORKSPACE_FAILURE_TEXT: Readonly<Record<string, string>> = {
  'workspace/name-conflict': '该名称已被其他工作区使用，请换一个。',
  'gateway/bad-request': '工作区名称不能为空。',
  'workspace/not-found': '该工作区已不存在，可能已在其他地方被删除。',
  'workspace/invalid-path': '该路径在运行 DSH 的主机上不是一个可用的目录，请检查路径是否存在、是否可读。',
}

export function workspaceFailureMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const code = /^workspace [a-z ]+ failed: ([^:\s]+):/.exec(raw)?.[1]
  return (code !== undefined ? WORKSPACE_FAILURE_TEXT[code] : undefined) ?? raw
}

/** One directory row returned by the Host directory picker. */
export interface DirectoryEntryInfo {
  readonly name: string
  readonly path: string
  /** Host marks dot-directories and similar hidden entries. */
  readonly hidden?: boolean
}

/** One Host directory listing, reduced to what the add dialog renders. */
export interface DirectoryListingInfo {
  readonly path: string
  /** Host home directory, used as the browse starting point. */
  readonly home?: string
  readonly crumbs: readonly DirectoryEntryInfo[]
  readonly entries: readonly DirectoryEntryInfo[]
  /** The Host stopped listing early; the view must say so. */
  readonly truncated: boolean
}

/**
 * Normalize an untrusted directory listing.
 *
 * The listing crosses the remote transport, so a malformed row must be
 * dropped rather than crash the dialog; only identity fields are kept.
 */
export function normalizeDirectoryListing(raw: unknown): DirectoryListingInfo {
  const record = raw !== null && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const entry = (value: unknown): DirectoryEntryInfo | null => {
    if (value === null || typeof value !== 'object') return null
    const item = value as Record<string, unknown>
    if (typeof item.name !== 'string' || typeof item.path !== 'string') return null
    return item.hidden === true
      ? { name: item.name, path: item.path, hidden: true }
      : { name: item.name, path: item.path }
  }
  const entries = (value: unknown): DirectoryEntryInfo[] => Array.isArray(value)
    ? value.map(entry).filter((item): item is DirectoryEntryInfo => item !== null)
    : []
  return {
    path: typeof record.path === 'string' ? record.path : '',
    home: typeof record.home === 'string' ? record.home : undefined,
    crumbs: entries(record.crumbs),
    entries: entries(record.entries),
    truncated: record.truncated === true,
  }
}

/** User-facing text for a refused directory listing. */
const DIRECTORY_FAILURE_TEXT: Readonly<Record<string, string>> = {
  'directory-picker/unavailable': '当前 DSH 运行环境未启用应用内目录浏览，请直接输入主机上的绝对目录路径。',
  'directory-picker/not-found': '该目录不存在或无法访问。',
  'directory-picker/not-a-directory': '该路径不是目录。',
  'directory-picker/denied': '没有读取该目录的权限。',
}

/**
 * Recover a friendly directory-browse message from a structured refusal.
 *
 * The client wraps a failed listing in `DirectoryBrowseError`, whose
 * `rpcError.code` is the only stable part; an unrecognized shape falls back to
 * the transport text instead of inventing a cause.
 */
export function directoryFailureMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const code = (error as { rpcError?: { code?: unknown } } | null | undefined)?.rpcError?.code
  return (typeof code === 'string' ? DIRECTORY_FAILURE_TEXT[code] : undefined) ?? raw
}

/**
 * Navigation and session actions owned by the workspace UI service.
 *
 * These are the plugin's only mutations of DSH state; they call public client
 * services and never rewrite session logs directly.
 */
export interface WorkspaceActions {
  /** Open the DSH host's native directory chooser; null means the operator cancelled. */
  pickDirectory(): Promise<string | null>
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
  /**
   * List one Host directory level for the add-workspace dialog.
   *
   * The Host backend decides whether this is available; a native-only
   * composition refuses with `directory-picker/unavailable`, which the caller
   * surfaces while keeping the manual path field usable.
   */
  listDirectory(path?: string, signal?: AbortSignal): Promise<DirectoryListingInfo>
}

/** Registry mutations: manual order plus the workspace's own registration. */
export interface WorkspaceRegistryActions {
  insertBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<void>
  /**
   * Register an existing Host directory.
   *
   * Path canonicalization, existence, permissions and repeat-path resolution
   * are Host decisions; the returned row is the authoritative workspace.
   */
  create(path: string): Promise<WorkspaceRecord>
  /** Rename through the public client service; throws a user-facing error on refusal. */
  rename(workspaceId: string, title: string): Promise<void>
  /** Remove the registration only; DSH keeps the directory and every session log. */
  delete(workspaceId: string): Promise<void>
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
    create(input: { path: string }): Promise<{
      readonly workspaceId: string
      readonly title: string
      readonly path: string
      readonly sessionIds?: readonly string[]
    }>
    /** Return value is unused: the client service merges the row itself. */
    rename(workspaceId: string, title: string): Promise<unknown>
    delete(workspaceId: string): Promise<void>
  }
  sessions: {
    list: Source<SessionCatalogSnapshot>
  }
  uiWorkspace: WorkspaceActions
  uiSession: {
    readonly sessionStatus: Source<SessionStatusSnapshot>
  }
  remote: {
    session: {
      rename(request: { sessionId: string; title: string }): Promise<{
        readonly ok: boolean
        readonly error?: { readonly code?: string; readonly message?: string }
      } | undefined>
    }
  }
  /** Panel navigation used by the compact sidebar entry. */
  layout: {
    readonly panelInfo: Source<{ readonly activePanelId: string | null }>
    selectPanel(panelId: string | null): void
  }
}

/** Props injected into {@link import('./WorkspaceBrowser.js').WorkspaceBrowser}. */
export interface BrowserServices {
  readonly workspaces: Source<WorkspaceCatalogSnapshot>
  readonly sessions: Source<SessionCatalogSnapshot>
  readonly uiWorkspace: WorkspaceActions
  readonly workspaceController: WorkspaceRegistryActions
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
  const ui = runtime.uiWorkspace
  return {
    workspaces: runtime.workspaces.list,
    sessions: runtime.sessions.list,
    // Delegate instead of spreading: the Host service may expose prototype
    // methods, and the directory methods are adapted explicitly.
    uiWorkspace: {
      pickDirectory: () => ui.pickDirectory(),
      openSession: (sessionId) => ui.openSession(sessionId),
      startSession: (workspaceId) => ui.startSession(workspaceId),
      archiveSession: (sessionId, options) => ui.archiveSession(sessionId, options),
      unarchiveSession: (sessionId) => ui.unarchiveSession(sessionId),
      pinSession: (sessionId) => ui.pinSession(sessionId),
      unpinSession: (sessionId) => ui.unpinSession(sessionId),
      forkSession: (sessionId) => ui.forkSession(sessionId),
      listDirectory: async (path, signal) => {
        try {
          return normalizeDirectoryListing(await ui.listDirectory(path, signal))
        } catch (error) {
          // Preserve the structured refusal as `cause`, but give the dialog a
          // message it can show without knowing the remote error taxonomy.
          throw new Error(directoryFailureMessage(error), { cause: error })
        }
      },
    },
    workspaceController: {
      insertBefore: (workspaceId, beforeWorkspaceId) => runtime.workspaces.insertBefore(workspaceId, beforeWorkspaceId),
      create: async (path) => {
        try {
          const created = await runtime.workspaces.create({ path })
          return {
            workspaceId: created.workspaceId,
            title: created.title,
            path: created.path,
            sessionIds: created.sessionIds ?? [],
          }
        } catch (error) {
          throw new Error(workspaceFailureMessage(error), { cause: error })
        }
      },
      rename: async (workspaceId, title) => {
        try {
          await runtime.workspaces.rename(workspaceId, title)
        } catch (error) {
          throw new Error(workspaceFailureMessage(error), { cause: error })
        }
      },
      delete: async (workspaceId) => {
        try {
          await runtime.workspaces.delete(workspaceId)
        } catch (error) {
          throw new Error(workspaceFailureMessage(error), { cause: error })
        }
      },
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
