// @vitest-environment jsdom
/**
 * Interaction tests for the compact sidebar's per-workspace new-session button.
 *
 * The group header is derived from the opened-session list, so these cases pin
 * the two easy-to-regress rules: the button exists only for a real workspace
 * group, and one click sends exactly one `startSession(workspaceId)` call.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionRecord, WorkspaceRecord } from '../src/logic.js'
import { CompactSidebarEntry, installSidebarEntry, type CompactSidebarEntryProps, type SectionScroller } from '../src/ui/sidebar.js'
import { PANEL_ID } from '../src/panel.js'
import { BROWSER_PREFERENCES_KEY, OPENED_SESSIONS_KEY } from '../src/logic.js'
import type { PluginRuntime, SessionMenuTarget, Source, UseContextMenu } from '../src/ui/runtime.js'

const source = <T,>(value: T): Source<T> => ({
  getSnapshot: () => value,
  subscribe: () => () => {},
})

const workspace: WorkspaceRecord = {
  workspaceId: 'w1',
  title: 'Alpha',
  path: '/work/alpha',
  sessionIds: ['s1'],
}

const session: SessionRecord = {
  id: 's1',
  title: 'Session',
  displayTitle: 'Session',
  updatedAt: 0,
  running: false,
}

afterEach(cleanup)

function renderSidebar(options: {
  items: readonly WorkspaceRecord[]
  opened: readonly string[]
  startSession?: (workspaceId: string) => void
  remove?: (sessionId: string) => void
  openSession?: (sessionId: string) => void
  selectPanel?: () => void
  archived?: readonly string[]
  blank?: boolean
  current?: boolean
  useContextMenu?: UseContextMenu
  useSectionScroller?: () => SectionScroller
  wide?: boolean
}) {
  const startSession = options.startSession ?? vi.fn()
  const remove = options.remove ?? vi.fn()
  const openSession = options.openSession ?? vi.fn()
  const selectPanel = options.selectPanel ?? vi.fn()
  const props = {
    wide: options.wide ?? true,
    expandSidebar: () => {},
    layout: {
      panelInfo: source({ activePanelId: null }),
      selectPanel,
    },
    sessionStatus: source(new Map()),
    workspaces: source({
      items: options.items,
      archivedSessionIds: options.archived ?? [],
      phase: 'ready' as const,
      state: 'idle' as const,
    }),
    sessions: source({
      ids: [session.id],
      byId: {
        [session.id]: {
          ...session,
          blank: options.blank === true ? true : undefined,
          ...(options.current === false ? {} : { retainedBy: { mainView: 0 } }),
        },
      },
      phase: 'ready' as const,
    }),
    openSession,
    startSession,
    openedSessions: {
      getSnapshot: () => options.opened,
      subscribe: () => () => {},
      remove,
    },
    useContextMenu: options.useContextMenu,
    useSectionScroller: options.useSectionScroller,
  } as unknown as CompactSidebarEntryProps
  render(<CompactSidebarEntry {...props} />)
  return { startSession, remove, openSession, selectPanel }
}

/** Minimal stand-in for DSH's standard hook: records the captured target. */
function fakeMenu(): { useContextMenu: UseContextMenu; captured: SessionMenuTarget[] } {
  const captured: SessionMenuTarget[] = []
  const useContextMenu: UseContextMenu = () => ({
    getTriggerProps: (target) => target === undefined ? {} : {
      onContextMenu: (event) => {
        event.preventDefault()
        captured.push(target as SessionMenuTarget)
      },
      onKeyDown: (event) => {
        if (event.key !== 'ContextMenu') return
        event.preventDefault()
        captured.push(target as SessionMenuTarget)
      },
    },
  })
  return { useContextMenu, captured }
}

describe('compact sidebar group action', () => {
  it('starts a session in the group workspace with one click', () => {
    const { startSession } = renderSidebar({ items: [workspace], opened: ['s1'] })
    fireEvent.click(screen.getByRole('button', { name: '在「Alpha」中新建会话' }))
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(startSession).toHaveBeenCalledWith('w1')
  })

  it('does not offer the action for an unowned group', () => {
    renderSidebar({ items: [], opened: ['s1'] })
    expect(screen.queryByRole('button', { name: /新建会话/ })).toBeNull()
  })

  it('does not send a stale workspace id', () => {
    // The session is opened, but its workspace disappeared from the catalog:
    // the group is unowned, so there is no button to click.
    const { startSession } = renderSidebar({ items: [], opened: ['s1'] })
    expect(screen.queryByRole('button', { name: '在「Alpha」中新建会话' })).toBeNull()
    expect(startSession).not.toHaveBeenCalled()
  })
})

