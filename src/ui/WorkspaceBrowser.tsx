/**
 * The workspace browser panel.
 *
 * Responsibilities:
 * - read the two host catalog snapshots (workspace + session metadata),
 * - own transient navigation state (open workspace, query, scroll),
 * - derive every list through the shared filters in `logic.ts`,
 * - translate user intent into DSH public service calls.
 *
 * It never reads conversation bodies, never scans the filesystem, and never
 * writes DSH state except through `uiWorkspace` / the workspace controller.
 */
import React, { useEffect, useMemo, useState } from 'react'
import {
  filterSessionIds,
  getUngroupedSessionIds,
  groupWorkspacesByParent,
  indexWorkspaceOwners,
  matchesQuery,
  parentLabelFor,
  prioritizePinnedWorkspaces,
  sortWorkspaces,
  splitHiddenWorkspaces,
  workspaceTitleProblem,
  type ArchivedFilter,
  type SearchScope,
  type SessionOrder,
  type WorkspaceGroupBy,
  type WorkspaceOrder,
  type WorkspaceRecord,
} from '../logic.js'
import { SessionRow, WorkspaceCard, type SessionAction } from './cards.js'
import { ArchiveConfirmDialog, DeleteWorkspaceDialog, HiddenWorkspacesDialog, RenameDialog, WorkspaceRenameDialog } from './dialogs.js'
import { useBrowserPreferences } from './preferences.js'
import { readSessionSelection, useSource, workspaceFailureMessage, type BrowserServices, type HostSessionRow } from './runtime.js'
import { styles } from './styles.js'

/** Session rows rendered before the "load more" control appears. */
const SESSION_PAGE_SIZE = 80

/** Stable empty values so memo dependencies do not churn on every render. */
const EMPTY_WORKSPACES: readonly WorkspaceRecord[] = []
const EMPTY_SESSIONS: Readonly<Record<string, HostSessionRow>> = {}

/** Per-panel view state that is not worth persisting to storage. */
interface ViewState {
  workspaceId: string | null
  query: string
  scope: SearchScope
  /** Captured before leaving for a conversation, restored on return. */
  scrollY: number
}

/**
 * In-page navigation memory.
 *
 * Opening a conversation unmounts this panel, so the selected workspace and
 * query would otherwise reset on return. Preferences (order, grouping, filters)
 * are persisted separately; this object only holds the current navigation
 * position and never contains conversation content.
 */
const navigationMemory: ViewState = { workspaceId: null, query: '', scope: 'all', scrollY: 0 }

