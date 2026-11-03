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
import { CompactSidebarEntry, type CompactSidebarEntryProps } from '../src/ui/sidebar.js'
import type { Source } from '../src/ui/runtime.js'

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
}) {
  const startSession = options.startSession ?? vi.fn()
  const remove = options.remove ?? vi.fn()
  const props = {
    wide: true,
    expandSidebar: () => {},
    layout: {
      panelInfo: source({ activePanelId: null }),
      selectPanel: () => {},
    },
    sessionStatus: source(new Map()),
    workspaces: source({ items: options.items, phase: 'ready' as const, state: 'idle' as const }),
    sessions: source({
      ids: [session.id],
      byId: { [session.id]: { ...session, retainedBy: { mainView: 0 } } },
      phase: 'ready' as const,
    }),
    openSession: () => {},
    startSession,
    openedSessions: {
      getSnapshot: () => options.opened,
      subscribe: () => () => {},
      remove,
    },
  } as unknown as CompactSidebarEntryProps
  render(<CompactSidebarEntry {...props} />)
  return { startSession, remove }
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

  it('removes only the opened-session shortcut', () => {
    const remove = vi.fn()
    renderSidebar({ items: [workspace], opened: ['s1'], remove })
    fireEvent.click(screen.getByRole('button', { name: '从已打开会话中移除：Session' }))
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('s1')
  })
})