describe('compact sidebar action controls', () => {
  it('gives the group add and row remove buttons one shared action style', () => {
    renderSidebar({ items: [workspace], opened: ['s1'] })
    const add = screen.getByRole('button', { name: '在「Alpha」中新建会话' })
    const remove = screen.getByRole('button', { name: '从已打开会话中移除：Session' })
    for (const button of [add, remove]) {
      expect(button.classList.contains('wb-sidebar-action')).toBe(true)
      expect(button.querySelector('svg')?.getAttribute('width')).toBe('14')
      expect(button.querySelector('svg')?.getAttribute('height')).toBe('14')
    }
  })

  it('keeps the add-workspace action in the section header', () => {
    const { selectPanel } = renderSidebar({ items: [workspace], opened: ['s1'] })
    const add = screen.getByRole('button', { name: '添加工作区' })
    expect(document.querySelector('.wb-sidebar-entry-head')?.contains(add)).toBe(true)
    // The list owns everything below the header, so no bottom action row exists.
    expect(document.querySelector('.wb-sidebar-entry-actions')).toBeNull()
    fireEvent.click(add)
    expect(selectPanel).toHaveBeenCalledWith(PANEL_ID)
  })

  it('removes only the opened-session shortcut', () => {
    const remove = vi.fn()
    renderSidebar({ items: [workspace], opened: ['s1'], remove })
    fireEvent.click(screen.getByRole('button', { name: '从已打开会话中移除：Session' }))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('s1')
  })
})

describe('compact sidebar session menu', () => {
  it('captures the clicked session without opening it', () => {
    const { useContextMenu, captured } = fakeMenu()
    const { openSession } = renderSidebar({
      items: [workspace],
      opened: ['s1'],
      current: false,
      useContextMenu,
    })
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Session，空闲' }))
    expect(captured).toEqual([{ kind: 'session', value: { sessionId: 's1', displayTitle: 'Session' } }])
    // A right-click is a menu gesture, never navigation.
    expect(openSession).not.toHaveBeenCalled()
  })

  it('binds the keyboard menu key to the same target', () => {
    const { useContextMenu, captured } = fakeMenu()
    renderSidebar({ items: [workspace], opened: ['s1'], useContextMenu })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Session，空闲' }), { key: 'ContextMenu' })
    expect(captured).toEqual([{ kind: 'session', value: { sessionId: 's1', displayTitle: 'Session' } }])
  })

  it('keeps an archived row focusable so its menu can restore or copy it', () => {
    const { useContextMenu, captured } = fakeMenu()
    const { openSession, selectPanel } = renderSidebar({
      items: [workspace],
      opened: ['s1'],
      archived: ['s1'],
      useContextMenu,
    })
    const row = screen.getByRole('button', { name: 'Session，空闲，已归档' })
    expect((row as HTMLButtonElement).disabled).toBe(false)
    expect(row.getAttribute('title')).toContain('已归档')
    fireEvent.contextMenu(row)
    expect(captured).toHaveLength(1)
    // Clicking the archived shortcut still routes to the panel, not the session.
    fireEvent.click(row)
    expect(openSession).not.toHaveBeenCalled()
    expect(selectPanel).toHaveBeenCalledTimes(1)
  })

  it('does not bind a menu to a provisional blank row', () => {
    const { useContextMenu, captured } = fakeMenu()
    renderSidebar({ items: [workspace], opened: ['s1'], blank: true, useContextMenu })
    fireEvent.contextMenu(screen.getByRole('button', { name: '新会话，空闲' }))
    expect(captured).toEqual([])
  })

  it('renders without the standard hook on an older host', () => {
    const { openSession } = renderSidebar({ items: [workspace], opened: ['s1'] })
    const row = screen.getByRole('button', { name: 'Session，空闲' })
    expect(() => fireEvent.contextMenu(row)).not.toThrow()
    expect(openSession).not.toHaveBeenCalled()
  })
})