interface Notice {
  text: string
  /** Set after a successful fork so the notice can offer to open the child. */
  forkedId?: string
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function WorkspaceBrowser({
  workspaces: workspaceSource,
  sessions: sessionSource,
  uiWorkspace,
  workspaceController,
  renameSession,
}: BrowserServices): React.JSX.Element {
  const workspaceSnapshot = useSource(workspaceSource)
  const sessionSnapshot = useSource(sessionSource)
  const { preferences, update: updatePreferences } = useBrowserPreferences()

  const [view, setView] = useState<ViewState>(() => ({ ...navigationMemory }))
  const [busyId, setBusyId] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(SESSION_PAGE_SIZE)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [hiddenDialogOpen, setHiddenDialogOpen] = useState(false)
  // Workspace registration mutations. Only one of the two dialogs is open at a
  // time, so they share one busy/error pair instead of four state slots.
  const [workspaceRenameTarget, setWorkspaceRenameTarget] = useState<string | null>(null)
  const [workspaceRenameValue, setWorkspaceRenameValue] = useState('')
  const [workspaceDelete, setWorkspaceDelete] = useState<{ workspaceId: string; title: string } | null>(null)
  const [workspaceDialogBusy, setWorkspaceDialogBusy] = useState(false)
  const [workspaceDialogError, setWorkspaceDialogError] = useState<string | null>(null)

  const workspaces = workspaceSnapshot?.items ?? EMPTY_WORKSPACES
  const sessionsById = sessionSnapshot?.byId ?? EMPTY_SESSIONS
  /** Host list order; falls back to object key order if a source omits ids. */
  const sessionIds = sessionSnapshot?.ids ?? Object.keys(sessionsById)

  const archivedIds = useMemo(
    () => new Set(workspaceSnapshot?.archivedSessionIds ?? []),
    [workspaceSnapshot],
  )
  const pinnedIds = useMemo(
    () => new Set(workspaceSnapshot?.pinnedSessionIds ?? []),
    [workspaceSnapshot],
  )
  const pinnedWorkspaceIds = useMemo(
    () => new Set(preferences.pinnedWorkspaceIds),
    [preferences.pinnedWorkspaceIds],
  )
  const hiddenWorkspaceIds = useMemo(
    () => new Set(preferences.hiddenWorkspaceIds),
    [preferences.hiddenWorkspaceIds],
  )
  const workspaceOwners = useMemo(() => indexWorkspaceOwners(workspaces), [workspaces])

  // Registry order (drives manual reordering) and display order (pin first).
  const registryOrdered = useMemo(
    () => sortWorkspaces(workspaces, sessionsById, preferences.workspaceOrder),
    [workspaces, sessionsById, preferences.workspaceOrder],
  )
  const orderedWorkspaces = useMemo(
    () => prioritizePinnedWorkspaces(registryOrdered, pinnedWorkspaceIds),
    [registryOrdered, pinnedWorkspaceIds],
  )
  const visibleWorkspaces = useMemo(
    () => orderedWorkspaces.filter((workspace) => !hiddenWorkspaceIds.has(workspace.workspaceId)),
    [orderedWorkspaces, hiddenWorkspaceIds],
  )
  const hiddenSplit = useMemo(
    () => splitHiddenWorkspaces(orderedWorkspaces, hiddenWorkspaceIds),
    [orderedWorkspaces, hiddenWorkspaceIds],
  )

  const filterOptions = useMemo(() => ({
    sessionsById,
    archivedIds,
    pinnedIds,
    query: view.query,
    archivedFilter: preferences.archivedFilter,
    order: preferences.sessionOrder,
    showSubagents: preferences.showSubagents,
    showBlankSessions: preferences.showBlankSessions,
    // Keep the provisional session the user is actually sitting in, and drop
    // the ones a previous visit left behind — same rule as the native tree.
    // `showBlankSessions` above overrides this whole rule on purpose.
    selection: readSessionSelection(sessionIds, sessionsById),
  }), [
    sessionsById,
    sessionIds,
    archivedIds,
    pinnedIds,
    view.query,
    preferences.archivedFilter,
    preferences.sessionOrder,
    preferences.showSubagents,
    preferences.showBlankSessions,
  ])

  /**
   * Shared row filter. `owners` is only passed where the query should also
   * match the owning workspace (global search), not in a workspace detail view.
   */
  const sessionRows = (ids: readonly string[], owners?: ReadonlyMap<string, WorkspaceRecord>): string[] =>
    filterSessionIds({ ...filterOptions, ids, owners })

  const details = workspaces.find((workspace) => workspace.workspaceId === view.workspaceId)
  const detailRows = details ? sessionRows(details.sessionIds) : []

  // Mirrors the Host's rename rules so a doomed save never leaves the dialog.
  // A blank draft just disables Save; only a taken name needs explaining.
  const workspaceRenameProblem = workspaceRenameTarget
    ? workspaceTitleProblem(workspaceRenameValue, workspaces, workspaceRenameTarget)
    : null
  const workspaceRenameError = workspaceRenameProblem === 'duplicate'
    ? '该名称已被其他工作区使用，请换一个。'
    : workspaceDialogError

  /**
   * Session rows for the global views. The owner index is passed here (and not
   * in the detail view) so a query can match a workspace name as the search box
   * promises, while a detail search stays scoped to that workspace's sessions.
   */
  const sessionHits = sessionRows(sessionIds, workspaceOwners)
  const ungroupedRows = sessionRows(getUngroupedSessionIds(workspaces, sessionIds))
  const isSearching = Boolean(view.query.trim())
  /** Held in a local const so the notice handler narrows to a plain string. */
  const forkedId = notice?.forkedId
  const workspaceMatches = (workspace: WorkspaceRecord): boolean => matchesQuery(view.query, workspace.title, workspace.path)
  const workspaceHits = visibleWorkspaces.filter((workspace) => view.scope === 'sessions' || !view.query || workspaceMatches(workspace))

  /** Persist view state so an unmount/remount keeps the user's place. */
  const commitView = (patch: Partial<ViewState>) => {
    const next = { ...view, ...patch }
    Object.assign(navigationMemory, next)
    setView(next)
  }

  // A changed filter set makes the previous "load more" depth meaningless.
  useEffect(() => {
    setVisibleLimit(SESSION_PAGE_SIZE)
  }, [
    view.query,
    view.workspaceId,
    view.scope,
    preferences.sessionOrder,
    preferences.archivedFilter,
    preferences.groupBy,
    preferences.showSubagents,
    preferences.showBlankSessions,
  ])

  // Restore the scroll position once per mount; later scrolling is user intent.
  useEffect(() => {
    const target = navigationMemory.scrollY
    if (target > 0) requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'auto' }))
  }, [])

  const rememberScroll = () => {
    navigationMemory.scrollY = window.scrollY
  }

  const openSession = async (id: string) => {
    try {
      // Opening an archived session requires unarchiving first; the host then
      // restores it to its recorded workspace position.
      if (archivedIds.has(id)) await uiWorkspace.unarchiveSession(id)
      rememberScroll()
      uiWorkspace.openSession(id)
    } catch (error) {
      setNotice({ text: `无法打开会话：${describeError(error)}` })
    }
  }

  const startSession = (workspaceId?: string) => {
    rememberScroll()
    uiWorkspace.startSession(workspaceId)
  }

  const runSessionAction = async (id: string, action: SessionAction) => {
    setBusyId(id)
    setNotice(null)
    try {
      if (action === 'pin') {
        if (pinnedIds.has(id)) await uiWorkspace.unpinSession(id)
        else await uiWorkspace.pinSession(id)
      } else if (action === 'archive') {
        if (archivedIds.has(id)) await uiWorkspace.unarchiveSession(id)
        // A running session needs an explicit stop confirmation; never stop
        // work as a side effect of a single archive click.
        else if (sessionsById[id]?.running) setArchiveTarget(id)
        else await uiWorkspace.archiveSession(id)
      } else if (action === 'fork') {
        const childId = await uiWorkspace.forkSession(id)
        setNotice({ text: `已创建分叉会话：${childId}`, forkedId: childId })
      } else {
        await navigator.clipboard.writeText(id)
        setNotice({ text: `已复制会话 ID：${id}` })
      }
    } catch (error) {
      setNotice({ text: `操作失败：${describeError(error)}` })
    } finally {
      setBusyId(null)
    }
  }

  const beginRename = (id: string) => {
    setRenameTarget(id)
    setRenameValue(sessionsById[id]?.title ?? '')
  }

  const confirmRename = async () => {
    const id = renameTarget
    const title = renameValue.trim()
    if (!id || !title) return
    setBusyId(id)
    try {
      await renameSession(id, title)
      setRenameTarget(null)
      setNotice({ text: '会话标题已更新。' })
    } catch (error) {
      setNotice({ text: `重命名失败：${describeError(error)}` })
    } finally {
      setBusyId(null)
    }
  }

  const confirmStopAndArchive = async () => {
    if (!archiveTarget) return
    const id = archiveTarget
    setArchiveTarget(null)
    setBusyId(id)
    try {
      await uiWorkspace.archiveSession(id, { stopActivity: true })
    } catch (error) {
      setNotice({ text: `归档失败：${describeError(error)}` })
    } finally {
      setBusyId(null)
    }
  }

  const moveWorkspace = async (workspaceId: string, delta: -1 | 1) => {
    // Manual order is the registry order, so neighbours come from the
    // unpinned list: pinning only reorders the display.
    const index = registryOrdered.findIndex((workspace) => workspace.workspaceId === workspaceId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= registryOrdered.length) return
    const before = delta < 0 ? registryOrdered[target].workspaceId : registryOrdered[target + 1]?.workspaceId
    try {
      await workspaceController.insertBefore(workspaceId, before)
    } catch (error) {
      setNotice({ text: `调整顺序失败：${describeError(error)}` })
    }
  }

  const beginWorkspaceRename = (workspace: WorkspaceRecord) => {
    setWorkspaceRenameTarget(workspace.workspaceId)
    setWorkspaceRenameValue(workspace.title)
    setWorkspaceDialogError(null)
  }

  const confirmWorkspaceRename = async () => {
    const target = workspaceRenameTarget
    // Save is disabled for both problems; the guard keeps a stale render from
    // sending a request the Host would refuse anyway.
    if (!target || workspaceTitleProblem(workspaceRenameValue, workspaces, target) !== null) return
    setWorkspaceDialogBusy(true)
    setWorkspaceDialogError(null)
    try {
      await workspaceController.rename(target, workspaceRenameValue.trim())
      setWorkspaceRenameTarget(null)
      setNotice({ text: '工作区名称已更新。' })
    } catch (error) {
      setWorkspaceDialogError(workspaceFailureMessage(error))
    } finally {
      setWorkspaceDialogBusy(false)
    }
  }

  const confirmWorkspaceDelete = async () => {
    const target = workspaceDelete
    if (!target) return
    setWorkspaceDialogBusy(true)
    setWorkspaceDialogError(null)
    try {
      await workspaceController.delete(target.workspaceId)
      setWorkspaceDelete(null)
      // The registration is gone, so a pin or hidden entry for it would only
      // be a stale id from here on. The Host keeps the folder and every log.
      if (preferences.pinnedWorkspaceIds.includes(target.workspaceId) || preferences.hiddenWorkspaceIds.includes(target.workspaceId)) {
        updatePreferences({
          pinnedWorkspaceIds: preferences.pinnedWorkspaceIds.filter((id) => id !== target.workspaceId),
          hiddenWorkspaceIds: preferences.hiddenWorkspaceIds.filter((id) => id !== target.workspaceId),
        })
      }
      if (view.workspaceId === target.workspaceId) commitView({ workspaceId: null, scrollY: 0 })
      setNotice({ text: `已删除工作区「${target.title}」。文件夹与会话记录已保留。` })
    } catch (error) {
      setWorkspaceDialogError(workspaceFailureMessage(error))
    } finally {
      setWorkspaceDialogBusy(false)
    }
  }

  const toggleWorkspacePin = (id: string) => {
    const next = new Set(preferences.pinnedWorkspaceIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    updatePreferences({ pinnedWorkspaceIds: [...next] })
  }

  const toggleWorkspaceHidden = (id: string) => {
    const next = new Set(preferences.hiddenWorkspaceIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    updatePreferences({ hiddenWorkspaceIds: [...next] })
  }

  /** Remove only the restored ids; every other hidden workspace stays hidden. */
  const restoreHiddenWorkspaces = (ids: readonly string[]) => {
    const removing = new Set(ids)
    updatePreferences({
      hiddenWorkspaceIds: preferences.hiddenWorkspaceIds.filter((id) => !removing.has(id)),
    })
  }

  const heading = (title: string, count: string) => <div className="wb-section-heading">
    <h2>{title}</h2>
    <span>{count}</span>
  </div>

  const renderSessionList = (ids: readonly string[]) => <>
    <div className="wb-session-list">
      {ids.slice(0, visibleLimit).map((id) => {
        const session = sessionsById[id]
        if (!session) return null
        return <SessionRow
          key={id}
          session={session}
          archived={archivedIds.has(id)}
          pinned={pinnedIds.has(id)}
          busy={busyId === id}
          parentLabel={parentLabelFor(session, sessionsById)}
          onOpen={() => void openSession(id)}
          onAction={(action) => void runSessionAction(id, action)}
          onRename={() => beginRename(id)}
        />
      })}
    </div>
    {ids.length > visibleLimit && <button
      className="wb-more"
      type="button"
      onClick={() => setVisibleLimit((limit) => limit + SESSION_PAGE_SIZE)}
    >
      加载更多（{ids.length - visibleLimit} 项剩余）
    </button>}
  </>

  const renderWorkspaceCard = (workspace: WorkspaceRecord) => <WorkspaceCard
    key={workspace.workspaceId}
    workspace={workspace}
    sessionCount={sessionRows(workspace.sessionIds).length}
    pinned={pinnedWorkspaceIds.has(workspace.workspaceId)}
    manualOrder={preferences.workspaceOrder === 'manual'}
    onOpen={() => commitView({ workspaceId: workspace.workspaceId, scrollY: 0 })}
    onTogglePin={() => toggleWorkspacePin(workspace.workspaceId)}
    onHide={() => toggleWorkspaceHidden(workspace.workspaceId)}
    onMove={(delta) => void moveWorkspace(workspace.workspaceId, delta)}
    onRename={() => beginWorkspaceRename(workspace)}
    onDelete={() => {
      setWorkspaceDelete({ workspaceId: workspace.workspaceId, title: workspace.title })
      setWorkspaceDialogError(null)
    }}
    onStartSession={() => startSession(workspace.workspaceId)}
  />

  const renderWorkspaceList = (list: readonly WorkspaceRecord[]) => preferences.groupBy === 'workspace-tree'
    ? <div className="wb-tree-groups">
      {groupWorkspacesByParent(list).map((group) => <section className="wb-tree-group" key={group.parent}>
        <h3 className="wb-tree-heading">{group.parent}</h3>
        <div className="wb-grid">{group.workspaces.map(renderWorkspaceCard)}</div>
      </section>)}
    </div>
    : <div className="wb-grid">{list.map(renderWorkspaceCard)}</div>

  const content = workspaceSnapshot?.state === 'loading' && workspaces.length === 0
    ? <p className="wb-container wb-empty">正在加载工作区…</p>
    : details
      ? <section className="wb-container wb-section">
        {heading('会话', `${detailRows.length} 项`)}
        {renderSessionList(detailRows)}
        {detailRows.length === 0 && <p className="wb-empty">没有符合当前搜索与筛选条件的会话。</p>}
      </section>
      : isSearching && view.scope === 'sessions'
        ? <section className="wb-container wb-section">
          {heading('会话结果', `${sessionHits.length} 项`)}
          {renderSessionList(sessionHits)}
          {sessionHits.length === 0 && <p className="wb-empty">没有匹配的会话。</p>}
        </section>
        : isSearching && view.scope === 'all'
          ? <div className="wb-container">
            <section className="wb-section">
              {heading('工作区', `${workspaceHits.length} 项`)}
              {/* `workspaceHits` is already query-filtered in this branch. */}
              <div className="wb-grid">{workspaceHits.map(renderWorkspaceCard)}</div>
            </section>
            <section className="wb-section">
              {heading('会话', `${sessionHits.length} 项`)}
              {renderSessionList(sessionHits)}
            </section>
          </div>
          : preferences.groupBy === 'flat' && view.scope !== 'workspaces'
            ? <section className="wb-container wb-section">
              {heading('全部会话', `${sessionHits.length} 项`)}
              {renderSessionList(sessionHits)}
            </section>
            : view.scope === 'workspaces' || (!isSearching && view.scope !== 'sessions')
              ? <section className="wb-container wb-section">
                {heading('工作区', `${visibleWorkspaces.length} 项`)}
                {renderWorkspaceList(visibleWorkspaces)}
                {preferences.hiddenWorkspaceIds.length > 0 && <button
                  className="wb-secondary"
                  type="button"
                  onClick={() => setHiddenDialogOpen(true)}
                >
                  管理隐藏的工作区（{hiddenSplit.hidden.length}）
                </button>}
                {ungroupedRows.length > 0 && <section className="wb-ungrouped">
                  {heading('未分组', `${ungroupedRows.length} 个会话`)}
                  {renderSessionList(ungroupedRows)}
                </section>}
                {visibleWorkspaces.length === 0 && <p className="wb-empty">没有已注册的工作区。可从 DSH 原生侧栏添加工作区。</p>}
              </section>
              : <section className="wb-container wb-section">
                {heading('全部会话', `${sessionHits.length} 项`)}
                {renderSessionList(sessionHits)}
              </section>

  return <main className="wb-root" data-density={preferences.density}>
    <style>{styles}</style>

    <header className="wb-container wb-header">
      <div className="wb-title-row">
        {details && <button className="wb-back" type="button" onClick={() => commitView({ workspaceId: null, scrollY: 0 })}>← 所有工作区</button>}
        <div className="wb-title">
          <p className="wb-eyebrow">DSH 工作区与会话</p>
          <h1>{details?.title ?? '工作区浏览器'}</h1>
          {details && <p className="wb-path" title={details.path}>{details.path}</p>}
        </div>
        {details && <button className="wb-primary" type="button" onClick={() => startSession(details.workspaceId)}>＋ 新会话</button>}
      </div>

      <div className="wb-controls">
        <label className="wb-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={view.query}
            onChange={(event) => commitView({ query: event.target.value })}
            placeholder={details ? '搜索当前工作区的会话…' : '搜索工作区、路径、会话标题或 ID…'}
            aria-label="搜索工作区与会话"
          />
        </label>
        {!details && <label>范围 <select value={view.scope} onChange={(event) => commitView({ scope: event.target.value as SearchScope })}>
          <option value="all">全部</option>
          <option value="workspaces">工作区</option>
          <option value="sessions">会话</option>
        </select></label>}
        <label>排序 <select
          value={details ? preferences.sessionOrder : preferences.workspaceOrder}
          onChange={(event) => details
            ? updatePreferences({ sessionOrder: event.target.value as SessionOrder })
            : updatePreferences({ workspaceOrder: event.target.value as WorkspaceOrder })}
        >
          {details
            ? <><option value="manual">手动顺序</option><option value="recent">最近活动</option></>
            : <><option value="manual">手动顺序</option><option value="name">名称</option><option value="recent">最近活动</option></>}
        </select></label>
        <label>归档 <select
          value={preferences.archivedFilter}
          onChange={(event) => updatePreferences({ archivedFilter: event.target.value as ArchivedFilter })}
        >
          <option value="active">隐藏已归档</option>
          <option value="all">全部</option>
          <option value="archived">仅归档</option>
        </select></label>
        {!details && <label>分组 <select
          value={preferences.groupBy}
          onChange={(event) => updatePreferences({ groupBy: event.target.value as WorkspaceGroupBy })}
        >
          <option value="workspace">工作区</option>
          <option value="workspace-tree">工作区树</option>
          <option value="flat">平铺</option>
        </select></label>}
        <label>密度 <select
          value={preferences.density}
          onChange={(event) => updatePreferences({ density: event.target.value === 'comfortable' ? 'comfortable' : 'compact' })}
        >
          <option value="compact">紧凑</option>
          <option value="comfortable">标准</option>
        </select></label>
        <label className="wb-toggle">
          <input
            type="checkbox"
            checked={preferences.showSubagents}
            onChange={(event) => updatePreferences({ showSubagents: event.target.checked })}
          />
          显示子代理会话
        </label>
        <label className="wb-toggle" title="列出所有尚未开始对话的会话，包括未发送的草稿；默认只显示当前打开的那一个">
          <input
            type="checkbox"
            checked={preferences.showBlankSessions}
            onChange={(event) => updatePreferences({ showBlankSessions: event.target.checked })}
          />
          显示空白会话
        </label>
      </div>

      <p className="wb-boundary">浏览偏好保存在本插件独立的浏览器存储，并可在同源标签页间同步；不与原生侧栏同步。这里只搜索会话元数据，不读取对话正文。</p>
    </header>

    {notice && <div className="wb-container wb-notice" role="status">
      <span>{notice.text}</span>
      <span>
        {forkedId && <button type="button" onClick={() => { void openSession(forkedId); setNotice(null) }}>打开分叉</button>}
        <button className="wb-notice-close" type="button" onClick={() => setNotice(null)} aria-label="关闭提示">×</button>
      </span>
    </div>}

    {content}

    {archiveTarget && <ArchiveConfirmDialog
      busy={busyId === archiveTarget}
      onConfirm={() => void confirmStopAndArchive()}
      onClose={() => setArchiveTarget(null)}
    />}
    {renameTarget && <RenameDialog
      value={renameValue}
      busy={busyId === renameTarget}
      onChange={setRenameValue}
      onConfirm={() => void confirmRename()}
      onClose={() => setRenameTarget(null)}
    />}
    {hiddenDialogOpen && <HiddenWorkspacesDialog
      hidden={hiddenSplit.hidden}
      missingCount={hiddenSplit.missingCount}
      onRestore={restoreHiddenWorkspaces}
      onRestoreAll={() => restoreHiddenWorkspaces(hiddenSplit.hidden.map((workspace) => workspace.workspaceId))}
      onClose={() => setHiddenDialogOpen(false)}
    />}
    {workspaceRenameTarget && <WorkspaceRenameDialog
      value={workspaceRenameValue}
      busy={workspaceDialogBusy}
      invalid={workspaceRenameProblem !== null}
      error={workspaceRenameError}
      onChange={(value) => { setWorkspaceRenameValue(value); setWorkspaceDialogError(null) }}
      onConfirm={() => void confirmWorkspaceRename()}
      onClose={() => { setWorkspaceRenameTarget(null); setWorkspaceDialogError(null) }}
    />}
    {workspaceDelete && <DeleteWorkspaceDialog
      workspaceTitle={workspaceDelete.title}
      busy={workspaceDialogBusy}
      error={workspaceDialogError}
      onConfirm={() => void confirmWorkspaceDelete()}
      onClose={() => { setWorkspaceDelete(null); setWorkspaceDialogError(null) }}
    />}

    <footer className="wb-container wb-footer">数据来自 DSH 工作区与会话目录快照；打开会话时才切换到原生对话页。</footer>
  </main>
}
