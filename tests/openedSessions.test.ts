import { afterEach, describe, expect, it } from 'vitest'
import { OPENED_SESSIONS_KEY } from '../src/logic.js'
import { createOpenedSessionController, OPENED_SESSIONS_EVENT } from '../src/ui/openedSessions.js'
import type { HostSessionRow, SessionCatalogSnapshot, Source } from '../src/ui/runtime.js'

const originalWindow = (globalThis as { window?: unknown }).window

interface Harness {
  readonly source: Source<SessionCatalogSnapshot>
  set(snapshot: SessionCatalogSnapshot): void
  listenerCount(): number
}

function sourceHarness(initial: SessionCatalogSnapshot): Harness {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    },
    set(next) {
      snapshot = next
      for (const listener of [...listeners]) listener()
    },
    listenerCount: () => listeners.size,
  }
}

function session(id: string, overrides: Partial<HostSessionRow> = {}): HostSessionRow {
  return { id, displayTitle: id, updatedAt: 0, running: false, retainedBy: {}, ...overrides }
}

function snapshot(
  active: string | undefined,
  rows: Record<string, HostSessionRow>,
  phase: SessionCatalogSnapshot['phase'] = 'ready',
): SessionCatalogSnapshot {
  return {
    phase,
    ids: Object.keys(rows),
    byId: Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, {
      ...row,
      retainedBy: { mainView: id === active ? 1 : 0 },
    }])),
  }
}

function browserStorage(options: { refuseWrites?: boolean } = {}): {
  store: Map<string, string>
  restore(): void
  listenerCount(name: string): number
  dispatch(event: Event): void
} {
  const store = new Map<string, string>()
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  const fakeWindow = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.refuseWrites) throw new Error('quota exceeded')
        store.set(key, value)
      },
    },
    addEventListener(name: string, listener: EventListenerOrEventListenerObject) {
      const bucket = listeners.get(name) ?? new Set<EventListenerOrEventListenerObject>()
      bucket.add(listener)
      listeners.set(name, bucket)
    },
    removeEventListener(name: string, listener: EventListenerOrEventListenerObject) {
      const bucket = listeners.get(name)
      if (!bucket) return
      bucket.delete(listener)
    },
    dispatchEvent(event: Event) {
      for (const listener of [...(listeners.get(event.type) ?? [])]) {
        if (typeof listener === 'function') listener(event)
        else listener.handleEvent(event)
      }
      return true
    },
  }
  ;(globalThis as { window?: unknown }).window = fakeWindow
  return {
    store,
    restore: () => { (globalThis as { window?: unknown }).window = originalWindow },
    listenerCount: (name) => listeners.get(name)?.size ?? 0,
    dispatch: (event) => { fakeWindow.dispatchEvent(event) },
  }
}

afterEach(() => {
  ;(globalThis as { window?: unknown }).window = originalWindow
})