describe('compact sidebar section scroller', () => {
  it('binds the session list to the shell viewport capability', () => {
    const bound: Array<HTMLElement | null> = []
    const useSectionScroller = (): SectionScroller => ({
      bindScrollerRef: (element) => { bound.push(element) },
    })
    renderSidebar({ items: [workspace], opened: ['s1'], useSectionScroller })
    const list = screen.getByLabelText('已打开会话')
    expect(bound).toHaveLength(1)
    expect(bound[0]).toBe(list)
  })

  it('releases the binding on unmount', () => {
    const bound: Array<HTMLElement | null> = []
    const useSectionScroller = (): SectionScroller => ({
      bindScrollerRef: (element) => { bound.push(element) },
    })
    renderSidebar({ items: [workspace], opened: ['s1'], useSectionScroller })
    cleanup()
    expect(bound.at(-1)).toBeNull()
  })

  it('binds nothing while the sidebar is a collapsed rail', () => {
    const bound: Array<HTMLElement | null> = []
    const useSectionScroller = (): SectionScroller => ({
      bindScrollerRef: (element) => { bound.push(element) },
    })
    renderSidebar({ items: [workspace], opened: ['s1'], useSectionScroller, wide: false })
    expect(bound).toHaveLength(0)
  })

  it('renders without the capability on an older host', () => {
    renderSidebar({ items: [workspace], opened: ['s1'] })
    expect(screen.getByLabelText('已打开会话')).toBeTruthy()
  })
})

describe('compact sidebar section height', () => {
  // jsdom reports no layout, so the shared viewport is faked at the prototype
  // level: the rendered container's parent stands in for the shell viewport
  // and the entry reports its offset below the navigation.
  const elementProto = Element.prototype
  const htmlProto = HTMLElement.prototype
  const saved = {
    clientHeight: Object.getOwnPropertyDescriptor(elementProto, 'clientHeight'),
    rect: elementProto.getBoundingClientRect,
    offsetHeight: Object.getOwnPropertyDescriptor(htmlProto, 'offsetHeight'),
    offsetTop: Object.getOwnPropertyDescriptor(htmlProto, 'offsetTop'),
    offsetParent: Object.getOwnPropertyDescriptor(htmlProto, 'offsetParent'),
  }

  afterEach(() => {
    document.body.removeAttribute('data-sidebar-scrollport')
    const restore = (target: object, key: string, descriptor: PropertyDescriptor | undefined) => {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else delete (target as Record<string, unknown>)[key]
    }
    restore(elementProto, 'clientHeight', saved.clientHeight)
    restore(htmlProto, 'offsetHeight', saved.offsetHeight)
    restore(htmlProto, 'offsetTop', saved.offsetTop)
    restore(htmlProto, 'offsetParent', saved.offsetParent)
    elementProto.getBoundingClientRect = saved.rect
  })

  function stubLayout(options: {
    areaHeight: number
    entryTop: number
    sharedOffsets?: { entry: number; area: number }
  }) {
    const { areaHeight, entryTop, sharedOffsets } = options
    document.body.setAttribute('data-sidebar-scrollport', '')
    const isEntry = (element: Element) => element.classList?.contains('wb-sidebar-entry') === true
    const parent = {}
    Object.defineProperty(elementProto, 'clientHeight', {
      configurable: true,
      get(this: Element) { return this === document.body ? areaHeight : 0 },
    })
    elementProto.getBoundingClientRect = function (this: Element) {
      const top = isEntry(this) ? entryTop : 0
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top } as DOMRect
    }
    Object.defineProperty(htmlProto, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) { return isEntry(this) ? 500 : 0 },
    })
    Object.defineProperty(htmlProto, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        if (!sharedOffsets) return 0
        return isEntry(this) ? sharedOffsets.entry : sharedOffsets.area
      },
    })
    Object.defineProperty(htmlProto, 'offsetParent', {
      configurable: true,
      get(this: HTMLElement) { return sharedOffsets ? parent : null },
    })
  }

  it('uses layout offsets so the section fits below the navigation', () => {
    stubLayout({ areaHeight: 794, entryTop: 0, sharedOffsets: { entry: 220, area: 0 } })
    renderSidebar({ items: [workspace], opened: ['s1'] })
    const entry = document.querySelector('.wb-sidebar-entry') as HTMLElement
    expect(entry.style.getPropertyValue('--wb-sidebar-available')).toBe('574px')
  })

  it('keeps the stylesheet fallback when the wrappers share no offset parent', () => {
    stubLayout({ areaHeight: 700, entryTop: 200 })
    renderSidebar({ items: [workspace], opened: ['s1'] })
    const entry = document.querySelector('.wb-sidebar-entry') as HTMLElement
    expect(entry.style.getPropertyValue('--wb-sidebar-available')).toBe('')
  })

  it('keeps the stylesheet fallback when the measurement is implausible', () => {
    stubLayout({ areaHeight: 100, entryTop: 0, sharedOffsets: { entry: 200, area: 0 } })
    renderSidebar({ items: [workspace], opened: ['s1'] })
    const entry = document.querySelector('.wb-sidebar-entry') as HTMLElement
    expect(entry.style.getPropertyValue('--wb-sidebar-available')).toBe('')
  })

  it('drops the measurement when the compact entry unmounts', () => {
    stubLayout({ areaHeight: 794, entryTop: 0, sharedOffsets: { entry: 220, area: 0 } })
    renderSidebar({ items: [workspace], opened: ['s1'] })
    const entry = document.querySelector('.wb-sidebar-entry') as HTMLElement
    cleanup()
    expect(entry.style.getPropertyValue('--wb-sidebar-available')).toBe('')
  })
})

