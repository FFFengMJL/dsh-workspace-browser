/**
 * Pure data logic for the workspace browser.
 *
 * This module is React-free and side-effect free so it can be unit tested
 * without a browser, a Cordis context, or a live DSH Host. It only shapes
 * metadata the Host already published: no conversation bodies, no filesystem
 * scans, and no Host mutations.
 *
 * Naming convention: records mirror the DSH client catalog, while every helper
 * takes plain string ids. Host ids are branded strings (`SessionId`,
 * `WorkspaceId`); the browser treats them as opaque keys.
 */

/** One registered DSH workspace, reduced to the fields this browser renders. */
export interface WorkspaceRecord {
  workspaceId: string
  title: string
  path: string
  sessionIds: readonly string[]
}

/** One session catalog row. Every field is metadata; no message content. */
export interface SessionRecord {
  id: string
  title?: string
  displayTitle: string
  cwd?: string
  /**
   * Durable origin marker from the Host. Only delegated children carry
   * `subagent`; a plain fork of a conversation keeps its own identity and has
   * a `parentId` without this marker, so the two must not be conflated.
   */
  origin?: 'subagent'
  /** Direct parent session: delegation parent, or fork source. */
  parentId?: string
  updatedAt: number
  running: boolean
  blank?: boolean
}

export type ArchivedFilter = 'active' | 'all' | 'archived'
export type SearchScope = 'all' | 'workspaces' | 'sessions'
export type WorkspaceOrder = 'manual' | 'name' | 'recent'
export type SessionOrder = 'manual' | 'recent'
export type WorkspaceGroupBy = 'workspace' | 'workspace-tree' | 'flat'

/** Heading used when a workspace path has no parent directory. */
export const ROOT_GROUP_LABEL: string = '根目录'

/**
 * Versioned key for plugin-owned browser preferences.
 *
 * The version suffix is part of the stored contract: bump it only together with
 * a migration, otherwise existing users silently lose their pins and hidden
 * workspaces. `schemaVersion` inside the payload is the second guard.
 */
export const BROWSER_PREFERENCES_KEY = 'dsh-workspace-browser.preferences.v1'

/** Minimal storage surface, so callers can pass `localStorage` or a fake. */
export interface BrowserPreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Everything this plugin remembers across sessions and tabs.
 *
 * Deliberately limited to display preferences and opaque workspace ids: no
 * paths, titles, or conversation content are persisted. Unknown fields are
 * dropped by `parseBrowserPreferences`, so adding a field here requires adding
 * it to the parser as well.
 */
export interface BrowserPreferences {
  schemaVersion: 1
  pinnedWorkspaceIds: string[]
  hiddenWorkspaceIds: string[]
  groupBy: WorkspaceGroupBy
  workspaceOrder: WorkspaceOrder
  sessionOrder: SessionOrder
  archivedFilter: ArchivedFilter
  /** Whether delegated (subagent) sessions are listed. Defaults to `false`. */
  showSubagents: boolean
  /**
   * Whether every provisional session is listed, not just the open one.
   * Defaults to `false`, matching the native tree. Turning it on is the way to
   * find a session whose draft was never sent, which is otherwise invisible.
   */
  showBlankSessions: boolean
  /**
   * Whether the native workspace/session tree is replaced with a compact
   * launcher. Defaults to `false`, so an existing install keeps DSH's own
   * sidebar until the user explicitly opts in; turning it off restores it.
   */
  simplifySidebar: boolean
}

/**
 * Defaults are also the migration target for v1 payloads written before a field
 * existed, so a missing field must equal the value a fresh install would use.
 */
export function defaultBrowserPreferences(): BrowserPreferences {
  return {
    schemaVersion: 1,
    pinnedWorkspaceIds: [],
    hiddenWorkspaceIds: [],
    groupBy: 'workspace',
    workspaceOrder: 'manual',
    sessionOrder: 'manual',
    archivedFilter: 'active',
    showSubagents: false,
    showBlankSessions: false,
    simplifySidebar: false,
  }
}

