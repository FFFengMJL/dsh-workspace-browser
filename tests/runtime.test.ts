/**
 * Adapter-level tests for the host facts the panel reads.
 *
 * The rule mirrored here is the Host's own: the session held by the main
 * conversation view is the one whose `mainView` retention is positive. These
 * cases pin that reading — and the "we were not told" case — so a later
 * refactor cannot quietly redefine "current" and either resurrect abandoned
 * blank sessions or hide the one the user is typing in.
 */
import { describe, expect, it } from 'vitest'
import {
  createBrowserServices,
  directoryFailureMessage,
  normalizeDirectoryListing,
  readSessionSelection,
  workspaceFailureMessage,
  type HostSessionRow,
  type PluginRuntime,
} from '../src/ui/runtime.js'

const row = (id: string, overrides: Partial<HostSessionRow> = {}): HostSessionRow => ({
  id,
  displayTitle: id,
  updatedAt: 0,
  running: false,
  ...overrides,
})

describe('host session adapter', () => {
  it('finds the session the main view holds', () => {
    const byId = {
      a: row('a', { retainedBy: {} }),
      b: row('b', { retainedBy: { mainView: 1 } }),
      c: row('c', { retainedBy: { mainView: 2 } }),
    }
    // The Host takes the first positive match in list order, and so do we.
    expect(readSessionSelection(['a', 'b', 'c'], byId)).toEqual({ currentSessionId: 'b', known: true })
    expect(readSessionSelection(['c', 'b'], byId)).toEqual({ currentSessionId: 'c', known: true })
  })

  it('reports no open session when nothing is held, but still reports knowledge', () => {
    const byId = {
      a: row('a', { retainedBy: {} }),
      // A zero count is "was held", not "is held".
      b: row('b', { retainedBy: { mainView: 0 } }),
      c: row('c', { retainedBy: { other: 3 } }),
    }
    // `known` stays true: the catalog does report holders, it just has none
    // for the main view, so the blank rule may hide provisional rows.
    expect(readSessionSelection(['a', 'b', 'c'], byId)).toEqual({ known: true })
  })

  it('stays silent when the catalog reports no holder information at all', () => {
    const byId = { a: row('a'), b: row('b') }
    // Rows from a producer without retention metadata must not be read as
    // "nothing is open", or the blank rule would hide the active draft.
    expect(readSessionSelection(['a', 'b'], byId)).toEqual({ known: false })
    expect(readSessionSelection([], byId)).toEqual({ known: false })
  })

  it('distrusts a partial snapshot instead of hiding the active draft', () => {
    // One row carries holders, another does not: the second could be the open
    // draft, so "nobody holds anything" is not a safe conclusion.
    const partial = {
      a: row('a', { retainedBy: {} }),
      b: row('b'),
    }
    expect(readSessionSelection(['a', 'b'], partial)).toEqual({ known: false })
    // Rows that are not in `ids` do not make the snapshot incomplete.
    expect(readSessionSelection(['a'], { ...partial })).toEqual({ known: true })
    // A row missing from `byId` is equally unreadable.
    expect(readSessionSelection(['a', 'ghost'], { a: row('a', { retainedBy: {} }) })).toEqual({ known: false })
  })

  it('distrusts the whole snapshot when any row is unreadable', () => {
    // One row carries holders, another does not. Even though the holder was
    // already found, a snapshot we could only read halfway is not evidence.
    const partial = {
      open: row('open', { retainedBy: { mainView: 1 } }),
      opaque: row('opaque'),
    }
    expect(readSessionSelection(['open', 'opaque'], partial)).toEqual({ known: false })
    // Rows that are not in `ids` do not make the snapshot incomplete.
    expect(readSessionSelection(['open'], partial)).toEqual({ currentSessionId: 'open', known: true })
    // A row missing from `byId` is equally unreadable.
    expect(readSessionSelection(['a', 'ghost'], { a: row('a', { retainedBy: {} }) })).toEqual({ known: false })
  })

  it('treats an id without a row as unreadable rather than skipping it', () => {
    const byId = { a: row('a', { retainedBy: { mainView: 1 } }) }
    expect(readSessionSelection(['gone', 'a'], byId)).toEqual({ known: false })
    expect(readSessionSelection(['a'], byId)).toEqual({ currentSessionId: 'a', known: true })
    expect(readSessionSelection(['gone'], byId)).toEqual({ known: false })
  })

  it('follows the selection as it moves', () => {
    const before = { a: row('a', { retainedBy: { mainView: 1 } }), b: row('b', { retainedBy: {} }) }
    const after = { a: row('a', { retainedBy: {} }), b: row('b', { retainedBy: { mainView: 1 } }) }
    expect(readSessionSelection(['a', 'b'], before).currentSessionId).toBe('a')
    expect(readSessionSelection(['a', 'b'], after).currentSessionId).toBe('b')
  })
})

describe('workspace command failures', () => {
  it('names the refusals the Host can still produce', () => {
    expect(workspaceFailureMessage(new Error("workspace rename failed: workspace/name-conflict: Workspace name 'Beta' is already in use")))
      .toBe('该名称已被其他工作区使用，请换一个。')
    expect(workspaceFailureMessage(new Error('workspace rename failed: gateway/bad-request: Workspace rename requires a non-blank title')))
      .toBe('工作区名称不能为空。')
    expect(workspaceFailureMessage(new Error('workspace delete failed: workspace/not-found: Workspace "w1" not found')))
      .toBe('该工作区已不存在，可能已在其他地方被删除。')
    // Added workspaces go through the same create command; a bad path is a
    // refusal the dialog must explain without inventing a cause.
    expect(workspaceFailureMessage(new Error('workspace create failed: workspace/invalid-path: /nope does not exist')))
      .toBe('该路径在运行 DSH 的主机上不是一个可用的目录，请检查路径是否存在、是否可读。')
  })

  it('passes through anything it cannot classify', () => {
    // The client service flattens the structured failure into this string, so an
    // unknown code or a transport error must reach the user verbatim instead of
    // being reported as one of the known refusals.
    expect(workspaceFailureMessage(new Error('transport closed'))).toBe('transport closed')
    expect(workspaceFailureMessage(new Error('workspace rename failed: gateway/timeout: slow'))).toBe('workspace rename failed: gateway/timeout: slow')
    expect(workspaceFailureMessage('plain')).toBe('plain')
  })
})