describe('compact sidebar slot boundary', () => {
  it('forwards the shell section-scroller hook through the installed slot component', () => {
    const bound: Array<HTMLElement | null> = []
    const useSectionScroller = (): SectionScroller => ({
      bindScrollerRef: (element) => { bound.push(element) },
    })
    let entry: React.ComponentType<Record<string, unknown>> | undefined
    let disposeEntry = () => {}
    const runtime = {
      slots: {
        inject(_name: string, factory: () => unknown) {
          disposeEntry = factory() as () => void
        },
        register(_options: Record<string, unknown>, component: unknown) {
          entry = component as React.ComponentType<Record<string, unknown>>
          return () => {}
        },
      },
      layout: { panelInfo: source({ activePanelId: null }), selectPanel: () => {} },
      uiSession: { sessionStatus: source(new Map()) },
      workspaces: {
        list: source({ items: [workspace], archivedSessionIds: [], phase: 'ready' as const, state: 'idle' as const }),
      },
      sessions: { list: source({ ids: [session.id], byId: { [session.id]: session }, phase: 'ready' as const }) },
      uiWorkspace: { openSession: () => {}, startSession: () => {} },
    } as unknown as PluginRuntime
    localStorage.setItem(BROWSER_PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, simplifySidebar: true }))
    try {
      installSidebarEntry(runtime)
      render(React.createElement(entry!, { wide: true, expandSidebar: () => {}, useSectionScroller }))
      expect(bound).toEqual([screen.getByLabelText('已打开会话')])
    } finally {
      disposeEntry()
      localStorage.removeItem(BROWSER_PREFERENCES_KEY)
      localStorage.removeItem(OPENED_SESSIONS_KEY)
    }
  })

  it('forwards the host menu hook through the installed slot component', () => {
    const { useContextMenu, captured } = fakeMenu()
    let entry: React.ComponentType<Record<string, unknown>> | undefined
    let disposeEntry = () => {}
    const sessions = source({
      ids: [session.id],
      byId: { [session.id]: { ...session, retainedBy: { mainView: 1 } } },
      phase: 'ready' as const,
    })
    const runtime = {
      slots: {
        inject(_name: string, factory: () => unknown) {
          disposeEntry = factory() as () => void
        },
        register(_options: Record<string, unknown>, component: unknown) {
          entry = component as React.ComponentType<Record<string, unknown>>
          return () => {}
        },
      },
      layout: { panelInfo: source({ activePanelId: null }), selectPanel: () => {} },
      uiSession: { sessionStatus: source(new Map()) },
      workspaces: {
        list: source({ items: [workspace], archivedSessionIds: [], phase: 'ready' as const, state: 'idle' as const }),
      },
      sessions: { list: sessions },
      uiWorkspace: { openSession: () => {}, startSession: () => {} },
    } as unknown as PluginRuntime
    localStorage.setItem(BROWSER_PREFERENCES_KEY, JSON.stringify({ schemaVersion: 1, simplifySidebar: true }))
    try {
      installSidebarEntry(runtime)
      expect(entry).toBeDefined()
      render(React.createElement(entry!, { wide: true, expandSidebar: () => {}, useContextMenu }))
      fireEvent.contextMenu(screen.getByRole('button', { name: 'Session，空闲' }))
      expect(captured).toEqual([{ kind: 'session', value: { sessionId: 's1', displayTitle: 'Session' } }])
    } finally {
      disposeEntry()
      localStorage.removeItem(BROWSER_PREFERENCES_KEY)
      localStorage.removeItem(OPENED_SESSIONS_KEY)
    }
  })
})