/** Deduplicate ids and reject malformed entries instead of trusting JSON. */
function validIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 256))]
}

/**
 * Parse a stored payload into a complete preference object.
 *
 * Unknown or malformed content falls back to defaults as a whole; individual
 * enum fields fall back field-by-field. This keeps a partially corrupted store
 * from breaking the panel while never trusting attacker-controlled shapes.
 */
export function parseBrowserPreferences(raw: string | null): BrowserPreferences {
  const defaults = defaultBrowserPreferences()
  if (!raw) return defaults

  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
    const record = value as Record<string, unknown>
    if (record.schemaVersion !== 1) return defaults
    return {
      schemaVersion: 1,
      pinnedWorkspaceIds: validIdList(record.pinnedWorkspaceIds),
      hiddenWorkspaceIds: validIdList(record.hiddenWorkspaceIds),
      groupBy: record.groupBy === 'workspace-tree' || record.groupBy === 'flat' ? record.groupBy : 'workspace',
      workspaceOrder: record.workspaceOrder === 'name' || record.workspaceOrder === 'recent' ? record.workspaceOrder : 'manual',
      sessionOrder: record.sessionOrder === 'recent' ? 'recent' : 'manual',
      archivedFilter: record.archivedFilter === 'all' || record.archivedFilter === 'archived' ? record.archivedFilter : 'active',
      showSubagents: record.showSubagents === true,
      showBlankSessions: record.showBlankSessions === true,
      // Missing on payloads written before this field existed: keep the
      // native tree, which is also the fresh-install default.
      simplifySidebar: record.simplifySidebar === true,
    }
  } catch {
    return defaults
  }
}

/**
 * Read a storage object without letting a throwing accessor escape.
 *
 * Browsers raise on `window.localStorage` itself when storage is disabled for
 * the origin, before any `getItem` call happens.
 */
export function resolvePreferenceStorage<T>(accessor: () => T | null | undefined): T | undefined {
  try {
    return accessor() ?? undefined
  } catch {
    return undefined
  }
}

/** Load preferences, degrading to defaults when storage is missing or throws. */
export function loadBrowserPreferences(storage: Pick<BrowserPreferenceStorage, 'getItem'> | null | undefined): BrowserPreferences {
  if (!storage) return defaultBrowserPreferences()
  try {
    return parseBrowserPreferences(storage.getItem(BROWSER_PREFERENCES_KEY))
  } catch {
    return defaultBrowserPreferences()
  }
}

/**
 * Persist preferences.
 *
 * @returns `false` when the write was refused (quota, privacy mode, no storage).
 *   Callers keep the value in memory so the panel still works for this page.
 */
