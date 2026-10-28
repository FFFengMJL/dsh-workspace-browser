/**
 * Optional compact replacement for the native workspace/session tree.
 *
 * The native browser is a `sidebar.workspaces` single-slot occupant. A lower
 * `priority` shadows it while our registration lives; disposing that
 * registration makes the native entry the winner again. The preference that
 * decides this is read at plugin load and on every change, so the feature
 * works whether or not the panel is mounted and can be undone at any time.
 *
 * This is a navigation-only entry on purpose: it opens the full panel instead
 * of re-implementing search, drag ordering, or the native directory flow in a
 * 280px column. The one exception is "添加工作区", which opens the panel and
 * asks it for its add dialog — otherwise that action would be unreachable
 * while the native tree is shadowed.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  indexWorkspaceOwners,
  loadBrowserPreferences,
  sidebarSessionRows,
  type BrowserPreferences,
} from '../logic.js'
import { PANEL_ID } from '../panel.js'
import { PanelIcon, PlusIcon } from './icons.js'
import { requestAddWorkspace } from './intents.js'
import {
  browserPreferenceStorage,
  subscribeBrowserPreferences,
  updateBrowserPreferences,
} from './preferences.js'
import {
  readSessionSelection,
  useSource,
  type PluginRuntime,
  type SessionCatalogSnapshot,
  type Source,
  type WorkspaceCatalogSnapshot,
} from './runtime.js'
import { sidebarStyles } from './styles.js'

/** Lowest live priority wins; the native occupant registers at the default 0. */
const SHADOW_PRIORITY = -100

/** Owner props the sidebar passes to whoever occupies `sidebar.workspaces`. */
export interface SidebarEntryOwnerProps {
  /** False while the sidebar is collapsed to its 56px rail. */
  readonly wide: boolean
  /** Ask the shell to expand; the browser rides the wide flip. */
  readonly expandSidebar: () => void
}

export interface CompactSidebarEntryProps extends SidebarEntryOwnerProps {
  readonly layout: PluginRuntime['layout']
  readonly workspaces: Source<WorkspaceCatalogSnapshot>
  readonly sessions: Source<SessionCatalogSnapshot>
  /** Open a session in the native conversation view. */
  readonly openSession: (sessionId: string) => void
}

/**
 * Simplified wide entry: a launcher, the sessions worth resuming, and the
 * explicit way back to DSH's own tree. The rail variant stays a single icon.
 *
 * The session shortcuts are view-local: the Host catalog has no unread flag,
 * so "finished" is derived by watching a running row stop running while it is
 * not the open session. Recent history fills the remaining slots, which keeps
 * the entry useful even when a session finished before it was installed.
 */
export function CompactSidebarEntry({
  wide,
  expandSidebar,
  layout,
  workspaces,
  sessions,
  openSession,
}: CompactSidebarEntryProps): React.JSX.Element {
  const workspaceSnapshot = useSource(workspaces)
  const sessionSnapshot = useSource(sessions)
  const items = workspaceSnapshot.items ?? []
  const sessionIds = sessionSnapshot.ids ?? []
  const sessionsById = sessionSnapshot.byId ?? {}

  const owners = useMemo(() => indexWorkspaceOwners(items), [items])
  const archived = useMemo(
    () => new Set(workspaceSnapshot.archivedSessionIds ?? []),
    [workspaceSnapshot.archivedSessionIds],
  )
  const selection = readSessionSelection(sessionIds, sessionsById)
  const currentSessionId = selection.known ? selection.currentSessionId : undefined

  // View-local completion tracker; see the component comment.
  const runningRef = useRef<ReadonlySet<string> | null>(null)
  const [finishedIds, setFinishedIds] = useState<readonly string[]>([])

  useEffect(() => {
    const running = new Set(sessionIds.filter((id) => sessionsById[id]?.running === true))
    const previous = runningRef.current
    runningRef.current = running
    if (!previous) return
    const finished = [...previous].filter((id) => !running.has(id) && sessionsById[id] !== undefined)
    if (finished.length === 0) return
    setFinishedIds((current) => [...new Set([...finished, ...current])].slice(0, 8))
  }, [sessionIds, sessionsById])

  useEffect(() => {
    if (!currentSessionId) return
    setFinishedIds((current) => current.includes(currentSessionId)
      ? current.filter((id) => id !== currentSessionId)
      : current)
  }, [currentSessionId])

  const sessionRows = useMemo(() => sidebarSessionRows({
    ids: sessionIds,
    sessionsById,
    owners,
    archivedIds: archived,
    currentSessionId,
    finishedIds,
    limit: 5,
  }), [sessionIds, sessionsById, owners, archived, currentSessionId, finishedIds])

  const openBrowser = () => {
    if (!wide) expandSidebar?.()
    try {
      layout.selectPanel(PANEL_ID)
    } catch (error) {
      // The panel may be temporarily unregistered (for example during a
      // plugin reload); the native tree stays one click away.
      console.warn('dsh-workspace-browser: 无法打开工作区浏览器。', error)
    }
  }

  const addWorkspace = () => {
    openBrowser()
    requestAddWorkspace()
  }

  const restoreNative = () => {
    updateBrowserPreferences({ simplifySidebar: false })
  }

  const openSessionById = (id: string) => {
    setFinishedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : current)
    try {
      openSession(id)
    } catch (error) {
      console.warn('dsh-workspace-browser: 无法打开会话。', error)
    }
  }

  if (!wide) {
    return <button
      className="wb-sidebar-rail"
      type="button"
      title="工作区浏览器（展开侧栏）"
      aria-label="工作区浏览器"
      onClick={openBrowser}
    >
      <PanelIcon size={18} />
    </button>
  }

  const count = items.length
  const loading = workspaceSnapshot.state === 'loading' || workspaceSnapshot.state === 'error'

  return <section className="wb-sidebar-entry" aria-label="工作区浏览器入口">
    <style>{sidebarStyles}</style>
    <div className="wb-sidebar-entry-head">
      <span className="wb-sidebar-entry-title">工作区</span>
      <span className="wb-sidebar-entry-count">
        {loading ? '读取中…' : `${count} 个`}
      </span>
    </div>
    <button className="wb-sidebar-entry-primary" type="button" onClick={openBrowser}>
      <PanelIcon size={16} />
      <span>打开工作区浏览器</span>
    </button>

    {sessionRows.length > 0 && <div className="wb-sidebar-sessions" aria-label="当前与最近会话">
      <div className="wb-sidebar-sessions-head">
        <span>当前与最近</span>
        <span>{sessionRows.length} 项</span>
      </div>
      {sessionRows.map((row) => <button
        key={row.id}
        type="button"
        className="wb-sidebar-session"
        title={`${row.title}${row.owner ? ` · ${row.owner}` : ''}`}
        onClick={() => openSessionById(row.id)}
      >
        <span className={row.running ? 'wb-sidebar-session-dot is-running' : 'wb-sidebar-session-dot'} />
        <span className="wb-sidebar-session-body">
          <span className="wb-sidebar-session-line">
            <span className="wb-sidebar-session-title">{row.title}</span>
            {row.reason === 'current' && <span className="wb-sidebar-session-state">当前</span>}
            {row.reason === 'finished' && <span className="wb-sidebar-session-state">刚完成</span>}
          </span>
          {row.owner && <span className="wb-sidebar-session-owner">{row.owner}</span>}
        </span>
      </button>)}
    </div>}

    <div className="wb-sidebar-entry-actions">
      <button type="button" onClick={addWorkspace}>
        <PlusIcon size={14} />
        <span>添加工作区</span>
      </button>
      <button type="button" className="wb-sidebar-entry-restore" onClick={restoreNative}>
        恢复原生会话树
      </button>
    </div>
    <p className="wb-sidebar-entry-hint">原生搜索与添加目录快捷键需恢复原生树后使用。此入口可随时关闭。</p>
  </section>
}