describe('entered session navigation', () => {
  it('adds only actual selection changes, preserves order, and suppresses immediate re-add after removal', () => {
    const browser = browserStorage()
    const harness = sourceHarness(snapshot('s1', { s1: session('s1'), s2: session('s2') }))
    const controller = createOpenedSessionController(harness.source)
    expect(controller.store.getSnapshot()).toEqual(['s1'])
    expect(JSON.parse(browser.store.get(OPENED_SESSIONS_KEY) ?? 'null')).toEqual(['s1'])

    harness.set(snapshot('s1', { s1: session('s1'), s2: session('s2') }))
    expect(controller.store.getSnapshot()).toEqual(['s1'])

    controller.store.remove('s1')
    harness.set(snapshot('s1', { s1: session('s1'), s2: session('s2') }))
    expect(controller.store.getSnapshot()).toEqual([])

    harness.set(snapshot(undefined, { s1: session('s1'), s2: session('s2') }))
    harness.set(snapshot('s2', { s1: session('s1'), s2: session('s2') }))
    harness.set(snapshot('s1', { s1: session('s1'), s2: session('s2') }))
    expect(controller.store.getSnapshot()).toEqual(['s2', 's1'])
    controller.dispose()
    expect(harness.listenerCount()).toBe(0)
    expect(browser.listenerCount(OPENED_SESSIONS_EVENT)).toBe(0)
    expect(browser.listenerCount('storage')).toBe(0)
  })

  it('does not collect delegated sessions and never prunes a pending catalog', () => {
    const browser = browserStorage()
    browser.store.set(OPENED_SESSIONS_KEY, JSON.stringify(['keep', 'missing']))
    const child = session('child', { origin: 'subagent', parentId: 'parent' })
    const harness = sourceHarness(snapshot('child', { child, keep: session('keep') }, 'pending'))
    const controller = createOpenedSessionController(harness.source)
    expect(controller.store.getSnapshot()).toEqual(['keep', 'missing'])

    harness.set(snapshot(undefined, { keep: session('keep') }, 'pending'))
    expect(controller.store.getSnapshot()).toEqual(['keep', 'missing'])

    harness.set(snapshot(undefined, { keep: session('keep') }, 'ready'))
    expect(controller.store.getSnapshot()).toEqual(['keep'])
    controller.dispose()
  })

  it('prunes stale shortcuts from an explicitly ready empty catalog', () => {
    const browser = browserStorage()
    browser.store.set(OPENED_SESSIONS_KEY, JSON.stringify(['stale']))
    const harness = sourceHarness(snapshot(undefined, {}, 'ready'))
    const controller = createOpenedSessionController(harness.source)
    expect(controller.store.getSnapshot()).toEqual([])
    controller.dispose()
  })

  it('syncs same-tab and cross-tab shortcut lists without coupling them to DSH mutations', () => {
    const browser = browserStorage()
    const harness = sourceHarness(snapshot(undefined, { keep: session('keep') }))
    const controller = createOpenedSessionController(harness.source)

    browser.dispatch(new CustomEvent(OPENED_SESSIONS_EVENT, { detail: ['same-tab'] }))
    expect(controller.store.getSnapshot()).toEqual(['same-tab'])

    const event = new Event('storage')
    Object.defineProperties(event, {
      key: { value: OPENED_SESSIONS_KEY },
      newValue: { value: JSON.stringify(['other-tab']) },
    })
    browser.dispatch(event)
    expect(controller.store.getSnapshot()).toEqual(['other-tab'])
    controller.dispose()
  })

  it('preserves consecutive edits over readable stale storage after rejected writes, then recovers', () => {
    const options = { refuseWrites: false }
    const browser = browserStorage(options)
    browser.store.set(OPENED_SESSIONS_KEY, JSON.stringify(['a']))
    const rows = { a: session('a'), b: session('b'), c: session('c') }
    const harness = sourceHarness(snapshot('a', rows))
    const controller = createOpenedSessionController(harness.source)
    options.refuseWrites = true
    harness.set(snapshot('b', rows))
    harness.set(snapshot('c', rows))
    expect(controller.store.getSnapshot()).toEqual(['a', 'b', 'c'])
    controller.store.remove('b')
    expect(controller.store.getSnapshot()).toEqual(['a', 'c'])
    expect(JSON.parse(browser.store.get(OPENED_SESSIONS_KEY)!)).toEqual(['a'])
    options.refuseWrites = false
    controller.store.remove('a')
    expect(controller.store.getSnapshot()).toEqual(['c'])
    expect(JSON.parse(browser.store.get(OPENED_SESSIONS_KEY)!)).toEqual(['c'])
    controller.dispose()
  })

  it('keeps local changes usable when browser storage refuses writes', () => {
    browserStorage({ refuseWrites: true })
    const harness = sourceHarness(snapshot('draft', { draft: session('draft', { blank: true }) }))
    const controller = createOpenedSessionController(harness.source)
    expect(controller.store.getSnapshot()).toEqual(['draft'])
    controller.store.remove('draft')
    expect(controller.store.getSnapshot()).toEqual([])
    controller.dispose()
  })
})