export function saveBrowserPreferences(
  storage: Pick<BrowserPreferenceStorage, 'setItem'> | null | undefined,
  preferences: BrowserPreferences,
): boolean {
  if (!storage) return false
  try {
    storage.setItem(BROWSER_PREFERENCES_KEY, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}

export function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase()
}

/** Case-insensitive metadata match; `undefined` fields never match. */
export function matchesQuery(query: string, ...fields: Array<string | undefined>): boolean {
  const needle = normalizeQuery(query)
  if (!needle) return true
  return fields.some((field) => field?.toLocaleLowerCase().includes(needle) ?? false)
}

/** Sessions no workspace lists, in catalog order. */
export function getUngroupedSessionIds(
  workspaces: readonly WorkspaceRecord[],
  sessionIds: readonly string[],
): string[] {
  const assigned = new Set(workspaces.flatMap((workspace) => workspace.sessionIds))
  return sessionIds.filter((id) => !assigned.has(id))
}

/** Options for {@link filterSessionIds}; named so call sites stay readable. */
export interface SessionFilterOptions {
  readonly ids: readonly string[]
  readonly sessionsById: Readonly<Record<string, SessionRecord>>
  readonly archivedIds: ReadonlySet<string>
  readonly pinnedIds: ReadonlySet<string>
  /** Case-insensitive metadata query; empty matches everything. */
  readonly query?: string
  readonly archivedFilter?: ArchivedFilter
  readonly order?: SessionOrder
  /** When `false` (default), `origin === 'subagent'` rows are omitted. */
  readonly showSubagents?: boolean
  /**
   * When `true`, every provisional (`blank`) session is listed, not just the
   * one currently open. The explicit opt-in also makes them searchable, which
   * is the point: an unsent draft is otherwise unfindable.
   */
  readonly showBlankSessions?: boolean
  /**
   * What the catalog can say about the session currently open, used by the
   * blank rule below. Omitted when the panel has no such information at all,
   * which is the same as `known: false`.
   */
  readonly selection?: SessionSelection
  /**
   * Optional session → owning workspace index. When present, a query also
   * matches the workspace title and path, which is what the global search box
   * promises. Workspace detail views omit it on purpose: there the query is
   * scoped to one workspace's sessions.
   */
  readonly owners?: ReadonlyMap<string, WorkspaceRecord>
}

/**
 * What the catalog knows about the session currently open.
 *
 * `known: false` means the catalog reported no holder information at all: the
 * panel cannot tell a provisional row from an abandoned one, so it must not
 * hide any of them — an unknown state is not evidence that nothing is open.
 */
export interface SessionSelection {
  /** Session the main view holds, when one is open. */
  readonly currentSessionId?: string
  /** Whether the catalog reports holder information at all. */
  readonly known: boolean
}

/**
 * Apply archive, subagent, blank, query, pin and order rules in one place.
 *
 * Every list in the panel (workspace cards, detail, flat list, search results,
 * ungrouped section) goes through this function so the counts and the rows can
 * never disagree.
 *
 * The blank rule mirrors the native session tree: a blank session is
 * provisional, so by default only the one currently open stays visible and a
 * search never matches it. `showBlankSessions` turns that rule off for users
 * who want to find a session whose draft was never sent. Two states keep their
 * old behaviour instead of guessing, because both would otherwise hide rows the
 * panel cannot reason about: a row without a `blank` flag, and a catalog
 * without holder information.
 */
export function filterSessionIds(options: SessionFilterOptions): string[] {
  const { ids, sessionsById, archivedIds, pinnedIds } = options
  const query = options.query ?? ''
  const archivedFilter = options.archivedFilter ?? 'active'
  const order = options.order ?? 'manual'
  const showSubagents = options.showSubagents ?? false
  const showBlankSessions = options.showBlankSessions ?? false
  const selection = options.selection
  const owners = options.owners
  const searching = normalizeQuery(query) !== ''

  const visible = ids.filter((id) => {
    const session = sessionsById[id]
    if (!session) return false
    if (!showSubagents && session.origin === 'subagent') return false
    if (session.blank === true && !showBlankSessions) {
      // A provisional session has no history to search, so it never matches.
      if (searching) return false
      if (selection?.known === true && id !== selection.currentSessionId) return false
    }
    const archived = archivedIds.has(id)
    if (archivedFilter === 'active' && archived) return false
    if (archivedFilter === 'archived' && !archived) return false
    const owner = owners?.get(id)
    return matchesQuery(query, session.title, session.displayTitle, session.id, owner?.title, owner?.path)
  })

  const manualOrder = new Map(ids.map((id, index) => [id, index]))
  visible.sort((a, b) => {
    const pinDiff = Number(pinnedIds.has(b)) - Number(pinnedIds.has(a))
    if (pinDiff) return pinDiff
    if (order === 'recent') {
      return (sessionsById[b]?.updatedAt ?? 0) - (sessionsById[a]?.updatedAt ?? 0)
    }
    return (manualOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (manualOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
  })
  return visible
}

/** Label the native tree uses for a session that has not started a turn. */
export const NEW_SESSION_LABEL: string = '新会话'

/** Second line for a provisional row: says what it is, not what it lacks. */
export const BLANK_SESSION_HINT: string = '尚未开始对话'

/**
 * Title for one session row.
 *
 * A blank session has no title of its own yet — the host would fall back to a
 * directory name, which reads like real history — so the provisional label
 * wins. Unnamed history keeps the neutral fallback.
 */
export function sessionRowTitle(session: SessionRecord): string {
  if (session.blank === true) return NEW_SESSION_LABEL
  return session.title || session.displayTitle || '未命名会话'
}

/** Rename and fork need a started conversation, so a blank row offers neither. */
export function sessionRowActionsLocked(session: SessionRecord): boolean {
  return session.blank === true
}

/** Sort by registry order, title, or latest activity inside the workspace. */
export function sortWorkspaces(
  workspaces: readonly WorkspaceRecord[],
  sessionsById: Readonly<Record<string, SessionRecord>>,
  order: WorkspaceOrder,
): WorkspaceRecord[] {
  const result = workspaces.slice()
  if (order === 'name') {
    result.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))
  } else if (order === 'recent') {
    const activity = (workspace: WorkspaceRecord) => Math.max(
      0,
      ...workspace.sessionIds.map((id) => sessionsById[id]?.updatedAt ?? 0),
    )
    result.sort((a, b) => activity(b) - activity(a) || a.title.localeCompare(b.title))
  }
  return result
}

/**
 * Float pinned workspaces to the top without disturbing the relative order of
 * either group. `Array.prototype.sort` is stable, so the comparator only needs
 * to separate the two groups.
 */
export function prioritizePinnedWorkspaces(
  workspaces: readonly WorkspaceRecord[],
  pinnedWorkspaceIds: ReadonlySet<string>,
): WorkspaceRecord[] {
  return workspaces
    .slice()
    .sort((a, b) => Number(pinnedWorkspaceIds.has(b.workspaceId)) - Number(pinnedWorkspaceIds.has(a.workspaceId)))
}

/** One parent-directory group in the `workspace-tree` view. */
export interface WorkspaceGroup {
  readonly parent: string
  readonly workspaces: readonly WorkspaceRecord[]
}

/** Group by parent directory, preserving first-seen group and member order. */
export function groupWorkspacesByParent(workspaces: readonly WorkspaceRecord[]): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceRecord[]>()
  for (const workspace of workspaces) {
    const parent = parentDirectory(workspace.path) || ROOT_GROUP_LABEL
    const bucket = groups.get(parent)
    if (bucket) bucket.push(workspace)
    else groups.set(parent, [workspace])
  }
  return [...groups].map(([parent, members]) => ({ parent, workspaces: members }))
}

