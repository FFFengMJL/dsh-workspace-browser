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
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  groupOpenedSessions,
  isCurrentSidebarSession,
  loadBrowserPreferences,
  sectionAvailableHeight,
  sessionBadgeState,
  sessionRowTitle,
  type BrowserPreferences,
} from '../logic.js'
import { PANEL_ID } from '../panel.js'
import { CloseIcon, PanelIcon, PlusIcon } from './icons.js'
import { requestAddWorkspace } from './intents.js'
import {
  browserPreferenceStorage,
  subscribeBrowserPreferences,
  updateBrowserPreferences,
} from './preferences.js'
import {
  readSessionSelection,
  useSource,
  type ContextMenuTriggerProps,
  type PluginRuntime,
  type SessionCatalogSnapshot,
  type SessionMenuTarget,
  type Source,
  type UseContextMenu,
  type WorkspaceCatalogSnapshot,
} from './runtime.js'
import { sidebarStyles } from './styles.js'
import { createOpenedSessionController, type OpenedSessionStore } from './openedSessions.js'

/** Lowest live priority wins; the native occupant registers at the default 0. */
const SHADOW_PRIORITY = -100

/**
 * Host viewport capability for the workspace section (DSH 0.2.2-rc.2+).
 *
 * The shell owns a scrollable viewport above the section and hands the
 * occupant a ref callback for its own vertical scroller. Binding it lets a
 * wheel gesture over the session list move the navigation away first and
 * continue into the list, exactly as the native browser behaves. Older hosts
 * do not supply the hook, which only means the shell keeps native scrolling.
 */
export interface SectionScroller {
  readonly bindScrollerRef: (element: HTMLElement | null) => void
}

/** Owner props the sidebar passes to whoever occupies `sidebar.workspaces`. */
export interface SidebarEntryOwnerProps {
  /** False while the sidebar is collapsed to its 56px rail. */
  readonly wide: boolean
  /** Ask the shell to expand; the browser rides the wide flip. */
  readonly expandSidebar: () => void
  /**
   * The host's shared menu bindings, delivered as a slot standard prop since
   * DSH 0.2.2. Optional so the compact tree still renders on older hosts.
   */
  readonly useContextMenu?: UseContextMenu
  /**
   * Slot hook supplied by the shell's `sidebar.workspaces` inject face since
   * DSH 0.2.2-rc.2. Optional for the same reason as `useContextMenu`.
   */
  readonly useSectionScroller?: () => SectionScroller
}

type SessionBadge = ReturnType<typeof sessionBadgeState>

/** Shared no-op capability so the hook can be called unconditionally. */
const EMPTY_SECTION_SCROLLER: SectionScroller = { bindScrollerRef: () => {} }

/**
 * Hook used when the host predates the section-scroller face.
 *
 * Returning one shared object keeps the binding effect's dependency stable, so
 * an older host re-renders exactly as before instead of rebinding every time.
 */
const useNoSectionScroller = (): SectionScroller => EMPTY_SECTION_SCROLLER

interface SessionOpenButtonProps {
  readonly label: string
  /** Visible row title. */
  readonly name: string
  /** Button tooltip; archived rows explain why they open the panel instead. */
  readonly tooltip: string
  readonly current: boolean
  readonly archived: boolean
  readonly badge: SessionBadge
  /** Undefined for provisional rows, mirroring the native tree's blank-row rule. */
  readonly menuTarget?: SessionMenuTarget
  /** Absent on DSH releases before the shared context menu. */
  readonly useContextMenu?: UseContextMenu
  readonly onOpen: () => void
}

interface MenuSessionOpenButtonProps extends Omit<SessionOpenButtonProps, 'menuTarget' | 'useContextMenu'> {
  readonly menuTarget: SessionMenuTarget
  readonly useContextMenu: UseContextMenu
}

/**
 * Row activation button.
 *
 * Hooks cannot be called conditionally, so the menu-bearing variant is a
 * separate component: a host without the standard prop renders the plain
 * button and keeps the browser context menu.
 */
function SessionOpenButton({ menuTarget, useContextMenu, ...view }: SessionOpenButtonProps): React.JSX.Element {
  if (menuTarget === undefined || useContextMenu === undefined) {
    return <SessionOpenButtonView {...view} />
  }
  return <MenuSessionOpenButton {...view} menuTarget={menuTarget} useContextMenu={useContextMenu} />
}

function MenuSessionOpenButton({ menuTarget, useContextMenu, ...view }: MenuSessionOpenButtonProps): React.JSX.Element {
  const trigger = useContextMenu().getTriggerProps(menuTarget)
  return <SessionOpenButtonView {...view} trigger={trigger} />
}

function SessionOpenButtonView({
  label,
  name,
  tooltip,
  current,
  archived,
  badge,
  onOpen,
  trigger,
}: Omit<SessionOpenButtonProps, 'menuTarget' | 'useContextMenu'> & {
  readonly trigger?: ContextMenuTriggerProps
}): React.JSX.Element {
  return <button
    type="button"
    {...trigger}
    className={`wb-sidebar-session-open${archived ? ' is-archived' : ''}`}
    title={tooltip}
    aria-current={current ? 'page' : undefined}
    aria-label={label}
    onClick={onOpen}
  >
    <span className={`wb-sidebar-session-status is-${badge.kind}`} aria-hidden="true" title={badge.label}>{badge.glyph}</span>
    <span className="wb-sidebar-session-title">{name}</span>
  </button>
}

