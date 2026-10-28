/**
 * Plugin-owned browser preferences: load, persist, and cross-tab sync.
 *
 * Boundary notes that matter for maintenance:
 * - Storage is browser-local and plugin-specific. It is not the native sidebar
 *   state, not a DSH storage file, and not shared across browser profiles.
 * - Only ids and display enums are stored. Session titles, paths and bodies are
 *   never written here.
 * - A denied or full storage degrades to memory-only operation; nothing in this
 *   module throws, so the panel stays usable in private windows.
 *
 * Preference reads are also needed outside React: the compact sidebar entry is
 * installed at plugin load, before any panel mounts. The same
 * `subscribeBrowserPreferences` helper therefore backs both the hook and that
 * controller, so a toggle in the panel reaches the sidebar in this tab and in
 * every other same-origin tab.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BROWSER_PREFERENCES_KEY,
  defaultBrowserPreferences,
  loadBrowserPreferences,
  parseBrowserPreferences,
  resolvePreferenceStorage,
  saveBrowserPreferences,
  type BrowserPreferences,
} from '../logic.js'

/** Same-tab change notification; `storage` events never fire in the writer. */
export const BROWSER_PREFERENCES_EVENT = 'dsh-workspace-browser:preferences-changed'

/**
 * Last preferences this page has seen.
 *
 * Used only as the merge base for writes made outside the panel hook. It keeps
 * a memory-only page consistent: when storage refuses writes, the sidebar's
 * restore button still merges onto the value the panel just published instead
 * of resetting unrelated settings to defaults.
 */
let latestPreferences: BrowserPreferences | undefined

/** Resolve browser storage defensively; the accessor itself can throw. */
export function browserPreferenceStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  return resolvePreferenceStorage(() => window.localStorage)
}

/** Announce a preference write to controllers living outside this hook. */
export function publishBrowserPreferences(preferences: BrowserPreferences): void {
  latestPreferences = preferences
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<BrowserPreferences>(BROWSER_PREFERENCES_EVENT, { detail: preferences }))
}

/**
 * Subscribe to preference changes from any source.
 *
 * `storage` covers other tabs (and a `localStorage.clear()`, whose `key` is
 * null); the custom event covers this tab, where storage events do not fire.
 */
export function subscribeBrowserPreferences(listener: (preferences: BrowserPreferences) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== BROWSER_PREFERENCES_KEY) return
    const next = event.key === null ? defaultBrowserPreferences() : parseBrowserPreferences(event.newValue)
    latestPreferences = next
    listener(next)
  }
  const handleLocal = (event: Event) => {
    const detail = (event as CustomEvent<BrowserPreferences>).detail
    if (detail && typeof detail === 'object') {
      latestPreferences = detail
      listener(detail)
    }
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(BROWSER_PREFERENCES_EVENT, handleLocal)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(BROWSER_PREFERENCES_EVENT, handleLocal)
  }
}

/**
 * Merge one patch into the latest known preferences and publish it.
 *
 * Used by controls that live outside the panel hook (the compact sidebar
 * entry's restore button). Storage is the fallback merge base when this page
 * has not seen a value yet; a failed write still publishes the in-memory
 * result so the current page reacts, matching the memory-only fallback.
 */
export function updateBrowserPreferences(
  patch: Partial<BrowserPreferences> | ((latest: BrowserPreferences) => Partial<BrowserPreferences>),
): BrowserPreferences {
  const storage = browserPreferenceStorage()
  // Read the shared copy on every write. Another tab may have changed a field
  // since the last storage event this page saw, and saving this page's whole
  // cached object would silently revert that change.
  const stored = storage !== undefined ? loadBrowserPreferences(storage) : undefined
  const base = stored ?? latestPreferences ?? defaultBrowserPreferences()
  const resolvePatch = (latest: BrowserPreferences) => typeof patch === 'function' ? patch(latest) : patch
  const next: BrowserPreferences = { ...base, ...resolvePatch(base), schemaVersion: 1 }
  if (saveBrowserPreferences(storage, next)) {
    publishBrowserPreferences(next)
    return next
  }
  // The write was refused (quota, private mode, no storage). Merge onto what
  // this page last applied rather than the stale stored copy, so an unrelated
  // in-memory toggle is not reset, and still publish so the UI follows.
  const memoryBase = latestPreferences ?? next
  const memory: BrowserPreferences = { ...memoryBase, ...resolvePatch(memoryBase), schemaVersion: 1 }
  publishBrowserPreferences(memory)
  return memory
}

export interface BrowserPreferencesState {
  readonly preferences: BrowserPreferences
  /**
   * Merge a patch into the current preferences, re-render, and persist.
   *
   * Callers pass whole arrays (`pinnedWorkspaceIds`) instead of mutating shared
   * Sets, which keeps every write a single, testable state transition.
   */
  update(patch: Partial<BrowserPreferences>): void
}

/** Load once at mount and keep Preferences in sync across same-origin tabs. */
export function useBrowserPreferences(): BrowserPreferencesState {
  const storage = useMemo(() => browserPreferenceStorage(), [])
  const [preferences, setPreferences] = useState<BrowserPreferences>(() => loadBrowserPreferences(storage))

  const update = useCallback((patch: Partial<BrowserPreferences>) => {
    const next: BrowserPreferences = { ...preferences, ...patch, schemaVersion: 1 }
    setPreferences(next)
    // A `false` return means the write was refused; the in-memory value above
    // still drives this page, matching the documented memory-only fallback.
    saveBrowserPreferences(storage, next)
    // The sidebar controller is not a React child of this hook; tell it now.
    publishBrowserPreferences(next)
  }, [preferences, storage])

  useEffect(() => subscribeBrowserPreferences(setPreferences), [])

  return { preferences, update }
}
