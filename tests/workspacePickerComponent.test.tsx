// @vitest-environment jsdom
/**
 * Interaction tests for the searchable workspace picker.
 *
 * These cases cover the behavior that pure search tests cannot: the owner
 * callbacks, keyboard selection, IME safety, and the empty-catalog handoff to
 * the add dialog. The native trigger and session transfer stay with the Host
 * and are deliberately out of scope here.
 */
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { WorkspaceRecord } from '../src/logic.js'
import type { DirectoryListingInfo, WorkspaceCatalogSnapshot, Source } from '../src/ui/runtime.js'
import { EnhancedWorkspacePicker } from '../src/ui/workspacePicker.js'

const workspace = (id: string, title: string, path: string): WorkspaceRecord => ({
  workspaceId: id,
  title,
  path,
  sessionIds: [],
})

const workspaces: readonly WorkspaceRecord[] = [
  workspace('w1', '广州项目', '/srv/guangzhou'),
  workspace('w2', '北京项目', '/srv/beijing'),
  workspace('w3', 'Project Alpha', '/srv/alpha'),
]

beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => (
      setTimeout(() => callback(performance.now()), 0)
    )) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((handle: number) => clearTimeout(handle)) as typeof cancelAnimationFrame
  }
})

afterEach(cleanup)

interface RenderOptions {
  readonly items?: readonly WorkspaceRecord[]
  readonly phase?: 'pending' | 'ready'
  readonly selectedId?: string
  readonly onPick?: (workspaceId: string) => void
  readonly onClose?: () => void
  readonly createWorkspace?: (path: string) => Promise<WorkspaceRecord>
  readonly pickDirectory?: () => Promise<string | null>
  readonly listDirectory?: (path: string | undefined, signal: AbortSignal) => Promise<DirectoryListingInfo>
}

function renderPicker(options: RenderOptions = {}) {
  const snapshot: WorkspaceCatalogSnapshot = {
    items: options.items ?? workspaces,
    phase: options.phase ?? 'ready',
    state: 'idle',
  }
  const source: Source<WorkspaceCatalogSnapshot> = {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  }
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  const onPick = options.onPick ?? vi.fn()
  const onClose = options.onClose ?? vi.fn()
  const createWorkspace = options.createWorkspace ?? (async (path: string) => workspace('created', '新工作区', path))
  const pickDirectory = options.pickDirectory ?? (async () => null)
  const listDirectory = options.listDirectory ?? (async (path: string | undefined) => ({
    path: path ?? '/home',
    crumbs: [],
    entries: [],
    truncated: false,
  }))
  render(<EnhancedWorkspacePicker
    open
    anchorRef={{ current: anchor }}
    selectedId={options.selectedId}
    onPick={onPick}
    onClose={onClose}
    workspaces={source}
    createWorkspace={createWorkspace}
    pickDirectory={pickDirectory}
    listDirectory={listDirectory}
  />)
  return { onPick, onClose }
}

describe('enhanced workspace picker', () => {
  it('shows every workspace and filters by pinyin initials', () => {
    renderPicker()
    expect(screen.getAllByRole('option')).toHaveLength(3)

    fireEvent.change(screen.getByRole('combobox', { name: '搜索工作区' }), { target: { value: 'gzxm' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('广州项目')
    expect(options[0].textContent).toContain('/srv/guangzhou')
  })

  it('picks the active row with Enter', () => {
    const { onPick } = renderPicker()
    const input = screen.getByRole('combobox', { name: '搜索工作区' })
    fireEvent.change(input, { target: { value: '项目' } })
    // Host order is preserved: 广州项目, 北京项目.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('w2')
  })

  it('does not pick while an IME composition is active', () => {
    const { onPick } = renderPicker()
    const input = screen.getByRole('combobox', { name: '搜索工作区' })
    fireEvent.change(input, { target: { value: 'gz' } })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith('w1')
  })

  it('closes on Escape', () => {
    const { onClose } = renderPicker()
    fireEvent.keyDown(screen.getByRole('combobox', { name: '搜索工作区' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps Tab inside the popover and closes after focus leaves', () => {
    const { onClose } = renderPicker()
    const input = screen.getByRole('combobox', { name: '搜索工作区' })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(onClose).not.toHaveBeenCalled()

    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(onClose).toHaveBeenCalledTimes(1)
    outside.remove()
  })

  it('reports a registration failure without blaming the directory picker', async () => {
    const createWorkspace = vi.fn().mockRejectedValue(new Error('目录不可用'))
    renderPicker({
      createWorkspace,
      pickDirectory: async () => '/srv/bad',
    })
    fireEvent.click(screen.getByRole('button', { name: '添加工作区…' }))
    fireEvent.click(await screen.findByRole('button', { name: '重新选择系统目录' }))
    expect(await screen.findByText('目录不可用')).toBeTruthy()
    expect(screen.queryByText(/系统目录选择器不可用/)).toBeNull()
  })

  it('lists the Host directory after the chooser refuses', async () => {
    const listDirectory = vi.fn(async (path: string | undefined) => ({
      path: path ?? '/home/me',
      crumbs: [],
      entries: [{ name: 'projects', path: '/home/me/projects' }],
      truncated: false,
    }))
    renderPicker({
      pickDirectory: async () => { throw new Error('directory picker failed: unavailable') },
      listDirectory,
    })
    fireEvent.click(screen.getByRole('button', { name: '添加工作区…' }))
    fireEvent.click(await screen.findByRole('button', { name: '重新选择系统目录' }))

    expect(await screen.findByText(/系统目录选择器不可用/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: /projects/ })).toBeTruthy()
    expect(listDirectory).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))
  })

  it('reports no matches without picking anything', () => {
    const { onPick } = renderPicker()
    const input = screen.getByRole('combobox', { name: '搜索工作区' })
    fireEvent.change(input, { target: { value: 'nonexistent' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('没有匹配的工作区。')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('opens the add dialog directly for a settled empty catalog', async () => {
    const { onClose } = renderPicker({ items: [], phase: 'ready' })
    expect(onClose).toHaveBeenCalled()
    expect(await screen.findByRole('dialog', { name: '添加工作区' })).toBeTruthy()
  })

  it('does not open the add dialog while the catalog is still pending', () => {
    const { onClose } = renderPicker({ items: [], phase: 'pending' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('正在读取工作区…')).toBeTruthy()
  })
})
