/**
 * Modal dialogs: a shared accessible shell plus the three confirm/manage flows.
 *
 * The shell owns everything every dialog must get right: Escape closes, Tab is
 * trapped inside, focus starts inside and returns to the invoking control, and
 * a click on the backdrop (never inside the panel) dismisses. Dialogs that only
 * change plugin preferences (hidden workspaces) never call DSH services.
 */
import React, { useEffect, useRef, useState } from 'react'
import { matchesQuery, type WorkspaceRecord } from '../logic.js'

interface DialogProps {
  titleId: string
  title: string
  description?: string
  /** Called for Escape, backdrop clicks, and the footer's cancel button. */
  onClose(): void
  children?: React.ReactNode
  footer: React.ReactNode
  wide?: boolean
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]'

function Dialog({ titleId, title, description, onClose, children, footer, wide = false }: DialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLElement>(null)
  // Keep the latest handler without re-running the focus effect: re-running it
  // on every parent render would steal focus back to the first control.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = (): HTMLElement[] => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    )
    // Focus the first control so keyboard users start inside the dialog; fall
    // back to the dialog itself when it has no focusable child.
    const initial = focusable()[0] ?? dialogRef.current
    initial?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      // Wrap focus at both ends so keyboard users cannot tab into the page
      // behind the modal.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // The invoking control can disappear while the dialog is open (for
      // example after restoring the last hidden workspace); skip a detached node.
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  return <div className="wb-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section
      ref={dialogRef}
      className={wide ? 'wb-modal wb-modal-wide' : 'wb-modal'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <h2 id={titleId}>{title}</h2>
      {description && <p>{description}</p>}
      {children}
      <footer className="wb-modal-footer">{footer}</footer>
    </section>
  </div>
}

export interface ArchiveConfirmDialogProps {
  busy: boolean
  onConfirm(): void
  onClose(): void
}

/** Confirmation for archiving a session that still has running work. */
export function ArchiveConfirmDialog({ busy, onConfirm, onClose }: ArchiveConfirmDialogProps): React.JSX.Element {
  return <Dialog
    titleId="wb-archive-title"
    title="停止并归档会话？"
    description="此会话仍在运行。确认后将请求 DSH 停止当前工作并归档。"
    onClose={onClose}
    footer={<>
      <button type="button" onClick={onClose}>取消</button>
      <button className="wb-danger" type="button" disabled={busy} onClick={onConfirm}>停止并归档</button>
    </>}
  />
}

export interface RenameDialogProps {
  value: string
  busy: boolean
  onChange(value: string): void
  onConfirm(): void
  onClose(): void
}

/** Rename through the public session remote; the Host owns the stored title. */
export function RenameDialog({ value, busy, onChange, onConfirm, onClose }: RenameDialogProps): React.JSX.Element {
  const canSave = Boolean(value.trim()) && !busy
  return <Dialog
    titleId="wb-rename-title"
    title="重命名会话"
    onClose={onClose}
    footer={<>
      <button type="button" onClick={onClose}>取消</button>
      <button className="wb-primary" type="button" disabled={!canSave} onClick={onConfirm}>保存</button>
    </>}
  >
    <label className="wb-field">新标题
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && canSave) onConfirm() }}
      />
    </label>
  </Dialog>
}

export interface HiddenWorkspacesDialogProps {
  /** Registered workspaces currently hidden, in display order. */
  hidden: readonly WorkspaceRecord[]
  /** Hidden ids whose workspace is no longer registered. */
  missingCount: number
  onRestore(ids: readonly string[]): void
  onRestoreAll(): void
  onClose(): void
}

/**
 * Selective restore for hidden workspaces.
 *
 * Restoring removes exactly the chosen ids from the preference, so hiding many
 * workspaces and bringing two back does not reset the rest. The dialog is also
 * usable when only stale ids remain: it explains them instead of showing cards
 * for workspaces that no longer exist.
 */
export function HiddenWorkspacesDialog({
  hidden,
  missingCount,
  onRestore,
  onRestoreAll,
  onClose,
}: HiddenWorkspacesDialogProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<readonly string[]>([])

  const available = new Set(hidden.map((workspace) => workspace.workspaceId))
  // Derive the live selection instead of pruning state in an effect: another
  // tab may restore a workspace while this dialog is open.
  const activeSelection = selected.filter((id) => available.has(id))
  const matches = hidden.filter((workspace) => matchesQuery(query, workspace.title, workspace.path))

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id])
  }

  return <Dialog
    titleId="wb-hidden-title"
    title="管理隐藏的工作区"
    description="隐藏只影响本插件的浏览视图，不会改动 DSH 的工作区注册。未勾选的工作区会保持隐藏。"
    onClose={onClose}
    wide
    footer={<>
      <button type="button" onClick={onClose}>关闭</button>
      <button type="button" disabled={activeSelection.length === 0} onClick={() => onRestore(activeSelection)}>恢复所选（{activeSelection.length}）</button>
      <button className="wb-primary" type="button" disabled={hidden.length === 0} onClick={onRestoreAll}>恢复全部（{hidden.length}）</button>
    </>}
  >
    {hidden.length > 0 && <label className="wb-field">筛选
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称或路径筛选…" aria-label="筛选隐藏的工作区" />
    </label>}
    {hidden.length === 0
      ? <p className="wb-hint">当前没有可恢复的隐藏工作区。</p>
      : matches.length === 0
        ? <p className="wb-hint">没有匹配的隐藏工作区。</p>
        : <ul className="wb-hidden-list">
          {matches.map((workspace) => <li className="wb-hidden-row" key={workspace.workspaceId}>
            <label className="wb-hidden-label">
              <input
                type="checkbox"
                checked={activeSelection.includes(workspace.workspaceId)}
                onChange={() => toggle(workspace.workspaceId)}
              />
              <span className="wb-hidden-title">{workspace.title}</span>
              <span className="wb-hidden-path" title={workspace.path}>{workspace.path}</span>
            </label>
            <button type="button" onClick={() => onRestore([workspace.workspaceId])}>恢复</button>
          </li>)}
        </ul>}
    {missingCount > 0 && <p className="wb-hint">
      另有 {missingCount} 个隐藏条目对应的工作区已不在注册表中。它们会保留在偏好里，但不会显示为卡片。
    </p>}
  </Dialog>
}