describe('directory listing adapter', () => {
  it('keeps only well-formed directory rows', () => {
    const listing = normalizeDirectoryListing({
      path: '/srv',
      home: '/home/me',
      crumbs: [{ name: 'srv', path: '/srv' }, { name: 'broken' }, null],
      entries: [{ name: 'app', path: '/srv/app', hidden: true }, { path: '/srv/orphan' }, 'nope'],
      truncated: true,
    })
    expect(listing).toEqual({
      path: '/srv',
      home: '/home/me',
      crumbs: [{ name: 'srv', path: '/srv' }],
      entries: [{ name: 'app', path: '/srv/app', hidden: true }],
      truncated: true,
    })
    // A truncated or malformed answer must not crash the dialog.
    expect(normalizeDirectoryListing(null)).toEqual({ path: '', crumbs: [], entries: [], truncated: false })
    expect(normalizeDirectoryListing({ entries: 'not-a-list' })).toEqual({ path: '', crumbs: [], entries: [], truncated: false })
  })

  it('explains an unavailable backend and passes unknown refusals through', () => {
    const unavailable = Object.assign(new Error('directory picker failed'), {
      rpcError: { code: 'directory-picker/unavailable', message: 'native backend' },
    })
    expect(directoryFailureMessage(unavailable)).toContain('未启用应用内目录浏览')
    const notFound = Object.assign(new Error('directory picker failed'), {
      rpcError: { code: 'directory-picker/not-found', message: 'gone' },
    })
    expect(directoryFailureMessage(notFound)).toBe('该目录不存在或无法访问。')
    expect(directoryFailureMessage(new Error('transport closed'))).toBe('transport closed')
    expect(directoryFailureMessage('plain')).toBe('plain')
  })
})

describe('browser service adapter', () => {
  const source = <T,>(snapshot: T): { getSnapshot(): T; subscribe(): () => void } => ({
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  })

  const runtime = (overrides: {
    create?: PluginRuntime['workspaces']['create']
    listDirectory?: PluginRuntime['uiWorkspace']['listDirectory']
  } = {}): PluginRuntime => ({
    slots: { inject: () => {}, register: () => () => {} },
    workspaces: {
      list: source({ items: [] }),
      insertBefore: async () => {},
      create: overrides.create ?? (async (input) => ({
        workspaceId: 'w1',
        title: 'demo',
        path: input.path,
        sessionIds: [],
      })),
      rename: async () => {},
      delete: async () => {},
    },
    sessions: { list: source({ ids: [], byId: {} }) },
    uiSession: { sessionStatus: source(new Map()) },
    uiWorkspace: {
      openSession: () => {},
      startSession: () => {},
      archiveSession: async () => {},
      unarchiveSession: async () => {},
      pinSession: async () => {},
      unpinSession: async () => {},
      forkSession: async () => 'child',
      listDirectory: overrides.listDirectory ?? (async () => ({
        path: '/home/me',
        home: '/home/me',
        crumbs: [],
        entries: [],
        truncated: false,
      })),
    },
    remote: { session: { rename: async () => ({ ok: true }) } },
    layout: { panelInfo: source({ activePanelId: null }), selectPanel: () => {} },
  })

  it('maps a created workspace to the row the panel renders', async () => {
    const services = createBrowserServices(runtime())
    await expect(services.workspaceController.create('/srv/app')).resolves.toEqual({
      workspaceId: 'w1',
      title: 'demo',
      path: '/srv/app',
      sessionIds: [],
    })
  })

  it('turns a create refusal into a user-facing message', async () => {
    const services = createBrowserServices(runtime({
      create: async () => { throw new Error('workspace create failed: workspace/invalid-path: /nope') },
    }))
    await expect(services.workspaceController.create('/nope'))
      .rejects.toThrow('该路径在运行 DSH 的主机上不是一个可用的目录，请检查路径是否存在、是否可读。')
  })

  it('normalizes a listing and preserves the abort signal', async () => {
    const signals: Array<AbortSignal | undefined> = []
    const services = createBrowserServices(runtime({
      listDirectory: async (path, signal) => {
        signals.push(signal)
        return { path: path ?? '/home/me', home: '/home/me', crumbs: [], entries: [{ name: 'app', path: '/home/me/app' }], truncated: false }
      },
    }))
    const controller = new AbortController()
    await expect(services.uiWorkspace.listDirectory('/srv', controller.signal)).resolves.toEqual({
      path: '/srv',
      home: '/home/me',
      crumbs: [],
      entries: [{ name: 'app', path: '/home/me/app' }],
      truncated: false,
    })
    expect(signals[0]).toBe(controller.signal)
  })

  it('wraps a directory refusal with the friendly message', async () => {
    const services = createBrowserServices(runtime({
      listDirectory: async () => {
        throw Object.assign(new Error('directory picker failed'), {
          rpcError: { code: 'directory-picker/unavailable', message: 'native backend' },
        })
      },
    }))
    await expect(services.uiWorkspace.listDirectory(undefined, new AbortController().signal))
      .rejects.toThrow('当前 DSH 运行环境未启用应用内目录浏览，请直接输入主机上的绝对目录路径。')
  })
})
