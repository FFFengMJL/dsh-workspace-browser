/**
 * Searchable replacement for DSH's native new-session workspace picker.
 *
 * The native conversation page owns the trigger and the session-selection
 * semantics; it renders `conversation.hero.workspace` with `open`, the trigger
 * ref, the current workspace id, `onPick` and `onClose`. This module fills that
 * single slot at a lower priority while the preference is on, so it only owns
 * presentation and search. Picking calls the owner's `onPick`, never
 * `startSession`, which keeps the host's draft and workspace-transfer rules.
 *
 * The native picker declares a directory-flow child slot. A second declaration
 * would be rejected by the slot registry (one declarer per child key), so this
 * replacement deliberately does not declare children. Its add-workspace action
 * uses the public `uiWorkspace` directory services instead: the Host's native
 * chooser first, and the existing add dialog's manual path/browse fallback.
 */
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  loadBrowserPreferences,
  type BrowserPreferences,
  type WorkspaceRecord,
} from '../logic.js'
import {
  createWorkspaceSearchIndex,
  filterWorkspaceSearch,
  moveActiveIndex,
  searchTerms,
  workspaceDisplayName,
} from '../workspaceSearch.js'
import { AddWorkspaceDialog } from './dialogs.js'
import { FolderIcon, PlusIcon } from './icons.js'
import {
  browserPreferenceStorage,
  subscribeBrowserPreferences,
  updateBrowserPreferences,
} from './preferences.js'
import {
  directoryFailureMessage,
  normalizeDirectoryListing,
  useSource,
  workspaceFailureMessage,
  type DirectoryListingInfo,
  type PluginRuntime,
  type Source,
  type WorkspaceCatalogSnapshot,
} from './runtime.js'
import { styles, workspacePickerStyles } from './styles.js'

/** Lowest live priority wins; the native picker registers at the default 0. */
const SHADOW_PRIORITY = -100

/** Stable empty snapshot so a missing `items` field does not rebuild the index. */
const EMPTY_WORKSPACES: readonly WorkspaceRecord[] = []

/** Owner props the conversation page passes to the `conversation.hero.workspace` slot. */
export interface WorkspacePickerOwnerProps {
  readonly open: boolean
  readonly anchorRef?: React.RefObject<HTMLElement | null>
  readonly selectedId?: string
  /** Select a real workspace; the owner closes the picker and applies its semantics. */
  readonly onPick: (workspaceId: string) => void
  readonly onClose: () => void
}

/** Public services the replacement needs, injected at installation time. */
export interface WorkspacePickerServices {
  readonly workspaces: Source<WorkspaceCatalogSnapshot>
  /** Register an existing host directory; rejects with a user-facing message. */
  readonly createWorkspace: (path: string) => Promise<WorkspaceRecord>
  /** Open the Host's native directory chooser; null means the operator cancelled. */
  readonly pickDirectory: () => Promise<string | null>
  /** List one Host directory level for the manual add dialog. */
  readonly listDirectory: (path: string | undefined, signal: AbortSignal) => Promise<DirectoryListingInfo>
}

export interface EnhancedWorkspacePickerProps extends WorkspacePickerOwnerProps, WorkspacePickerServices {}

