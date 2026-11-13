// @vitest-environment jsdom
/**
 * Interaction tests for the add-workspace dialog's chooser fallback.
 *
 * A Host composed for in-app browsing refuses the native chooser. These cases
 * pin the recovery that keeps the dialog useful: the owner's request token
 * starts exactly one Host listing, a failed listing leaves manual entry
 * available, and closing aborts a pending request.
 */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AddWorkspaceDialog, type AddWorkspaceDialogProps } from '../src/ui/dialogs.js'
import type { DirectoryListingInfo } from '../src/ui/runtime.js'

afterEach(cleanup)

const listing: DirectoryListingInfo = {
  path: '/home/me',
  home: '/home/me',
  crumbs: [],
  entries: [{ name: 'projects', path: '/home/me/projects' }],
  truncated: false,
}

function dialogProps(overrides: Partial<AddWorkspaceDialogProps> = {}): AddWorkspaceDialogProps {
  return {
    busy: false,
    error: null,
    onPickDirectory: () => {},
    onListDirectory: async () => listing,
    onSubmit: () => {},
    onClose: () => {},
    ...overrides,
  }
}

function renderDialog(overrides: Partial<AddWorkspaceDialogProps> = {}) {
  const props = dialogProps(overrides)
  const view = render(<AddWorkspaceDialog {...props} />)
  return { ...view, props }
}

describe('add workspace dialog chooser fallback', () => {
  it('does not list the Host for an ordinary manual opening', () => {
    const onListDirectory = vi.fn(async () => listing)
    renderDialog({ onListDirectory })
    expect(onListDirectory).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '添加工作区' })).toBeTruthy()
  })

  it('lists the Host once when a chooser refusal asks for it', async () => {
    const onListDirectory = vi.fn(async () => listing)
    renderDialog({ browseRequest: 1, onListDirectory })
    await waitFor(() => expect(onListDirectory).toHaveBeenCalledTimes(1))
    expect(onListDirectory).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))
    expect(await screen.findByRole('button', { name: /projects/ })).toBeTruthy()
    expect((screen.getByLabelText('主机目录路径') as HTMLInputElement).value).toBe('/home/me')
  })

  it('handles each request token once and lists again for a new refusal', async () => {
    const onListDirectory = vi.fn(async () => listing)
    const { rerender } = render(<AddWorkspaceDialog {...dialogProps({ browseRequest: 1, onListDirectory })} />)
    await waitFor(() => expect(onListDirectory).toHaveBeenCalledTimes(1))

    // A re-render, including one from a parent state update, must not repeat
    // the request the token already consumed.
    rerender(<AddWorkspaceDialog {...dialogProps({ browseRequest: 1, onListDirectory })} />)
    await act(async () => { await Promise.resolve() })
    expect(onListDirectory).toHaveBeenCalledTimes(1)

    rerender(<AddWorkspaceDialog {...dialogProps({ browseRequest: 2, onListDirectory })} />)
    await waitFor(() => expect(onListDirectory).toHaveBeenCalledTimes(2))
    expect(onListDirectory).toHaveBeenLastCalledWith(undefined, expect.any(AbortSignal))
  })

  it('keeps manual entry usable when the fallback listing fails', async () => {
    const onListDirectory = vi.fn(async () => {
      throw new Error('当前 DSH 运行环境未启用应用内目录浏览，请直接输入主机上的绝对路径。')
    })
    const onSubmit = vi.fn()
    renderDialog({
      browseRequest: 1,
      error: '系统目录选择器不可用：directory picker failed: unavailable。已尝试改用应用内浏览运行 DSH 的主机目录；也可直接输入绝对路径。',
      onListDirectory,
      onSubmit,
    })
    expect(await screen.findByText('当前 DSH 运行环境未启用应用内目录浏览，请直接输入主机上的绝对路径。')).toBeTruthy()
    expect(screen.getByText(/directory picker failed: unavailable/)).toBeTruthy()

    const input = screen.getByLabelText('主机目录路径') as HTMLInputElement
    fireEvent.change(input, { target: { value: '/srv/manual' } })
    fireEvent.click(screen.getByRole('button', { name: '添加工作区' }))
    expect(onSubmit).toHaveBeenCalledWith('/srv/manual')
  })

  it('keeps the fallback listing after a StrictMode mount replay', async () => {
    // StrictMode tears the mount effects down once in development. The first
    // request is aborted by the dialog's unmount guard; the fallback effect
    // must re-arm so the user still gets a listing instead of an empty panel.
    const onListDirectory = vi.fn((_path: string | undefined, signal: AbortSignal) => (
      new Promise<DirectoryListingInfo>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        setTimeout(() => resolve(listing), 0)
      })
    ))
    render(<React.StrictMode>
      <AddWorkspaceDialog {...dialogProps({ browseRequest: 1, onListDirectory })} />
    </React.StrictMode>)
    expect(await screen.findByRole('button', { name: /projects/ })).toBeTruthy()
  })

  it('aborts a pending fallback listing when the dialog closes', async () => {
    let signal: AbortSignal | undefined
    const onListDirectory = vi.fn((_path: string | undefined, requestSignal: AbortSignal) => {
      signal = requestSignal
      return new Promise<DirectoryListingInfo>(() => {})
    })
    const { unmount } = renderDialog({ browseRequest: 1, onListDirectory })
    await waitFor(() => expect(onListDirectory).toHaveBeenCalledTimes(1))
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