/** First workspace listing a session; later duplicates are ignored. */
export function indexWorkspaceOwners(
  workspaces: readonly WorkspaceRecord[],
): ReadonlyMap<string, WorkspaceRecord> {
  const owners = new Map<string, WorkspaceRecord>()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) {
      if (!owners.has(id)) owners.set(id, workspace)
    }
  }
  return owners
}

/** Result of resolving stored hidden ids against the registered workspaces. */
export interface HiddenWorkspaceSplit {
  /** Registered workspaces that are currently hidden, in display order. */
  readonly hidden: readonly WorkspaceRecord[]
  /** Hidden ids with no registered workspace; kept in preferences untouched. */
  readonly missingCount: number
}

/**
 * Split stored hidden ids into what can be restored now and what cannot.
 *
 * Stale ids are counted but never rendered as phantom cards, and they stay in
 * storage: the browser must not silently discard a user's preference just
 * because a workspace is temporarily unregistered.
 */
export function splitHiddenWorkspaces(
  workspaces: readonly WorkspaceRecord[],
  hiddenWorkspaceIds: ReadonlySet<string>,
): HiddenWorkspaceSplit {
  const hidden = workspaces.filter((workspace) => hiddenWorkspaceIds.has(workspace.workspaceId))
  const registered = new Set(hidden.map((workspace) => workspace.workspaceId))
  let missingCount = 0
  for (const id of hiddenWorkspaceIds) {
    if (!registered.has(id)) missingCount += 1
  }
  return { hidden, missingCount }
}

