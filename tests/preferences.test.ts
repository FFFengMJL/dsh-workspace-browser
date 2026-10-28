/**
 * Write-path tests for plugin preferences.
 *
 * The compact sidebar can write a preference while the panel is not mounted,
 * so the merge base matters: storage is the cross-tab truth, and the in-memory
 * cache is only the fallback when a write is refused. These cases pin both
 * branches without touching a real browser store.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  BROWSER_PREFERENCES_KEY,
  defaultBrowserPreferences,
  type BrowserPreferences,
} from '../src/logic.js'
import { publishBrowserPreferences, updateBrowserPreferences } from '../src/ui/preferences.js'

const originalWindow = (globalThis as { window?: unknown }).window

function fakeBrowser(store: Map<string, string>, refuseWrites = false): void {
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (refuseWrites) throw new Error('quota exceeded')
      store.set(key, value)
    },
  }
  ;(globalThis as { window?: unknown }).window = {
    localStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

const stored = (preferences: Partial<BrowserPreferences>): string =>
  JSON.stringify({ ...defaultBrowserPreferences(), ...preferences, schemaVersion: 1 })

afterEach(() => {
  ;(globalThis as { window?: unknown }).window = originalWindow
})

describe('preference write merge', () => {
  it('merges onto the latest stored copy, not a stale in-page cache', () => {
    const store = new Map<string, string>()
    // The other tab has already written `showSubagents: true`; this page's
    // cache still carries the previous value.
    store.set(BROWSER_PREFERENCES_KEY, stored({ showSubagents: true, simplifySidebar: true }))
    fakeBrowser(store)
    publishBrowserPreferences({ ...defaultBrowserPreferences(), showSubagents: false, simplifySidebar: true })

    const next = updateBrowserPreferences({ simplifySidebar: false })
    expect(next.showSubagents).toBe(true)
    expect(next.simplifySidebar).toBe(false)
    expect(JSON.parse(store.get(BROWSER_PREFERENCES_KEY) ?? '{}').showSubagents).toBe(true)
  })

  it('keeps this page\'s in-memory state when the write is refused', () => {
    const store = new Map<string, string>()
    // Storage still has the old value, and refuses new writes.
    store.set(BROWSER_PREFERENCES_KEY, stored({ showSubagents: true }))
    fakeBrowser(store, true)
    // This page already applied a different value in memory.
    publishBrowserPreferences({ ...defaultBrowserPreferences(), showSubagents: false, simplifySidebar: true })

    const next = updateBrowserPreferences({ simplifySidebar: false })
    expect(next.showSubagents).toBe(false)
    expect(next.simplifySidebar).toBe(false)
    // The refused write leaves storage untouched; the page keeps working.
    expect(JSON.parse(store.get(BROWSER_PREFERENCES_KEY) ?? '{}').showSubagents).toBe(true)
  })
})
