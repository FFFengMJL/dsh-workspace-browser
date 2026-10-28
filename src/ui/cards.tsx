/**
 * Presentational cards for the workspace grid and the session list.
 *
 * These components hold no state and call no services: the browser passes
 * already-derived data and callbacks, which keeps interaction wiring and
 * snapshot derivation in one place (`WorkspaceBrowser.tsx`).
 */
import React from 'react'
import { BLANK_SESSION_HINT, sessionRowActionsLocked, sessionRowTitle, type SessionRecord, type WorkspaceRecord } from '../logic.js'

/** Session actions the browser exposes on every row. */
export type SessionAction = 'pin' | 'archive' | 'fork' | 'copy'

export interface WorkspaceCardProps {
  workspace: WorkspaceRecord
  /** Sessions currently visible under the active filters (not the raw total). */
  sessionCount: number
  pinned: boolean
  /** Up/down reordering is only meaningful in registry (manual) order. */
  manualOrder: boolean
  onOpen(): void
  onTogglePin(): void
  onHide(): void
  onMove(delta: -1 | 1): void
  onStartSession(): void
}

export function WorkspaceCard({
  workspace,
  sessionCount,
  pinned,
  manualOrder,
  onOpen,
  onTogglePin,
  onHide,
  onMove,
  onStartSession,
}: WorkspaceCardProps): React.JSX.Element {
  return <article className="wb-workspace">
    <button className="wb-workspace-open" type="button" onClick={onOpen} title={workspace.title}>
      <span className="wb-workspace-title">{workspace.title}</span>
      <span className="wb-workspace-path" title={workspace.path}>{workspace.path}</span>
      <span className="wb-workspace-count">{sessionCount} 个会话</span>
    </button>
    <div className="wb-workspace-controls">
      <button type="button" onClick={onTogglePin}>{pinned ? '取消置顶' : '置顶'}</button>
      <button type="button" onClick={onHide} title="从本插件的浏览视图中隐藏">隐藏</button>
      <button type="button" disabled={!manualOrder} onClick={() => onMove(-1)} title="手动排序时可上移">↑</button>
      <button type="button" disabled={!manualOrder} onClick={() => onMove(1)} title="手动排序时可下移">↓</button>
      <button type="button" onClick={onStartSession}>新会话</button>
    </div>
  </article>
}

export interface SessionRowProps {
  session: SessionRecord
  archived: boolean
  pinned: boolean
  /** True while an action for this row is in flight. */
  busy: boolean
  /** Parent label for delegated sessions; already resolved to title or id. */
  parentLabel?: string
  onOpen(): void
  onAction(action: SessionAction): void
  onRename(): void
}

export function SessionRow({
  session,
  archived,
  pinned,
  busy,
  parentLabel,
  onOpen,
  onAction,
  onRename,
}: SessionRowProps): React.JSX.Element {
  const delegated = session.origin === 'subagent'
  const title = sessionRowTitle(session)
  // A provisional session has no conversation to rename or fork yet, so those
  // two controls stay off; opening it is exactly how the user resumes the draft.
  const locked = sessionRowActionsLocked(session)
  return <article className={session.blank === true ? 'wb-session wb-session-blank' : 'wb-session'}>
    <button className="wb-session-open" type="button" onClick={onOpen} title={session.displayTitle}>
      <span className="wb-session-heading">
        <span className="wb-session-title">{title}</span>
        {session.blank === true && <span className="wb-badge" title="尚未开始对话的新会话">{BLANK_SESSION_HINT}</span>}
        {delegated && <span className="wb-badge" title="由父会话委派创建的子代理会话">子代理</span>}
        {session.running && <span className="wb-badge wb-badge-live">运行中</span>}
      </span>
      <span className="wb-session-meta">
        {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : '时间未知'}
        {pinned ? ' · 已置顶' : ''}{archived ? ' · 已归档' : ''}
        {delegated && parentLabel ? ` · 父会话 ${parentLabel}` : ''}
      </span>
    </button>
    <div className="wb-session-actions" aria-label="会话操作">
      <button type="button" title={pinned ? '取消置顶' : '置顶'} aria-label={pinned ? '取消置顶' : '置顶'} disabled={busy} onClick={() => onAction('pin')}>{pinned ? '取消置顶' : '置顶'}</button>
      <button type="button" title={archived ? '恢复归档' : '归档'} aria-label={archived ? '恢复归档' : '归档'} disabled={busy} onClick={() => onAction('archive')}>{archived ? '恢复' : '归档'}</button>
      <button type="button" title={locked ? '新会话开始对话后才能重命名' : '重命名会话'} aria-label="重命名会话" disabled={busy || locked} onClick={onRename}>重命名</button>
      <button type="button" title={locked ? '新会话开始对话后才能分叉' : '分叉会话'} aria-label="分叉会话" disabled={busy || locked || archived} onClick={() => onAction('fork')}>分叉</button>
      <button type="button" title="复制会话 ID" aria-label="复制会话 ID" disabled={busy} onClick={() => onAction('copy')}>复制 ID</button>
    </div>
  </article>
}