/**
 * Why a proposed workspace title cannot be saved.
 *
 * `blank` covers whitespace-only drafts and `duplicate` names another
 * registered workspace; both are refusals the Host would also produce.
 */
export type WorkspaceTitleProblem = 'blank' | 'duplicate'

/**
 * Pre-check one rename request against the rules the Host enforces.
 *
 * Mirrors the Host so the dialog can refuse before a round trip: the title is
 * trimmed, must not be blank, and must not equal another workspace's title —
 * exact string equality, case included, because the Host compares titles
 * verbatim. The workspace being renamed is excluded, so re-saving the current
 * name (or changing only its case) is allowed. The Host stays authoritative: a
 * title that passes here can still lose a race with another tab.
 *
 * @returns the first problem, or `null` when the title is submittable.
 */
export function workspaceTitleProblem(
  title: string,
  workspaces: readonly WorkspaceRecord[],
  workspaceId: string,
): WorkspaceTitleProblem | null {
  const trimmed = title.trim()
  if (!trimmed) return 'blank'
  const taken = workspaces.some((workspace) => workspace.workspaceId !== workspaceId && workspace.title === trimmed)
  return taken ? 'duplicate' : null
}

/**
 * Human label for a delegated session's parent.
 *
 * Falls back to the raw id when the parent is not in the catalog, which happens
 * for archived or out-of-window parents.
 */
export function parentLabelFor(
  session: SessionRecord,
  sessionsById: Readonly<Record<string, SessionRecord>>,
): string | undefined {
  if (!session.parentId) return undefined
  const parent = sessionsById[session.parentId]
  return parent?.title || parent?.displayTitle || session.parentId
}

/** Derive a path parent without touching the filesystem. */
export function parentDirectory(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return index > 0 ? normalized.slice(0, index) : ''
}

/** Why a proposed workspace path cannot be submitted as typed. */
export type WorkspacePathProblem = 'blank' | 'relative'

/**
 * Pre-check a workspace path against the one rule the Host states up front:
 * the directory must be absolute on the Host machine.
 *
 * This is only a local guard for an obvious mistake, so the dialog can disable
 * Save without a round trip. Everything else — existence, permissions, whether
 * it is a directory — stays Host-authoritative and is never guessed here.
 */
export function workspacePathProblem(path: string): WorkspacePathProblem | null {
  const trimmed = path.trim()
  if (!trimmed) return 'blank'
  const absolute = trimmed.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(trimmed)
    || /^\\\\[^\\]+\\[^\\]+/.test(trimmed)
  return absolute ? null : 'relative'
}

/** One registry move: put `workspaceId` before `beforeWorkspaceId` (or last). */
export interface WorkspaceMove {
  readonly workspaceId: string
  readonly beforeWorkspaceId?: string
}

/**
 * Neighbour anchor for moving one workspace inside the registry order.
 *
 * Manual order is the registry order, so neighbours come from the unpinned
 * list: pinning only reorders the display. `null` means the move is a no-op —
 * the workspace is missing or already at the requested edge.
 */
export function workspaceMoveAnchor(
  registryOrdered: readonly WorkspaceRecord[],
  workspaceId: string,
  delta: -1 | 1,
): WorkspaceMove | null {
  const index = registryOrdered.findIndex((workspace) => workspace.workspaceId === workspaceId)
  if (index < 0) return null
  const target = index + delta
  if (target < 0 || target >= registryOrdered.length) return null
  const beforeWorkspaceId = delta < 0
    ? registryOrdered[target].workspaceId
    : registryOrdered[target + 1]?.workspaceId
  return { workspaceId, beforeWorkspaceId }
}

