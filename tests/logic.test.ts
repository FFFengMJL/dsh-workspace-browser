import { describe, expect, it } from 'vitest'
import {
  BROWSER_PREFERENCES_KEY,
  NEW_SESSION_LABEL,
  OPENED_SESSIONS_KEY,
  appendOpenedSession,
  groupOpenedSessions,
  isCurrentSidebarSession,
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
  sessionBadgeState,
  sessionRowActionsLocked,
  sessionRowTitle,
  parseOpenedSessionIds,
  removeOpenedSession,
  createLatestRequest,
  sortWorkspaces,
  splitHiddenWorkspaces,
  workspaceMoveAnchor,
  workspacePathProblem,
  workspaceTitleProblem,
  type SessionFilterOptions,
  type SessionRecord,
  type SessionSelection,
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

/** Catalog selection states, named so the blank-rule cases read as intent. */
const openSelection: SessionSelection = { currentSessionId: 'open', known: true }
const staleSelection: SessionSelection = { currentSessionId: 'stale', known: true }
const closedSelection: SessionSelection = { known: true }
const unknownSelection: SessionSelection = { known: false }

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

  it('keeps only the open provisional session and hides the abandoned ones', () => {
    const rows = {
      sent: session('sent', { blank: false }),
      open: session('open', { blank: true }),
      stale: session('stale', { blank: true }),
      // A row without the flag predates it or came from another producer: it
      // must keep its old behaviour rather than be guessed at.
      legacy: session('legacy'),
    }
    const ids = ['sent', 'open', 'stale', 'legacy']
    // Without holder information the rule stays off — showing a provisional
    // row is recoverable, hiding the one being edited is not.
    expect(filter(ids, rows)).toEqual(ids)
    expect(filter(ids, rows, new Set(), new Set(), { selection: unknownSelection })).toEqual(ids)
    // The catalog does report holders and none is open: every blank is stale.
    expect(filter(ids, rows, new Set(), new Set(), { selection: closedSelection })).toEqual(['sent', 'legacy'])
    // The session the user is sitting in remains visible; the others do not.
    expect(filter(ids, rows, new Set(), new Set(), { selection: openSelection }))
      .toEqual(['sent', 'open', 'legacy'])
    // Clicking New Session elsewhere moves the visible blank, it does not add one.
    expect(filter(ids, rows, new Set(), new Set(), { selection: staleSelection }))
      .toEqual(['sent', 'stale', 'legacy'])
  })

  it('never matches a provisional session in a query', () => {
    const rows = {
      open: session('open', { title: 'Cep', blank: true }),
      sent: session('sent', { title: 'Cep work' }),
    }
    // Both rows belong to the same workspace, so only the blank rule can
    // separate them: the workspace name matches, the provisional row does not.
    const owners = new Map([['open', workspaces[0]], ['sent', workspaces[0]]])
    expect(filter(['open', 'sent'], rows, new Set(), new Set(), { selection: openSelection }))
      .toEqual(['open', 'sent'])
    // Title, id and owning workspace are all excluded for a blank row.
    expect(filter(['open', 'sent'], rows, new Set(), new Set(), { selection: openSelection, query: 'cep' }))
      .toEqual(['sent'])
    expect(filter(['open', 'sent'], rows, new Set(), new Set(), { selection: openSelection, query: 'open' }))
      .toEqual([])
    expect(filter(['open', 'sent'], rows, new Set(), new Set(), { selection: openSelection, query: 'alpha', owners }))
      .toEqual(['sent'])
    // A provisional row has no history to search even when the catalog cannot
    // name the open session.
    expect(filter(['open', 'sent'], rows, new Set(), new Set(), { selection: unknownSelection, query: 'cep' }))
      .toEqual(['sent'])
  })

  it('lists and searches every provisional session once the switch is on', () => {
    const rows = {
      open: session('open', { title: 'Cep', blank: true }),
      stale: session('stale', { title: 'Old draft', blank: true }),
      sent: session('sent', { title: 'Cep work' }),
    }
    const ids = ['open', 'stale', 'sent']
    // Default: only the open provisional row.
    expect(filter(ids, rows, new Set(), new Set(), { selection: openSelection })).toEqual(['open', 'sent'])
    // Opt-in: the abandoned draft comes back, which is the whole point.
    expect(filter(ids, rows, new Set(), new Set(), { selection: openSelection, showBlankSessions: true }))
      .toEqual(['open', 'stale', 'sent'])
    // The opt-in also makes it findable by the metadata it does have.
    expect(filter(ids, rows, new Set(), new Set(), { showBlankSessions: true, query: 'draft' })).toEqual(['stale'])
    // Every other rule still applies to those rows.
    expect(filter(ids, rows, new Set(['stale']), new Set(), { showBlankSessions: true })).toEqual(['open', 'sent'])
  })

  it('does not let a pin, an archive view or the subagent switch resurrect a blank row', () => {
    const rows = { open: session('open', { blank: true }), stale: session('stale', { blank: true }) }
    expect(filter(['stale', 'open'], rows, new Set(), new Set(['stale']), { selection: openSelection }))
      .toEqual(['open'])
    expect(filter(['open', 'stale'], rows, new Set(), new Set(), { selection: openSelection, archivedFilter: 'all' }))
      .toEqual(['open'])
    expect(filter(['open', 'stale'], rows, new Set(), new Set(), { selection: closedSelection, showSubagents: true }))
      .toEqual([])
    // Once a turn starts the row is ordinary history again.
    const started = { ...rows, open: session('open', { blank: false }) }
    expect(filter(['open', 'stale'], started, new Set(), new Set(), { selection: closedSelection })).toEqual(['open'])
  })

  it('labels a provisional row as a new session and locks rename/fork', () => {
    const blank = session('blank', { blank: true, title: 'cep_szocs', displayTitle: 'cep_szocs' })
    expect(sessionRowTitle(blank)).toBe(NEW_SESSION_LABEL)
    expect(sessionRowActionsLocked(blank)).toBe(true)
    const sent = session('sent', { blank: false, title: 'Fix the release', displayTitle: 'fallback' })
    expect(sessionRowTitle(sent)).toBe('Fix the release')
    expect(sessionRowActionsLocked(sent)).toBe(false)
    // Unnamed history keeps the neutral fallback, and legacy rows stay editable.
    expect(sessionRowTitle({ ...sent, title: '' })).toBe('fallback')
    expect(sessionRowTitle({ ...sent, title: '', displayTitle: '' })).toBe('未命名会话')
    expect(sessionRowActionsLocked({ ...sent, blank: undefined })).toBe(false)
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

  it('pre-checks workspace titles with the Host rules', () => {
    // Blank after trimming is refused before any round trip.
    expect(workspaceTitleProblem('   ', workspaces, 'w1')).toBe('blank')
    expect(workspaceTitleProblem('', workspaces, 'w1')).toBe('blank')
    // Another workspace's exact title is taken; the Host compares verbatim, so
    // a case-only difference is a different title.
    expect(workspaceTitleProblem('Beta', workspaces, 'w1')).toBe('duplicate')
    expect(workspaceTitleProblem('beta', workspaces, 'w1')).toBeNull()
    // Re-saving one's own title, trimmed or not, names no other workspace.
    expect(workspaceTitleProblem('Alpha', workspaces, 'w1')).toBeNull()
    expect(workspaceTitleProblem('  Alpha  ', workspaces, 'w1')).toBeNull()
    expect(workspaceTitleProblem(' Gamma ', workspaces, 'w1')).toBeNull()
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
      showBlankSessions: true,
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
      showBlankSessions: true,
      simplifySidebar: false,
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
    expect(legacy.showBlankSessions).toBe(false)
    // The simplified sidebar is opt-in: an older payload keeps the native tree.
    expect(legacy.simplifySidebar).toBe(false)

    const malformed = parseBrowserPreferences(JSON.stringify({ schemaVersion: 1, showSubagents: 'yes', density: 'comfortable' }))
    expect(malformed.showSubagents).toBe(false)
    expect(malformed).not.toHaveProperty('density')
    expect(malformed.simplifySidebar).toBe(false)

    const enabled = parseBrowserPreferences(JSON.stringify({ schemaVersion: 1, simplifySidebar: true }))
    expect(enabled.simplifySidebar).toBe(true)
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

  it('pre-checks only the path rule the Host states up front', () => {
    expect(workspacePathProblem('')).toBe('blank')
    expect(workspacePathProblem('   ')).toBe('blank')
    expect(workspacePathProblem('/home/user/project')).toBeNull()
    expect(workspacePathProblem('  /srv/app  ')).toBeNull()
    expect(workspacePathProblem('C:\\repo\\demo')).toBeNull()
    expect(workspacePathProblem('D:/repo/demo')).toBeNull()
    expect(workspacePathProblem('\\\\server\\share\\demo')).toBeNull()
    // Relative input is rejected locally; existence and permissions stay Host-side.
    expect(workspacePathProblem('project')).toBe('relative')
    expect(workspacePathProblem('./project')).toBe('relative')
    expect(workspacePathProblem('C:project')).toBe('relative')
  })

  it('anchors a manual move on registry neighbours and stops at the edges', () => {
    const ordered = [
      { workspaceId: 'w1', title: 'Alpha', path: '/a', sessionIds: [] },
      { workspaceId: 'w2', title: 'Beta', path: '/b', sessionIds: [] },
      { workspaceId: 'w3', title: 'Gamma', path: '/c', sessionIds: [] },
    ]
    // Moving up means "insert before the previous entry".
    expect(workspaceMoveAnchor(ordered, 'w2', -1)).toEqual({ workspaceId: 'w2', beforeWorkspaceId: 'w1' })
    // Moving down means "insert before the entry after the next one"; at the
    // last position the anchor is omitted, which appends.
    expect(workspaceMoveAnchor(ordered, 'w1', 1)).toEqual({ workspaceId: 'w1', beforeWorkspaceId: 'w3' })
    expect(workspaceMoveAnchor(ordered, 'w2', 1)).toEqual({ workspaceId: 'w2', beforeWorkspaceId: undefined })
    expect(workspaceMoveAnchor(ordered, 'w1', -1)).toBeNull()
    expect(workspaceMoveAnchor(ordered, 'w3', 1)).toBeNull()
    expect(workspaceMoveAnchor(ordered, 'missing', 1)).toBeNull()
    expect(workspaceMoveAnchor([], 'w1', 1)).toBeNull()
  })

  it('keeps only the newest async request eligible to write', () => {
    const gate = createLatestRequest()
    expect(gate.isCurrent(0)).toBe(true)
    const first = gate.next()
    expect(gate.isCurrent(first)).toBe(true)
    const second = gate.next()
    // The slow first listing must not overwrite the directory the user moved to.
    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
  })

  it('preserves opened-session shortcuts and validates stored ids', () => {
    expect(parseOpenedSessionIds('["a","a","",12,"b"]')).toEqual(['a', 'b'])
    expect(parseOpenedSessionIds('{broken')).toEqual([])
    expect(appendOpenedSession(['a', 'b'], 'a')).toEqual(['a', 'b'])
    expect(appendOpenedSession(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(removeOpenedSession(['a', 'b', 'a'], 'a')).toEqual(['b'])
    expect(OPENED_SESSIONS_KEY).toBe('dsh-workspace-browser.opened-sessions.v1')
  })

  it('groups opened-session shortcuts by current workspace ownership in first-added order', () => {
    const rows: WorkspaceRecord[] = [
      { workspaceId: 'w2', title: 'Beta', path: '/work/beta', sessionIds: ['b'] },
      { workspaceId: 'w1', title: 'Alpha', path: '/work/alpha', sessionIds: ['a', 'c'] },
    ]
    expect(groupOpenedSessions(['a', 'b', 'c', 'unknown'], rows)).toEqual([
      { workspaceId: 'w1', title: 'Alpha', path: '/work/alpha', ids: ['a', 'c'] },
      { workspaceId: 'w2', title: 'Beta', path: '/work/beta', ids: ['b'] },
      { workspaceId: undefined, title: '未分组', path: undefined, ids: ['unknown'] },
    ])
  })

  it('does not mark a conversation current while a global panel is active', () => {
    expect(isCurrentSidebarSession('s1', 's1', false)).toBe(true)
    expect(isCurrentSidebarSession('s1', 's1', true)).toBe(false)
    expect(isCurrentSidebarSession('s2', 's1', false)).toBe(false)
  })

  it('prioritizes unified status without inferring completion from transitions', () => {
    expect(sessionBadgeState({ running: false, pendingInteraction: { kind: 'approval' }, completionUnread: true }, true).kind).toBe('approval')
    expect(sessionBadgeState({ running: true, pendingInteraction: { kind: 'plan-review' }, completionUnread: false }, true).kind).toBe('question')
    expect(sessionBadgeState({ running: true, pendingInteraction: undefined, completionUnread: true }, false).kind).toBe('running')
    expect(sessionBadgeState({ running: undefined, pendingInteraction: undefined, completionUnread: true }, false).kind).toBe('completed')
    expect(sessionBadgeState({ running: false, pendingInteraction: undefined, completionUnread: false }, false, true)).toEqual({ kind: 'running', label: '子代理运行中', glyph: '●' })
    expect(sessionBadgeState(undefined, true).kind).toBe('running')
    expect(sessionBadgeState(undefined, false).kind).toBe('idle')
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
