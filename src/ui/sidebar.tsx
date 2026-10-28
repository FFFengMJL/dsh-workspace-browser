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
import React, { useMemo, useSyncExternalStore } from 'react'
import {
  groupOpenedSessions,
  isCurrentSidebarSession,
  loadBrowserPreferences,
  sessionBadgeState,
  sessionRowTitle,
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
import { createOpenedSessionController, type OpenedSessionStore } from './openedSessions.js'

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
  readonly sessionStatus: PluginRuntime['uiSession']['sessionStatus']
  readonly workspaces: Source<WorkspaceCatalogSnapshot>
  readonly sessions: Source<SessionCatalogSnapshot>
  /** Open a session in the native conversation view. */
  readonly openSession: (sessionId: string) => void
  readonly openedSessions: OpenedSessionStore
}

/**
 * Simplified wide entry: a launcher, a persistent list of sessions the user
 * actually entered, and an explicit way back to DSH's native tree. The rail
 * variant stays a single icon.
 */
export function CompactSidebarEntry({
  wide,
  expandSidebar,
  layout,
  sessionStatus,
  workspaces,
  sessions,
  openSession,
  openedSessions,
}: CompactSidebarEntryProps): React.JSX.Element {
  const workspaceSnapshot = useSource(workspaces)
  const sessionSnapshot = useSource(sessions)
  const statusSnapshot = useSource(sessionStatus)
  const panelInfo = useSource(layout.panelInfo)
  const globalPanelActive = panelInfo.activePanelId !== null
  const openedIds = useSyncExternalStore(openedSessions.subscribe, openedSessions.getSnapshot, openedSessions.getSnapshot)
  const items = workspaceSnapshot.items ?? []
  const sessionIds = sessionSnapshot.ids ?? []
  const sessionsById = sessionSnapshot.byId ?? {}
  const groups = useMemo(() => groupOpenedSessions(openedIds, items), [openedIds, items])
  const archived = useMemo(() => new Set(workspaceSnapshot.archivedSessionIds ?? []), [workspaceSnapshot.archivedSessionIds])
  const selection = readSessionSelection(sessionIds, sessionsById)
  const currentSessionId = selection.known ? selection.currentSessionId : undefined

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
    try {
      if (archived.has(id)) {
        layout.selectPanel(PANEL_ID)
        return
      }
      openSession(id)
    } catch (error) {
      console.warn('dsh-workspace-browser: 无法打开会话。', error)
    }
  }

  if (!wide) {
    return <>
      <style>{sidebarStyles}</style>
      <button
        className="wb-sidebar-rail"
        type="button"
        title="工作区浏览器（展开侧栏）"
        aria-label="工作区浏览器"
        onClick={openBrowser}
      >
        <PanelIcon size={18} />
      </button>
    </>
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
    <button className={`wb-sidebar-entry-primary${panelInfo.activePanelId === PANEL_ID ? ' is-active' : ''}`} type="button" aria-current={panelInfo.activePanelId === PANEL_ID ? 'page' : undefined} onClick={openBrowser}>
      <PanelIcon size={16} />
      <span>打开工作区浏览器</span>
    </button>

    <div className="wb-sidebar-sessions" aria-label="已打开会话">
      <div className="wb-sidebar-sessions-head">
        <span>已打开会话</span>
        <span>{openedIds.length} 项</span>
      </div>
      {groups.length === 0 && <p className="wb-sidebar-empty">进入会话后会显示在这里</p>}
      {groups.map((group) => <section className="wb-sidebar-group" key={group.workspaceId === undefined ? 'unowned' : `workspace:${group.workspaceId}`}>
        <h3 className="wb-sidebar-group-title" title={group.path}>{group.title}</h3>
        {group.ids.map((id) => {
          const session = sessionsById[id]
          if (!session) return null
          if (session.origin === 'subagent') return null
          const isArchived = archived.has(id)
          const isCurrent = isCurrentSidebarSession(id, currentSessionId, globalPanelActive)
          const status = statusSnapshot.get(id as Parameters<typeof statusSnapshot.get>[0])
          const childIds = sessionSnapshot.projectionsBySession?.[id]?.values?.subagentCatalog
          const runningChild = childIds?.some((child) => {
            const childStatus = statusSnapshot.get(child.id as Parameters<typeof statusSnapshot.get>[0])
            return (childStatus?.running ?? sessionsById[child.id]?.running) === true
          }) === true
          const badge = sessionBadgeState(status, session.running, runningChild)
          return <div className={`wb-sidebar-session${isCurrent ? ' is-current' : ''}`} key={id}>
            <button
              type="button"
              className="wb-sidebar-session-open"
              title={isArchived ? '此会话已归档；请在工作区浏览器中筛选归档后恢复' : sessionRowTitle(session)}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={`${sessionRowTitle(session)}，${badge.label}${isArchived ? '，已归档' : ''}`}
              disabled={isArchived}
              onClick={() => openSessionById(id)}
            >
              <span className={`wb-sidebar-session-status is-${badge.kind}`} aria-hidden="true" title={badge.label}>{badge.glyph}</span>
              <span className="wb-sidebar-session-title">{sessionRowTitle(session)}</span>
            </button>
            <button
              type="button"
              className="wb-sidebar-session-remove"
              aria-label={`从已打开会话中移除：${sessionRowTitle(session)}`}
              title="仅移除此快捷入口，不会关闭或删除会话"
              onClick={() => openedSessions.remove(id)}
            >×</button>
          </div>
        })}
      </section>)}
    </div>

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
  runtime.slots.inject('sidebar.workspaces', () => {
    const opened = createOpenedSessionController(runtime.sessions.list)
    const disposeSidebar = createSidebarController({
      slots: runtime.slots,
      readPreferences: () => loadBrowserPreferences(browserPreferenceStorage()),
      subscribePreferences: subscribeBrowserPreferences,
      writePreferences: updateBrowserPreferences,
      component: (props: SidebarEntryOwnerProps) => <CompactSidebarEntry
        {...props}
        layout={runtime.layout}
        sessionStatus={runtime.uiSession.sessionStatus}
        workspaces={runtime.workspaces.list}
        sessions={runtime.sessions.list}
        openSession={(sessionId) => runtime.uiWorkspace.openSession(sessionId)}
        openedSessions={opened.store}
      />,
    })
    return () => {
      disposeSidebar()
      opened.dispose()
    }
  })
}
