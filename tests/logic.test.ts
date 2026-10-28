import { describe, expect, it } from 'vitest'
import {
  BROWSER_PREFERENCES_KEY,
  ROOT_GROUP_LABEL,
  defaultBrowserPreferences,
  filterSessionIds,
  getUngroupedSessionIds,
  groupWorkspacesByParent,
  indexWorkspaceOwners,
  loadBrowserPreferences,
  matchesQuery,
  parentDirectory,
  parentLabelFor,
  parseBrowserPreferences,
  prioritizePinnedWorkspaces,
  resolvePreferenceStorage,
  saveBrowserPreferences,
  sortWorkspaces,
  splitHiddenWorkspaces,
  type SessionFilterOptions,
  type SessionRecord,
  type WorkspaceRecord,
} from '../src/logic.js'

const session = (id: string, overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  title: id,
  displayTitle: id,
  updatedAt: 0,
  running: false,
  ...overrides,
})

const workspaces: WorkspaceRecord[] = [
  { workspaceId: 'w1', title: 'Alpha', path: '/work/alpha', sessionIds: ['s1', 's2'] },
  { workspaceId: 'w2', title: 'Beta', path: '/work/beta', sessionIds: ['s3'] },
]

/** Call the shared filter with only the fields a case cares about. */
const filter = (
  ids: readonly string[],
  rows: Record<string, SessionRecord>,
  archivedIds: ReadonlySet<string> = new Set(),
  pinnedIds: ReadonlySet<string> = new Set(),
  extra: Partial<SessionFilterOptions> = {},
): string[] => filterSessionIds({ ids, sessionsById: rows, archivedIds, pinnedIds, ...extra })