export interface CompactSidebarEntryProps extends SidebarEntryOwnerProps {
  readonly layout: PluginRuntime['layout']
  readonly sessionStatus: PluginRuntime['uiSession']['sessionStatus']
  readonly workspaces: Source<WorkspaceCatalogSnapshot>
  readonly sessions: Source<SessionCatalogSnapshot>
  /** Open a session in the native conversation view. */
  readonly openSession: (sessionId: string) => void
  /** Open (or reuse) a blank session in one workspace. */
  readonly startSession: (workspaceId: string) => void
  readonly openedSessions: OpenedSessionStore
}

/**
 * Simplified wide entry: a launcher, a persistent list of sessions the user
 * actually entered, and a path to the plugin panel where the compact mode can
 * be turned off. The rail variant stays a single icon.
 */
export function CompactSidebarEntry({
  wide,
  expandSidebar,
  layout,
  sessionStatus,
  workspaces,
  sessions,
  openSession,
  startSession,
  openedSessions,
  useContextMenu,
  useSectionScroller = useNoSectionScroller,
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
  const sessionsRef = useRef<HTMLDivElement>(null)
  const entryRef = useRef<HTMLElement>(null)
  const [sessionsScroll, setSessionsScroll] = useState({ scrollable: false, atEnd: true })
  const sectionScroller = useSectionScroller()

  // Hand the shell the element that actually scrolls this section, so its
  // wheel hand-off can move the navigation away and continue into the list.
  // The rail renders no list; the cleanup releases the binding on collapse and
  // unmount so the shell never forwards a gesture to a detached element.
  useEffect(() => {
    if (!wide) return
    const element = sessionsRef.current
    if (!element) return
    sectionScroller.bindScrollerRef(element)
    return () => sectionScroller.bindScrollerRef(null)
  }, [sectionScroller, wide])

  // The sidebar viewport is shared with the navigation above and the footer
  // below, so the section may only claim the height that is actually left.
  // Measuring it (and re-measuring when the viewport or the navigation
  // changes) lets a long opened-session list fill that space instead of
  // stopping at a fixed cap and leaving a gap above the account entry. A host
  // whose DOM exposes no shared viewport keeps the stylesheet fallback.
  useEffect(() => {
    if (!wide) return
    const entry = entryRef.current
    if (!entry) return
    // The section is rendered inside the shell's workspace cell; the shared
    // viewport is the ancestor that also holds the navigation. The Host marks
    // it in DSH 0.2.2-rc.2; the structural fallback keeps older wrappers
    // working, and a wrong guess is rejected by the offset checks below.
    const cell = entry.parentElement?.parentElement
    const area = (entry.closest('[data-sidebar-scrollport]') as HTMLElement | null) ?? cell?.parentElement ?? null
    if (!area) return
    const measure = () => {
      const areaHeight = area.clientHeight
      // Unlaid-out or hidden trees report zero and must not be trusted.
      if (areaHeight <= 0 || entry.offsetHeight <= 0) return
      // Layout offsets ignore the shell's rail-in transform, the area's scroll
      // position and any page zoom, so they stay comparable with
      // `clientHeight`. A host whose wrappers do not share an offset parent
      // keeps the stylesheet fallback instead of guessing from rects.
      if (entry.offsetParent === null || entry.offsetParent !== area.offsetParent) return
      const entryTop = entry.offsetTop - area.offsetTop
      // The navigation always occupies some space above the section; a zero
      // remainder means the ancestor guess landed on the section's own cell.
      if (!Number.isFinite(entryTop) || entryTop <= 0 || entryTop >= areaHeight) return
      entry.style.setProperty('--wb-sidebar-available', `${sectionAvailableHeight(areaHeight, entryTop)}px`)
    }
    measure()
    // The first frame after mount still runs the shell's entry animation, and
    // the navigation above the section can arrive after this effect, so watch
    // both instead of trusting the first measurement.
    const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(measure) : undefined
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    if (observer) {
      observer.observe(area)
      const navigation = area.firstElementChild
      if (navigation instanceof HTMLElement && !navigation.contains(entry)) observer.observe(navigation)
    }
    const mutations = typeof MutationObserver === 'function'
      ? new MutationObserver(measure)
      : undefined
    mutations?.observe(area, { childList: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      mutations?.disconnect()
      observer?.disconnect()
      entry.style.removeProperty('--wb-sidebar-available')
    }
  }, [wide])

  // Show a fade at the cut edge only while there is more content below. The
  // ResizeObserver covers the entry shrinking; the groups dependency covers
  // rows being added or removed without a size change.
  useEffect(() => {
    if (!wide) return
    const element = sessionsRef.current
    if (!element) return
    const update = () => {
      const scrollable = element.scrollHeight > element.clientHeight + 1
      const atEnd = !scrollable || element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      setSessionsScroll((current) => (
        current.scrollable === scrollable && current.atEnd === atEnd
          ? current
          : { scrollable, atEnd }
      ))
    }
    update()
    element.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined
    observer?.observe(element)
    return () => {
      element.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [groups, wide])

  const openBrowser = () => {
    if (!wide) expandSidebar?.()
    try {
      layout.selectPanel(PANEL_ID)
    } catch (error) {
      // The panel may be temporarily unregistered (for example during a
      // plugin reload); the compact mode can still be turned off from the
      // panel once it is available.
      console.warn('dsh-workspace-browser: 无法打开工作区浏览器。', error)
    }
  }

  const addWorkspace = () => {
    openBrowser()
    requestAddWorkspace()
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

  const startSessionIn = (workspaceId: string) => {
    // The group is derived from the current catalog, but the catalog can
    // change between render and click. Do not send a stale id to the Host.
    if (!items.some((workspace) => workspace.workspaceId === workspaceId)) {
      console.warn('dsh-workspace-browser: 工作区已不存在，无法新建会话。')
      return
    }
    try {
      startSession(workspaceId)
    } catch (error) {
      console.warn('dsh-workspace-browser: 无法在工作区中新建会话。', error)
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

  return <section ref={entryRef} className="wb-sidebar-entry" aria-label="工作区浏览器入口">
    <style>{sidebarStyles}</style>
    <div className="wb-sidebar-entry-head">
      <span className="wb-sidebar-entry-title">工作区</span>
      <span className="wb-sidebar-entry-head-end">
        <span className="wb-sidebar-entry-count">
          {loading ? '读取中…' : `${count} 个`}
        </span>
        <button
          type="button"
          className="wb-sidebar-action wb-sidebar-entry-add"
          title="添加工作区"
          aria-label="添加工作区"
          onClick={addWorkspace}
        >
          <PlusIcon size={14} />
        </button>
      </span>
    </div>
    <button className={`wb-sidebar-entry-primary${panelInfo.activePanelId === PANEL_ID ? ' is-active' : ''}`} type="button" aria-current={panelInfo.activePanelId === PANEL_ID ? 'page' : undefined} onClick={openBrowser}>
      <PanelIcon size={16} />
      <span>打开工作区浏览器</span>
    </button>

    <div className={`wb-sidebar-sessions-wrap${sessionsScroll.scrollable ? ' is-scrollable' : ''}${sessionsScroll.atEnd ? ' is-at-end' : ''}`}>
      <div ref={sessionsRef} className="wb-sidebar-sessions" aria-label="已打开会话">
        <div className="wb-sidebar-sessions-head">
        <span>已打开会话</span>
        <span>{openedIds.length} 项</span>
      </div>
      {groups.length === 0 && <p className="wb-sidebar-empty">进入会话后会显示在这里</p>}
      {groups.map((group) => {
        const groupLabel = group.title.trim() === '' ? '未命名工作区' : group.title
        const workspaceId = group.workspaceId
        return <section className="wb-sidebar-group" key={workspaceId === undefined ? 'unowned' : `workspace:${workspaceId}`}>
          <div className="wb-sidebar-group-head">
            <h3 className="wb-sidebar-group-title" title={group.path ?? groupLabel}>{groupLabel}</h3>
            {workspaceId !== undefined && <button
              type="button"
              className="wb-sidebar-action wb-sidebar-group-add"
              title={`在「${groupLabel}」中新建会话`}
              aria-label={`在「${groupLabel}」中新建会话`}
              onClick={() => startSessionIn(workspaceId)}
            >
              <PlusIcon size={14} />
            </button>}
          </div>
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
            const rowTitle = sessionRowTitle(session)
            return <div className={`wb-sidebar-session${isCurrent ? ' is-current' : ''}`} key={id}>
              <SessionOpenButton
                label={`${rowTitle}，${badge.label}${isArchived ? '，已归档' : ''}`}
                name={rowTitle}
                tooltip={isArchived ? '此会话已归档；请在工作区浏览器中筛选归档后恢复' : rowTitle}
                current={isCurrent}
                archived={isArchived}
                badge={badge}
                menuTarget={session.blank === true ? undefined : {
                  kind: 'session',
                  value: { sessionId: id, displayTitle: session.title ?? '' },
                }}
                useContextMenu={useContextMenu}
                onOpen={() => openSessionById(id)}
              />
              <button
                type="button"
                className="wb-sidebar-action wb-sidebar-session-remove"
                aria-label={`从已打开会话中移除：${rowTitle}`}
                title="仅移除此快捷入口，不会关闭或删除会话"
                onClick={() => openedSessions.remove(id)}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          })}
        </section>
      })}
      </div>
    </div>
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
        startSession={(workspaceId) => runtime.uiWorkspace.startSession(workspaceId)}
        openedSessions={opened.store}
      />,
    })
    return () => {
      disposeSidebar()
      opened.dispose()
    }
  })
}
