/**
 * Modal dialogs: a shared accessible shell plus the three confirm/manage flows.
 *
 * The shell owns everything every dialog must get right: Escape closes, Tab is
 * trapped inside, focus starts inside and returns to the invoking control, and
 * a click on the backdrop (never inside the panel) dismisses. Dialogs that only
 * change plugin preferences (hidden workspaces) never call DSH services.
 */
import React, { useEffect, useRef, useState } from 'react'
import { createLatestRequest, matchesQuery, type WorkspaceRecord } from '../logic.js'
import type { DirectoryListingInfo } from './runtime.js'
import { FolderIcon } from './icons.js'

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
  /** Blocks saving for a locally detectable refusal, without showing a message. */
  invalid?: boolean
  /** Inline refusal shown beside the field; the draft stays editable. */
  error?: string | null
  onChange(value: string): void
  onConfirm(): void
  onClose(): void
}

interface TitleFormProps extends RenameDialogProps {
  titleId: string
  title: string
  label: string
}

/**
 * One-field title form shared by the session and workspace renames.
 *
 * The dialog stays open while a refusal is displayed so the typed title is not
 * lost; only an explicit save clears `error` in the parent.
 */
function TitleFormDialog({ titleId, title, label, value, busy, invalid = false, error, onChange, onConfirm, onClose }: TitleFormProps): React.JSX.Element {
  const canSave = Boolean(value.trim()) && !busy && !invalid
  return <Dialog
    titleId={titleId}
    title={title}
    onClose={busy ? () => {} : onClose}
    footer={<>
      <button type="button" disabled={busy} onClick={onClose}>取消</button>
      <button className="wb-primary" type="button" disabled={!canSave} onClick={onConfirm}>保存</button>
    </>}
  >
    <label className="wb-field">{label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && canSave) onConfirm() }}
      />
    </label>
    {error && <p className="wb-error" role="alert">{error}</p>}
  </Dialog>
}

/** Rename through the public session remote; the Host owns the stored title. */
export function RenameDialog(props: RenameDialogProps): React.JSX.Element {
  return <TitleFormDialog titleId="wb-rename-title" title="重命名会话" label="新标题" {...props} />
}

/** Rename through the public workspace client service; the Host owns the title. */
export function WorkspaceRenameDialog(props: RenameDialogProps): React.JSX.Element {
  return <TitleFormDialog titleId="wb-workspace-rename-title" title="重命名工作区" label="工作区名称" {...props} />
}

export interface DeleteWorkspaceDialogProps {
  /** Title of the workspace being removed. */
  workspaceTitle: string
  busy: boolean
  error?: string | null
  onConfirm(): void
  onClose(): void
}

/**
 * Confirm removing one workspace registration.
 *
 * Wording mirrors the native sidebar: the folder and every session log stay on
 * disk, and the workspace's sessions reappear under Ungrouped. Nothing is
 * deleted, so one explicit confirmation is enough — no typed-name gate.
 */
export function DeleteWorkspaceDialog({
  workspaceTitle,
  busy,
  error,
  onConfirm,
  onClose,
}: DeleteWorkspaceDialogProps): React.JSX.Element {
  return <Dialog
    titleId="wb-delete-workspace-title"
    title="删除工作区？"
    description={`将把「${workspaceTitle}」从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在「未分组」下。`}
    onClose={busy ? () => {} : onClose}
    footer={<>
      <button type="button" disabled={busy} onClick={onClose}>取消</button>
      <button className="wb-danger" type="button" disabled={busy} onClick={onConfirm}>{busy ? '正在删除…' : '删除工作区'}</button>
    </>}
  >
    {error && <p className="wb-error" role="alert">{error}</p>}
  </Dialog>
}

export interface AddWorkspaceDialogProps {
  busy: boolean
  /** Refusal of the last submit or native picker; manual entry stays available. */
  error?: string | null
  /** Retry the DSH native directory chooser. */
  onPickDirectory(): void
  /** List one Host directory; rejects with a user-facing message. */
  onListDirectory(path: string | undefined, signal: AbortSignal): Promise<DirectoryListingInfo>
  onSubmit(path: string): void
  onClose(): void
}

