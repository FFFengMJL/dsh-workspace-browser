/**
 * Presentational cards for the workspace grid and the session list.
 *
 * These components hold no state beyond a card's own overflow menu and call no
 * services: the browser passes already-derived data and callbacks, which keeps
 * interaction wiring and snapshot derivation in one place
 * (`WorkspaceBrowser.tsx`).
 */
import React, { useEffect, useRef, useState } from 'react'
import { BLANK_SESSION_HINT, sessionRowActionsLocked, sessionRowTitle, type SessionRecord, type WorkspaceRecord } from '../logic.js'
import { ArrowDownIcon, ArrowUpIcon, EyeOffIcon, MoreIcon, PencilIcon, PinIcon, PlusIcon, TrashIcon } from './icons.js'

/** Session actions the browser exposes on every row. */
export type SessionAction = 'pin' | 'archive' | 'fork' | 'copy'

export interface WorkspaceCardProps {
  workspace: WorkspaceRecord
  /** Sessions currently visible under the active filters (not the raw total). */
  sessionCount: number
  pinned: boolean
  /** Up/down reordering is only meaningful in registry (manual) order. */
  manualOrder: boolean
  /** Registry neighbours; false disables that direction in the menu. */
  canMoveUp: boolean
  canMoveDown: boolean
  onOpen(): void
  onTogglePin(): void
  onHide(): void
  onMove(delta: -1 | 1): void
  onRename(): void
  onDelete(): void
  onStartSession(): void
}

/**
 * One workspace card.
 *
 * Only the three high-frequency controls stay on the card (pin, new session,
 * more). Everything else lives in the overflow menu so the footer keeps a
 * single line in a narrow grid cell. The menu is rendered inside the card and
 * opens upward, which keeps it out of the page scroll container's clipping.
 */
export function WorkspaceCard({
  workspace,
  sessionCount,
  pinned,
  manualOrder,
  canMoveUp,
  canMoveDown,
  onOpen,
  onTogglePin,
  onHide,
  onMove,
  onRename,
  onDelete,
  onStartSession,
}: WorkspaceCardProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // A pointer outside both the trigger and the menu dismisses it. The menu is
  // not a modal: it never traps focus, so page scrolling stays usable.
  useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || moreRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen])

  // Move focus into the menu only after it exists. Opening with the keyboard
  // and with the pointer both land on the first enabled item.
  useEffect(() => {
    if (!menuOpen) return
    const first = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
    first?.focus()
  }, [menuOpen])

  /**
   * Close the menu, put focus back on the trigger, then run the action.
   *
   * Focusing the trigger *before* the dialog opens is deliberate: the dialog
   * shell records the active element and restores it on close, so the user
   * lands back on the More button instead of a detached menu item.
   */
  const run = (action: () => void) => {
    moreRef.current?.focus()
    setMenuOpen(false)
    action()
  }

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setMenuOpen(false)
      moreRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      // Tabbing leaves the menu; the browser's normal order continues.
      setMenuOpen(false)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Home') items[0].focus()
    else if (event.key === 'End') items[items.length - 1].focus()
    else if (event.key === 'ArrowDown') items[index < 0 ? 0 : (index + 1) % items.length].focus()
    else items[index <= 0 ? items.length - 1 : index - 1].focus()
  }

  const moveHint = manualOrder ? undefined : '切换到“手动顺序”后可调整顺序'
  const moveUpDisabled = !manualOrder || !canMoveUp
  const moveDownDisabled = !manualOrder || !canMoveDown

  return <article className="wb-workspace">
    <button className="wb-workspace-open" type="button" onClick={onOpen} title={workspace.title}>
      <span className="wb-workspace-title">{workspace.title}</span>
      <span className="wb-workspace-path" title={workspace.path}>{workspace.path}</span>
      <span className="wb-workspace-count">{sessionCount} 个会话</span>
    </button>
    <div className="wb-workspace-controls">
      <button
        className="wb-icon-button"
        type="button"
        aria-label={pinned ? '取消置顶工作区' : '置顶工作区'}
        aria-pressed={pinned}
        title={pinned ? '取消置顶' : '置顶'}
        onClick={onTogglePin}
      ><PinIcon filled={pinned} /></button>
      <button className="wb-card-session" type="button" onClick={onStartSession} title="在此工作区开始新会话">
        <PlusIcon />
        <span>新会话</span>
      </button>
      <span className="wb-controls-spacer" />
      <button
        ref={moreRef}
        className="wb-icon-button"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${workspace.title} 的更多操作`}
        title="更多操作"
        onClick={() => setMenuOpen((open) => !open)}
      ><MoreIcon /></button>
      {menuOpen && <div
        ref={menuRef}
        className="wb-menu"
        role="menu"
        aria-label={`${workspace.title} 的操作`}
        onKeyDown={handleMenuKeyDown}
      >
        <button type="button" role="menuitem" className="wb-menu-item" onClick={() => run(onHide)}>
          <EyeOffIcon /><span>隐藏</span>
        </button>
        <button type="button" role="menuitem" className="wb-menu-item" onClick={() => run(onRename)}>
          <PencilIcon /><span>重命名</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="wb-menu-item"
          disabled={moveUpDisabled}
          title={moveHint ?? (canMoveUp ? undefined : '已经是第一个工作区')}
          onClick={() => run(() => onMove(-1))}
        >
          <ArrowUpIcon /><span>上移</span>
        </button>
        <button
          type="button"
          role="menuitem"
          className="wb-menu-item"
          disabled={moveDownDisabled}
          title={moveHint ?? (canMoveDown ? undefined : '已经是最后一个工作区')}
          onClick={() => run(() => onMove(1))}
        >
          <ArrowDownIcon /><span>下移</span>
        </button>
        <div className="wb-menu-separator" role="separator" />
        <button type="button" role="menuitem" className="wb-menu-item wb-menu-danger" onClick={() => run(onDelete)}>
          <TrashIcon /><span>删除工作区</span>
        </button>
        {!manualOrder && <p className="wb-menu-note">当前按名称或最近活动排序；切换为“手动顺序”后可上下移动。</p>}
      </div>}
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