/** Dependencies of the shadow controller, injectable for tests. */
export interface SidebarControllerDeps {
  readonly slots: PluginRuntime['slots']
  /** Foreground preference reader. */
  readonly readPreferences: () => BrowserPreferences
  /** Foreground subscription; the local event fires in this tab too. */
  readonly subscribePreferences: (listener: (preferences: BrowserPreferences) => void) => () => void
  /**
   * Correct the preference when the shadow cannot be installed.
   *
   * Optional so tests can observe the failure path without a storage layer.
   */
  readonly writePreferences?: (patch: Partial<BrowserPreferences>) => void
  /** Component registered for the slot while the preference is on. */
  readonly component: unknown
}

function asDisposer(value: unknown): () => void {
  return typeof value === 'function' ? value as () => void : () => {}
}

/**
 * Keep the shadow registration in step with the preference.
 *
 * Returns a disposer that removes both the subscription and any live entry.
 * Registering when the preference is already on happens synchronously, so the
 * shadow is in place before the sidebar's first render; if another plugin
 * already occupies this priority the native tree is kept and a warning is
 * logged rather than taking the sidebar down.
 */
export function createSidebarController(deps: SidebarControllerDeps): () => void {
  let disposeEntry: (() => void) | undefined
  let disposed = false

  // The event carries the new preferences. Using it (rather than re-reading
  // storage) keeps this working when the browser refused the write and the
  // panel is running memory-only.
  const sync = (preferences?: BrowserPreferences) => {
    if (disposed) return
    const current = preferences ?? deps.readPreferences()
    const enabled = current.simplifySidebar === true
    if (enabled && !disposeEntry) {
      try {
        disposeEntry = asDisposer(deps.slots.register(
          { name: 'sidebar.workspaces', priority: SHADOW_PRIORITY },
          deps.component,
        ))
      } catch (error) {
        console.warn('dsh-workspace-browser: 简化侧栏未启用，保留原生会话树。', error)
        // Leaving the toggle checked while the native tree is still in place
        // would be a silent lie; switch it back off so the panel reflects what
        // is actually rendered.
        deps.writePreferences?.({ simplifySidebar: false })
      }
      return
    }
    if (!enabled && disposeEntry) {
      const dispose = disposeEntry
      disposeEntry = undefined
      dispose()
    }
  }

  sync()
  const unsubscribe = deps.subscribePreferences((preferences) => sync(preferences))
  return () => {
    disposed = true
    unsubscribe()
    const dispose = disposeEntry
    disposeEntry = undefined
    dispose?.()
  }
}

/**
 * Install the declaration-aware shadow.
 *
 * `slots.inject` runs the callback once per declaration lifetime of
 * `sidebar.workspaces`; its returned disposer tears the controller down when
 * the declaring sidebar unloads. Plugin unload cancels the pending wait and
 * removes any contribution.
 */
export function installSidebarEntry(runtime: PluginRuntime): void {
  runtime.slots.inject('sidebar.workspaces', () => createSidebarController({
    slots: runtime.slots,
    readPreferences: () => loadBrowserPreferences(browserPreferenceStorage()),
    subscribePreferences: subscribeBrowserPreferences,
    writePreferences: updateBrowserPreferences,
    component: (props: SidebarEntryOwnerProps) => <CompactSidebarEntry
      {...props}
      layout={runtime.layout}
      workspaces={runtime.workspaces.list}
      sessions={runtime.sessions.list}
      openSession={(sessionId) => runtime.uiWorkspace.openSession(sessionId)}
    />,
  }))
}