interface PickerPosition {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly maxHeight: number
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Searchable picker. It renders only while the owner says the menu is open,
 * plus the add dialog, which may stay mounted after `open` flips back to false
 * (the native picker does the same when it hands off to the folder flow).
 */
export function EnhancedWorkspacePicker({
  open,
  anchorRef,
  selectedId,
  onPick,
  onClose,
  workspaces,
  createWorkspace,
  pickDirectory,
  listDirectory,
}: EnhancedWorkspacePickerProps): React.JSX.Element {
  const snapshot = useSource(workspaces)
  const items = snapshot.items ?? EMPTY_WORKSPACES
  const phase = snapshot.phase
  const index = useMemo(() => createWorkspaceSearchIndex(items), [items])
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState<PickerPosition | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const results = useMemo(() => filterWorkspaceSearch(index, query), [index, query])
  const listboxId = useId()
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLLIElement | null>>([])
  const composingRef = useRef(false)
  const addFlowRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  // The menu is anchored to the native trigger. Fixed positioning avoids
  // clipping by the conversation layout's scroll containers; the listeners
  // keep it attached while the window or page moves.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const update = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const rect = anchorRef?.current?.getBoundingClientRect()
      if (!rect) {
        setPosition(null)
        return
      }
      const margin = 8
      const width = Math.min(360, Math.max(180, Math.min(320, viewportWidth - margin * 2)))
      const left = Math.min(Math.max(margin, rect.left), viewportWidth - width - margin)
      const below = viewportHeight - rect.bottom - margin
      const above = rect.top - margin
      const openUp = below < 220 && above > below
      const available = openUp ? above - 6 : below - 6
      const maxHeight = Math.min(440, Math.max(160, available))
      const top = openUp
        ? Math.max(margin, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, viewportHeight - maxHeight - margin)
      setPosition({ top, left, width, maxHeight })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  // A fresh open always starts from the complete list and focuses the search
  // field, matching the native menu's "full list every time" behavior.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(-1)
      return
    }
    setQuery('')
    setActiveIndex(0)
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Closing returns focus to the invoking control so keyboard users do not
  // land on the page body. The previous element is normally the native chip;
  // fall back to the anchor if it disappeared during the picker's lifetime.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const target = previous?.isConnected ? previous : anchorRef?.current
      if (target?.isConnected) target.focus()
    }
  }, [open, anchorRef])

  // Keep the active row valid when filtering removes it.
  useEffect(() => {
    setActiveIndex((current) => {
      if (results.length === 0) return -1
      if (current < 0 || current >= results.length) return 0
      return current
    })
  }, [results.length])

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex, results.length])

  // Clicking anywhere outside the popover (but not the trigger, whose own
  // click toggles) dismisses it.
  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [open, anchorRef, onClose])

  // The add dialog owns Escape while it is open; the menu is already closed.
  useEffect(() => {
    if (!open || addOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // The search field handles Escape first and calls preventDefault; do not
      // close twice when the same event bubbles to the document.
      if (event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, addOpen, onClose])

  // A truly empty catalog follows the native picker's direct-to-folder flow:
  // only after `ready`, so a pending or failed snapshot never masquerades as
  // "no workspaces".
  useEffect(() => {
    if (!open || addOpen || phase !== 'ready' || snapshot.state === 'error' || items.length !== 0) return
    onClose()
    setAddError(null)
    setAddOpen(true)
  }, [open, addOpen, phase, snapshot.state, items.length, onClose])

  const pick = (workspaceId: string) => {
    onPick(workspaceId)
  }

  const openAdd = () => {
    onClose()
    setAddError(null)
    setAddOpen(true)
  }

  const closeAdd = () => {
    setAddOpen(false)
    setAddError(null)
  }

  const submitAdd = (path: string) => {
    if (addFlowRef.current) return
    addFlowRef.current = true
    setAddBusy(true)
    setAddError(null)
    void createWorkspace(path).then((workspace) => {
      if (!mountedRef.current) return
      setAddOpen(false)
      onPick(workspace.workspaceId)
    }).catch((error) => {
      if (mountedRef.current) setAddError(describeError(error))
    }).finally(() => {
      addFlowRef.current = false
      if (mountedRef.current) setAddBusy(false)
    })
  }

  const chooseDirectory = () => {
    if (addFlowRef.current) return
    addFlowRef.current = true
    setAddBusy(true)
    setAddError(null)
    void pickDirectory().then((path) => {
      if (!mountedRef.current || path === null) return
      return createWorkspace(path).then((workspace) => {
        if (!mountedRef.current) return
        setAddOpen(false)
        onPick(workspace.workspaceId)
      })
    }).catch((error) => {
      if (mountedRef.current) {
        setAddError(`系统目录选择器打开失败：${describeError(error)}。可重试，或手动输入/浏览主机目录。`)
      }
    }).finally(() => {
      addFlowRef.current = false
      if (mountedRef.current) setAddBusy(false)
    })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composingRef.current) return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((current) => moveActiveIndex(current, 1, results.length))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((current) => moveActiveIndex(current, -1, results.length))
        break
      case 'Home':
        if (results.length > 0) {
          event.preventDefault()
          setActiveIndex(0)
        }
        break
      case 'End':
        if (results.length > 0) {
          event.preventDefault()
          setActiveIndex(results.length - 1)
        }
        break
      case 'Enter': {
        const entry = results[activeIndex]
        if (entry) {
          event.preventDefault()
          pick(entry.workspace.workspaceId)
        }
        break
      }
      case 'Escape':
        event.preventDefault()
        onClose()
        break
      case 'Tab':
        // Let focus leave naturally, but do not leave an orphaned popover.
        onClose()
        break
      default:
        break
    }
  }

  const status = (() => {
    if (snapshot.state === 'error') return '工作区目录读取失败。'
    if (searchTerms(query).length > 0) return '没有匹配的工作区。'
    if (phase === 'pending' || snapshot.state === 'loading') return '正在读取工作区…'
    if (phase === 'ready') return '还没有工作区。'
    return '正在读取工作区…'
  })()

  const style: React.CSSProperties = position
    ? {
      top: position.top,
      left: position.left,
      width: position.width,
      maxHeight: position.maxHeight,
    }
    : {
      top: 72,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 360,
      maxHeight: 420,
    }

  return <>
    <style>{workspacePickerStyles}</style>
    {open && <div
      ref={popoverRef}
      className="wb-picker"
      style={style}
      role="dialog"
      aria-label="选择工作区"
    >
      <div className="wb-picker-search">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="搜索工作区（名称、路径、拼音）"
          aria-label="搜索工作区"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={results[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false }}
        />
      </div>
      <ul id={listboxId} className="wb-picker-list" role="listbox" aria-label="工作区">
        {results.map((entry, index) => {
          const workspace = entry.workspace
          const isCurrent = workspace.workspaceId === selectedId
          return <li
            key={workspace.workspaceId}
            ref={(element) => { optionRefs.current[index] = element }}
            id={`${listboxId}-option-${index}`}
            className="wb-picker-option"
            role="option"
            aria-selected={index === activeIndex}
            data-active={index === activeIndex ? 'true' : undefined}
            data-current={isCurrent ? 'true' : undefined}
            data-has-path={workspace.path !== '' ? 'true' : undefined}
            title={workspace.path}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick(workspace.workspaceId)}
          >
            <span className="wb-picker-option-icon"><FolderIcon size={14} /></span>
            <span className="wb-picker-option-title">{entry.name}</span>
            {workspace.path !== '' && <span className="wb-picker-option-path">{workspace.path}</span>}
            {isCurrent && <span className="wb-picker-option-check" aria-label="当前工作区">✓</span>}
          </li>
        })}
        {results.length === 0 && <li className="wb-picker-status" role="presentation">{status}</li>}
      </ul>
      <div className="wb-picker-add">
        <button type="button" onClick={openAdd}>
          <PlusIcon size={14} />
          <span>添加工作区…</span>
        </button>
      </div>
    </div>}
    {addOpen && <div className="wb-picker-dialog-scope">
      <style>{styles}</style>
      <AddWorkspaceDialog
        busy={addBusy}
        error={addError}
        onPickDirectory={chooseDirectory}
        onListDirectory={listDirectory}
        onSubmit={submitAdd}
        onClose={closeAdd}
      />
    </div>}
  </>
}