/**
 * Register an existing Host directory.
 *
 * The path field is always available, so a Host without the in-app browse
 * backend keeps a working flow. Browsing only lists directories and never
 * reads file contents; every listing is Host-returned path data, never a path
 * assembled in the browser. Requests are aborted and generation-checked so a
 * slow listing cannot overwrite a newer directory or a dialog already closed.
 */
export function AddWorkspaceDialog({
  busy,
  error,
  onPickDirectory,
  onListDirectory,
  onSubmit,
  onClose,
}: AddWorkspaceDialogProps): React.JSX.Element {
  const [path, setPath] = useState('')
  const [listing, setListing] = useState<DirectoryListingInfo | null>(null)
  const [listingBusy, setListingBusy] = useState(false)
  const [listingError, setListingError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const requestGate = useRef(createLatestRequest())

  // Closing aborts a pending browse; the generation check below also covers
  // the case where an abort races a response that already resolved.
  useEffect(() => () => abortRef.current?.abort(), [])

  const load = async (target?: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const request = requestGate.current.next()
    setListingBusy(true)
    setListingError(null)
    try {
      const next = await onListDirectory(target, controller.signal)
      if (!requestGate.current.isCurrent(request)) return
      setListing(next)
      setPath(next.path)
    } catch (caught) {
      if (!requestGate.current.isCurrent(request)) return
      if (controller.signal.aborted) return
      setListingError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      if (requestGate.current.isCurrent(request)) setListingBusy(false)
    }
  }

  const trimmed = path.trim()
  const canSubmit = trimmed !== '' && !busy
  const submit = () => {
    if (canSubmit) onSubmit(trimmed)
  }

  return <Dialog
    titleId="wb-add-workspace-title"
    title="添加工作区"
    description="注册一个已经存在的主机目录。路径由运行 DSH 的主机校验，不是这台浏览器所在电脑的目录。"
    onClose={busy ? () => {} : onClose}
    wide
    footer={<>
      <button type="button" disabled={busy} onClick={onClose}>取消</button>
      <button type="button" disabled={busy} onClick={onPickDirectory}>重新选择系统目录</button>
      <button className="wb-primary" type="button" disabled={!canSubmit} onClick={submit}>{busy ? '正在添加…' : '添加工作区'}</button>
    </>}
  >
    <label className="wb-field">主机目录路径
      <input
        value={path}
        onChange={(event) => setPath(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') submit() }}
        placeholder="/srv/projects/demo"
        spellCheck={false}
        autoComplete="off"
      />
    </label>
    <p className="wb-hint">DSH 会规范化路径、检查目录是否存在，并在重复添加时复用已有工作区。</p>

    <div className="wb-browse-head">
      <button type="button" className="wb-secondary-inline" disabled={listingBusy} onClick={() => void load(trimmed || undefined)}>
        {listingBusy ? '正在读取…' : '浏览主机目录'}
      </button>
      {listing && !listingBusy && <span className="wb-browse-path" title={listing.path}>{listing.path}</span>}
    </div>

    {listingError && <p className="wb-error" role="alert">{listingError}</p>}

    {listing && !listingBusy && <section className="wb-browse" aria-label="主机目录浏览">
      {listing.crumbs.length > 0 && <div className="wb-browse-crumbs">
        {listing.crumbs.map((crumb) => <button
          key={crumb.path}
          type="button"
          className="wb-browse-crumb"
          title={crumb.path}
          onClick={() => void load(crumb.path)}
        >{crumb.name}</button>)}
      </div>}
      {listing.entries.length === 0
        ? <p className="wb-hint">此目录没有可进入的子目录。</p>
        : <ul className="wb-browse-list">
          {listing.entries.map((entry) => <li key={entry.path}>
            <button type="button" className="wb-browse-entry" title={entry.path} onClick={() => void load(entry.path)}>
              <FolderIcon /><span>{entry.name}</span>
              {entry.hidden === true && <span className="wb-browse-hidden">隐藏目录</span>}
            </button>
          </li>)}
        </ul>}
      {listing.truncated && <p className="wb-hint">目录条目过多，Host 只返回了其中一部分。</p>}
      <button
        type="button"
        className="wb-browse-pick"
        disabled={busy}
        onClick={() => onSubmit(listing.path)}
      >
        <FolderIcon size={14} />使用此目录（{listing.path}）
      </button>
    </section>}

    {error && <p className="wb-error" role="alert">{error}</p>}
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
