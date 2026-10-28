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

function browserPreferenceStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  // Reading `window.localStorage` itself throws when the origin is blocked, so
  // the accessor is resolved defensively rather than assumed.
  return resolvePreferenceStorage(() => window.localStorage)
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
  }, [preferences, storage])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      // `key === null` is a full `localStorage.clear()`, which resets defaults.
      if (event.key !== null && event.key !== BROWSER_PREFERENCES_KEY) return
      setPreferences(event.key === null ? defaultBrowserPreferences() : parseBrowserPreferences(event.newValue))
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  return { preferences, update }
}