/**
 * Monotonic token for "latest async request wins" flows.
 *
 * The directory browser can have a slow listing in flight when the user moves
 * to another directory or closes the dialog; only the newest token may write
 * to the view. Aborting the transport is the primary guard; this token also
 * covers a response that had already resolved.
 */
export interface LatestRequest {
  /** Invalidate every earlier token and return the new one. */
  next(): number
  /** Whether `token` is still the newest one. */
  isCurrent(token: number): boolean
}

export function createLatestRequest(): LatestRequest {
  let current = 0
  return {
    next: () => {
      current += 1
      return current
    },
    isCurrent: (token) => token === current,
  }
}

export const OPENED_SESSIONS_KEY = 'dsh-workspace-browser.opened-sessions.v1'

/** Parse the plugin-owned navigation list, rejecting malformed ids and duplicates. */
export function parseOpenedSessionIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter((id): id is string =>
      typeof id === 'string' && id.length > 0 && id.length <= 256,
    ))]
  } catch {
    return []
  }
}

/** Append a newly entered session without changing an existing shortcut's position. */
export function appendOpenedSession(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.slice() : [...ids, id]
}

/** Remove only the plugin's navigation shortcut; this does not mutate DSH. */
export function removeOpenedSession(ids: readonly string[], id: string): string[] {
  return ids.filter((item) => item !== id)
}

export interface OpenedSessionGroup {
  readonly workspaceId?: string
  readonly title: string
  readonly path?: string
  readonly ids: readonly string[]
}

export function isCurrentSidebarSession(sessionId: string, currentSessionId: string | undefined, panelActive: boolean): boolean {
  return !panelActive && currentSessionId === sessionId
}

export type SessionBadgeKind = 'approval' | 'question' | 'running' | 'completed' | 'idle'

/** Presentation follows the public unified Host status priority, not inferred transitions. */
export function sessionBadgeState(
  status: {
    readonly running: boolean | undefined
    readonly pendingInteraction: { readonly kind: string } | undefined
    readonly completionUnread: boolean
  } | undefined,
  catalogRunning: boolean,
  runningChild = false,
): { readonly kind: SessionBadgeKind; readonly label: string; readonly glyph: string } {
  const pending = status?.pendingInteraction
  if (pending) {
    return pending.kind === 'question' || pending.kind === 'plan-review'
      ? { kind: 'question', label: '等待你的回答', glyph: '?' }
      : { kind: 'approval', label: '等待你的处理', glyph: '!' }
  }
  if (status?.running === true || (status?.running === undefined && catalogRunning) || runningChild) {
    const ownRunning = status?.running ?? catalogRunning
    return { kind: 'running', label: runningChild && !ownRunning ? '子代理运行中' : '运行中', glyph: '●' }
  }
  if (status?.completionUnread) return { kind: 'completed', label: '刚完成', glyph: '✓' }
  return { kind: 'idle', label: '空闲', glyph: '·' }
}

/** Group saved navigation ids by current catalog ownership, preserving first-added order. */
export function groupOpenedSessions(
  ids: readonly string[],
  workspaces: readonly WorkspaceRecord[],
): OpenedSessionGroup[] {
  const owners = new Map<string, WorkspaceRecord>()
  for (const workspace of workspaces) {
    for (const id of workspace.sessionIds) if (!owners.has(id)) owners.set(id, workspace)
  }
  const groups = new Map<string | undefined, { workspace?: WorkspaceRecord; ids: string[] }>()
  for (const id of ids) {
    const workspace = owners.get(id)
    const key = workspace?.workspaceId
    let group = groups.get(key)
    if (!group) {
      group = { workspace, ids: [] }
      groups.set(key, group)
    }
    group.ids.push(id)
  }
  return [...groups.entries()].map(([, group]) => ({
    workspaceId: group.workspace?.workspaceId,
    title: group.workspace?.title ?? '未分组',
    path: group.workspace?.path,
    ids: group.ids,
  }))
}