describe('workspace/session browser logic', () => {
  it('searches metadata case-insensitively without requiring message content', () => {
    expect(matchesQuery('ALP', 'Alpha', '/work/alpha')).toBe(true)
    expect(matchesQuery('s3', 'Beta', 's3')).toBe(true)
    expect(matchesQuery('missing', 'Alpha', '/work/alpha')).toBe(false)
    expect(matchesQuery('   ', 'Alpha')).toBe(true)
  })

  it('derives ungrouped sessions from registered workspace membership', () => {
    expect(getUngroupedSessionIds(workspaces, ['s1', 's2', 's3', 'orphan'])).toEqual(['orphan'])
    expect(getUngroupedSessionIds(workspaces, ['s1', 's2', 's3'])).toEqual([])
    expect(getUngroupedSessionIds([], ['s1'])).toEqual(['s1'])
  })

  it('filters archives and sorts pinned sessions before the selected ordering', () => {
    const rows = { s1: session('s1', { updatedAt: 1 }), s2: session('s2', { updatedAt: 3 }), s3: session('s3', { updatedAt: 2 }) }
    expect(filter(['s1', 's2', 's3'], rows, new Set(['s3']), new Set(['s1']), { order: 'recent' })).toEqual(['s1', 's2'])
    expect(filter(['s1', 's2', 's3'], rows, new Set(['s3']), new Set(), { archivedFilter: 'archived' })).toEqual(['s3'])
    expect(filter(['s1', 's2', 's3'], rows, new Set(), new Set(), { archivedFilter: 'all', order: 'recent' })).toEqual(['s2', 's3', 's1'])
  })

  it('hides delegated subagent sessions by default and keeps plain forks visible', () => {
    const rows = {
      root: session('root', { title: 'Root' }),
      child: session('child', { title: 'Child', origin: 'subagent', parentId: 'root' }),
      fork: session('fork', { title: 'Fork', parentId: 'root' }),
      inherited: session('inherited', { title: 'Unknown origin', parentId: 'root' }),
    }
    expect(filter(['root', 'child', 'fork', 'inherited'], rows)).toEqual(['root', 'fork', 'inherited'])
    expect(filter(['root', 'child', 'fork', 'inherited'], rows, new Set(), new Set(), { showSubagents: true }))
      .toEqual(['root', 'child', 'fork', 'inherited'])
    // Explicit opt-in must not resurrect rows hidden by another rule.
    expect(filter(['root', 'child'], rows, new Set(), new Set(), { showSubagents: true, query: 'root' })).toEqual(['root'])
  })

  it('matches the owning workspace only when an owner index is supplied', () => {
    const rows = { s1: session('s1'), s2: session('s2'), s3: session('s3') }
    const owners = indexWorkspaceOwners(workspaces)
    expect(owners.get('s2')?.workspaceId).toBe('w1')
    expect(owners.get('s3')?.workspaceId).toBe('w2')
    expect(filter(['s1', 's2', 's3'], rows, new Set(), new Set(), { query: 'beta' })).toEqual([])
    expect(filter(['s1', 's2', 's3'], rows, new Set(), new Set(), { query: 'beta', owners })).toEqual(['s3'])
    expect(filter(['s1', 's3'], rows, new Set(), new Set(), { query: '/work/alpha', owners })).toEqual(['s1'])
  })

  it('sorts workspaces while preserving registry order for manual mode', () => {
    const rows = { s1: session('s1', { updatedAt: 100 }), s2: session('s2', { updatedAt: 5 }) }
    expect(sortWorkspaces(workspaces, rows, 'manual').map((row) => row.workspaceId)).toEqual(['w1', 'w2'])
    expect(sortWorkspaces(workspaces, rows, 'name').map((row) => row.title)).toEqual(['Alpha', 'Beta'])
    expect(sortWorkspaces(workspaces, rows, 'recent')[0].workspaceId).toBe('w1')
  })

  it('floats pinned workspaces without disturbing either group order', () => {
    const ordered = prioritizePinnedWorkspaces(workspaces, new Set(['w2']))
    expect(ordered.map((row) => row.workspaceId)).toEqual(['w2', 'w1'])
    expect(prioritizePinnedWorkspaces(workspaces, new Set())).toEqual(workspaces)
    // The input array is never mutated.
    expect(workspaces.map((row) => row.workspaceId)).toEqual(['w1', 'w2'])
  })

  it('groups workspaces by parent directory in first-seen order', () => {
    const roots: WorkspaceRecord[] = [
      { workspaceId: 'a', title: 'A', path: '/workspace/projects/a', sessionIds: [] },
      { workspaceId: 'b', title: 'B', path: '/workspace/projects/b', sessionIds: [] },
      { workspaceId: 'c', title: 'C', path: '/workspace/tools/c', sessionIds: [] },
      { workspaceId: 'd', title: 'D', path: '/', sessionIds: [] },
    ]
    expect(groupWorkspacesByParent(roots).map((group) => [group.parent, group.workspaces.map((row) => row.workspaceId)]))
      .toEqual([['/workspace/projects', ['a', 'b']], ['/workspace/tools', ['c']], [ROOT_GROUP_LABEL, ['d']]])
    expect(groupWorkspacesByParent([])).toEqual([])
  })

  it('splits hidden ids into restorable workspaces and stale entries', () => {
    const split = splitHiddenWorkspaces(workspaces, new Set(['w2', 'gone']))
    expect(split.hidden.map((row) => row.workspaceId)).toEqual(['w2'])
    expect(split.missingCount).toBe(1)
    expect(splitHiddenWorkspaces(workspaces, new Set(['w1', 'w2'])).missingCount).toBe(0)
    expect(splitHiddenWorkspaces(workspaces, new Set(['gone'])).hidden).toEqual([])
  })

  it('resolves a delegated session parent label without reading content', () => {
    const rows = {
      root: session('root', { title: '主会话' }),
      child: session('child', { origin: 'subagent', parentId: 'root' }),
      orphanChild: session('orphan-child', { origin: 'subagent', parentId: 'missing' }),
      lone: session('lone'),
    }
    expect(parentLabelFor(rows.child, rows)).toBe('主会话')
    expect(parentLabelFor(rows.orphanChild, rows)).toBe('missing')
    expect(parentLabelFor(rows.lone, rows)).toBeUndefined()
  })

  it('validates and normalizes versioned plugin preferences', () => {
    const parsed = parseBrowserPreferences(JSON.stringify({
      schemaVersion: 1,
      pinnedWorkspaceIds: ['w1', 'w1', '', 42],
      hiddenWorkspaceIds: ['w2'],
      groupBy: 'flat',
      workspaceOrder: 'recent',
      sessionOrder: 'recent',
      archivedFilter: 'archived',
      showSubagents: true,
      density: 'comfortable',
    }))
    expect(parsed).toEqual({
      schemaVersion: 1,
      pinnedWorkspaceIds: ['w1'],
      hiddenWorkspaceIds: ['w2'],
      groupBy: 'flat',
      workspaceOrder: 'recent',
      sessionOrder: 'recent',
      archivedFilter: 'archived',
      showSubagents: true,
      density: 'comfortable',
    })
    expect(parseBrowserPreferences('{broken')).toEqual(defaultBrowserPreferences())
    expect(parseBrowserPreferences('{"schemaVersion":2,"workspaceOrder":"recent"}')).toEqual(defaultBrowserPreferences())
    expect(parseBrowserPreferences('[]')).toEqual(defaultBrowserPreferences())
  })

  it('defaults new preference fields for payloads written by older versions', () => {
    const legacy = parseBrowserPreferences(JSON.stringify({
      schemaVersion: 1,
      pinnedWorkspaceIds: ['w1'],
      hiddenWorkspaceIds: ['w2'],
      groupBy: 'workspace-tree',
      workspaceOrder: 'name',
      sessionOrder: 'manual',
      archivedFilter: 'all',
    }))
    // Existing settings survive; only the fields that did not exist yet default.
    expect(legacy.groupBy).toBe('workspace-tree')
    expect(legacy.pinnedWorkspaceIds).toEqual(['w1'])
    expect(legacy.showSubagents).toBe(false)
    expect(legacy.density).toBe('compact')

    const malformed = parseBrowserPreferences(JSON.stringify({ schemaVersion: 1, showSubagents: 'yes', density: 'huge' }))
    expect(malformed.showSubagents).toBe(false)
    expect(malformed.density).toBe('compact')
  })

  it('persists preferences under the documented key and tolerates unavailable storage', () => {
    let stored: string | null = null
    const writes: Array<[string, string]> = []
    const storage = {
      getItem: (key: string) => key === BROWSER_PREFERENCES_KEY ? stored : null,
      setItem: (key: string, value: string) => {
        writes.push([key, value])
        stored = value
      },
    }
    const preferences = {
      ...defaultBrowserPreferences(),
      hiddenWorkspaceIds: ['w1'],
      showSubagents: true,
      density: 'comfortable' as const,
    }
    expect(saveBrowserPreferences(storage, preferences)).toBe(true)
    expect(writes[0][0]).toBe('dsh-workspace-browser.preferences.v1')
    expect(loadBrowserPreferences(storage)).toEqual(preferences)
    expect(loadBrowserPreferences(null)).toEqual(defaultBrowserPreferences())
    expect(loadBrowserPreferences({ getItem: () => { throw new Error('storage denied') } })).toEqual(defaultBrowserPreferences())
    expect(saveBrowserPreferences({ setItem: () => { throw new Error('quota') } }, preferences)).toBe(false)
    expect(saveBrowserPreferences(undefined, preferences)).toBe(false)
    expect(resolvePreferenceStorage(() => { throw new Error('localStorage getter denied') })).toBeUndefined()
    expect(resolvePreferenceStorage(() => null)).toBeUndefined()
  })

  it('derives a path parent without scanning the filesystem', () => {
    expect(parentDirectory('/work/demo')).toBe('/work')
    expect(parentDirectory('/work/demo/')).toBe('/work')
    expect(parentDirectory('C:\\repo\\demo')).toBe('C:\\repo')
    expect(parentDirectory('/')).toBe('')
  })

  it('handles a large in-memory session catalog without opening history', () => {
    const ids = Array.from({ length: 10_000 }, (_, index) => `session-${index}`)
    const rows = Object.fromEntries(ids.map((id, index) => [id, session(id, { updatedAt: index })]))
    const result = filter(ids, rows, new Set(), new Set(['session-9999']), { query: 'session-', order: 'recent' })
    expect(result).toHaveLength(10_000)
    expect(result[0]).toBe('session-9999')
  })

  it('keeps subagent filtering cheap on a large delegated catalog', () => {
    const ids = Array.from({ length: 5_000 }, (_, index) => `session-${index}`)
    const rows = Object.fromEntries(ids.map((id, index) => [id, index % 2 === 0
      ? session(id, { origin: 'subagent', parentId: 'session-1' })
      : session(id, { updatedAt: index })]))
    expect(filter(ids, rows)).toHaveLength(2_500)
    expect(filter(ids, rows, new Set(), new Set(), { showSubagents: true })).toHaveLength(5_000)
  })
})
