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
import { readSessionSelection, workspaceFailureMessage, type HostSessionRow } from '../src/ui/runtime.js'

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