/** Dependencies of the picker shadow controller, injectable for tests. */
export interface WorkspacePickerControllerDeps {
  readonly slots: PluginRuntime['slots']
  readonly readPreferences: () => BrowserPreferences
  readonly subscribePreferences: (listener: (preferences: BrowserPreferences) => void) => () => void
  readonly writePreferences?: (patch: Partial<BrowserPreferences>) => void
  readonly component: unknown
}

function asDisposer(value: unknown): () => void {
  return typeof value === 'function' ? value as () => void : () => {}
}

/**
 * Keep the picker replacement in step with the preference.
 *
 * Mirrors the compact sidebar controller: default off, one registration while
 * on, and a preference correction (rather than a silent lie) when the cell is
 * already occupied at our priority. Disposing restores the native picker.
 */
export function createWorkspacePickerController(deps: WorkspacePickerControllerDeps): () => void {
  let disposeEntry: (() => void) | undefined
  let disposed = false

  const sync = (preferences?: BrowserPreferences) => {
    if (disposed) return
    const current = preferences ?? deps.readPreferences()
    const enabled = current.enhanceWorkspacePicker === true
    if (enabled && !disposeEntry) {
      try {
        disposeEntry = asDisposer(deps.slots.register(
          { name: 'conversation.hero.workspace', priority: SHADOW_PRIORITY },
          deps.component,
        ))
      } catch (error) {
        console.warn('dsh-workspace-browser: 增强工作区选择器未启用，保留原生菜单。', error)
        deps.writePreferences?.({ enhanceWorkspacePicker: false })
      }
      return
    }
    if (!enabled && disposeEntry) {
      const dispose = disposeEntry
      disposeEntry = undefined
      dispose()
    }
  }

  sync()
  const unsubscribe = deps.subscribePreferences((preferences) => sync(preferences))
  return () => {
    disposed = true
    unsubscribe()
    const dispose = disposeEntry
    disposeEntry = undefined
    dispose?.()
  }
}

/**
 * Install the picker replacement.
 *
 * `slots.inject` runs once per declaration lifetime of the conversation
 * hero's picker slot; its disposer tears the controller down when the page
 * unloads. The registration has no `children` on purpose: the native picker
 * owns the directory-flow declaration, and a second declaration would throw.
 */
export function installWorkspacePicker(runtime: PluginRuntime): void {
  runtime.slots.inject('conversation.hero.workspace', () => createWorkspacePickerController({
    slots: runtime.slots,
    readPreferences: () => loadBrowserPreferences(browserPreferenceStorage()),
    subscribePreferences: subscribeBrowserPreferences,
    writePreferences: updateBrowserPreferences,
    component: (props: WorkspacePickerOwnerProps) => <EnhancedWorkspacePicker
      {...props}
      workspaces={runtime.workspaces.list}
      createWorkspace={async (path) => {
        try {
          const created = await runtime.workspaces.create({ path })
          return {
            workspaceId: created.workspaceId,
            title: created.title,
            path: created.path,
            sessionIds: created.sessionIds ?? [],
          }
        } catch (error) {
          throw new Error(workspaceFailureMessage(error), { cause: error })
        }
      }}
      pickDirectory={() => runtime.uiWorkspace.pickDirectory()}
      listDirectory={async (path, signal) => {
        try {
          return normalizeDirectoryListing(await runtime.uiWorkspace.listDirectory(path, signal))
        } catch (error) {
          throw new Error(directoryFailureMessage(error), { cause: error })
        }
      }}
    />,
  }))
}
