// @vitest-environment jsdom
/**
 * Interaction tests for the panel's add-workspace entry point.
 *
 * These cover the path the reported bug took: the Host chooser refuses under a
 * browse-only composition, so the dialog must open already listing Host
 * directories while keeping cancellation and registration failures distinct.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WorkspaceRecord } from '../src/logic.js'
import { WorkspaceBrowser } from '../src/ui/WorkspaceBrowser.js'
import type {
  BrowserServices,
  DirectoryListingInfo,
  SessionCatalogSnapshot,
  Source,
  WorkspaceCatalogSnapshot,
} from '../src/ui/runtime.js'

afterEach(cleanup)

const source = <T,>(snapshot: T): Source<T> => ({
  getSnapshot: () => snapshot,
  subscribe: () => () => {},
})

const listing: DirectoryListingInfo = {
  path: '/home/me',
  home: '/home/me',
  crumbs: [],
  entries: [{ name: 'projects', path: '/home/me/projects' }],
  truncated: false,
}

interface PanelOverrides {
  readonly pickDirectory?: () => Promise<string | null>
  readonly listDirectory?: (path: string | undefined, signal: AbortSignal) => Promise<DirectoryListingInfo>
  readonly create?: (path: string) => Promise<WorkspaceRecord>
}

function renderPanel(overrides: PanelOverrides = {}) {
  const pickDirectory = overrides.pickDirectory ?? vi.fn(async () => null)
  const listDirectory = overrides.listDirectory ?? vi.fn(async () => listing)
  const create = overrides.create ?? vi.fn(async (path: string) => ({
    workspaceId: 'w1',
    title: 'demo',
    path,
    sessionIds: [],
  }))
  const services: BrowserServices = {
    workspaces: source<WorkspaceCatalogSnapshot>({ items: [], phase: 'ready', state: 'idle' }),
    sessions: source<SessionCatalogSnapshot>({ ids: [], byId: {}, phase: 'ready' }),
    uiWorkspace: {
      pickDirectory,
      openSession: () => {},
      startSession: () => {},
      archiveSession: async () => {},
      unarchiveSession: async () => {},
      pinSession: async () => {},
      unpinSession: async () => {},
      forkSession: async () => 'child',
      listDirectory,
    },
    workspaceController: {
      insertBefore: async () => {},
      create,
      rename: async () => {},
      delete: async () => {},
    },
    renameSession: async () => {},
  }
  render(<WorkspaceBrowser {...services} />)
  return { pickDirectory, listDirectory, create }
}

const addWorkspaceButton = (): HTMLElement =>
  screen.getByRole('button', { name: /添加工作区/ })

describe('panel add workspace flow', () => {
  it('opens the add dialog already browsing after the chooser refuses', async () => {
    const { pickDirectory, listDirectory } = renderPanel({
      pickDirectory: vi.fn(async () => { throw new Error('directory picker failed: unavailable') }),
    })
    fireEvent.click(addWorkspaceButton())

    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('dialog', { name: '添加工作区' })).toBeTruthy()
    // The refusal opened the fallback; the dialog itself starts the one Host
    // listing, so the user does not have to click "browse" after the error.
    expect(await screen.findByRole('button', { name: /projects/ })).toBeTruthy()
    expect(listDirectory).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))
    expect(screen.getByText(/系统目录选择器不可用/)).toBeTruthy()
    expect(screen.getByText(/directory picker failed: unavailable/)).toBeTruthy()
  })

  it('does nothing when the chooser reports cancellation', async () => {
    const { pickDirectory, create } = renderPanel({ pickDirectory: vi.fn(async () => null) })
    fireEvent.click(addWorkspaceButton())

    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog', { name: '添加工作区' })).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('starts a single chooser request for repeated clicks', async () => {
    let resolvePick!: (value: string | null) => void
    const pickDirectory = vi.fn(() => new Promise<string | null>((resolve) => { resolvePick = resolve }))
    renderPanel({ pickDirectory })

    const button = addWorkspaceButton()
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(1))
    await act(async () => { resolvePick(null) })
    expect(screen.queryByRole('dialog', { name: '添加工作区' })).toBeNull()
  })

  it('reports a registration failure without falling back to browsing', async () => {
    const create = vi.fn(async () => {
      throw new Error('该路径在运行 DSH 的主机上不是一个可用的目录，请检查路径是否存在、是否可读。')
    })
    const { listDirectory } = renderPanel({ pickDirectory: async () => '/srv/missing', create })

    fireEvent.click(addWorkspaceButton())
    expect(await screen.findByText('该路径在运行 DSH 的主机上不是一个可用的目录，请检查路径是否存在、是否可读。')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '添加工作区' })).toBeTruthy()
    expect(screen.queryByText(/系统目录选择器不可用/)).toBeNull()
    expect(listDirectory).not.toHaveBeenCalled()
  })

  it('refreshes the Host listing when a retry is refused again', async () => {
    const pickDirectory = vi.fn(async () => { throw new Error('directory picker failed: unavailable') })
    const { listDirectory } = renderPanel({ pickDirectory })

    fireEvent.click(addWorkspaceButton())
    await waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByRole('button', { name: '重新选择系统目录' }))
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(listDirectory).toHaveBeenCalledTimes(2))
  })
})
