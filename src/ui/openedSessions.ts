/**
 * Browser-local, plugin-owned navigation shortcuts for sessions actually entered.
 * Stores opaque session ids only; all displayed metadata comes from Host snapshots.
 */
import {
  OPENED_SESSIONS_KEY,
  appendOpenedSession,
  parseOpenedSessionIds,
  removeOpenedSession,
} from '../logic.js'
import { readSessionSelection, type SessionCatalogSnapshot, type Source } from './runtime.js'

export const OPENED_SESSIONS_EVENT = 'dsh-workspace-browser:opened-sessions-changed'

export interface OpenedSessionStore {
  getSnapshot(): readonly string[]
  subscribe(listener: () => void): () => void
  remove(id: string): void
}

function getStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function readStored(storage: Storage | undefined): string[] | undefined {
  if (!storage) return undefined
  try {
    const value = storage.getItem(OPENED_SESSIONS_KEY)
    return value === null ? undefined : parseOpenedSessionIds(value)
  } catch {
    return undefined
  }
}

/** Owns persistence and the session-catalog entry observer for plugin lifetime. */
export function createOpenedSessionController(source: Source<SessionCatalogSnapshot>): {
  store: OpenedSessionStore
  dispose(): void
} {
  const listeners = new Set<() => void>()
  let storage = getStorage()
  let ids = readStored(storage) ?? []
  let memoryOnly = false
  let observed = false
  let observedCurrent: string | undefined

  const publish = (next: string[]) => {
    if (next.length === ids.length && next.every((id, index) => id === ids[index])) return
    ids = next
    for (const listener of listeners) listener()
  }

  const external = (next: string[]) => publish(next)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== OPENED_SESSIONS_KEY) return
    external(event.key === null ? [] : parseOpenedSessionIds(event.newValue))
  }
  const onLocal = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail
    if (Array.isArray(detail)) external(parseOpenedSessionIds(JSON.stringify(detail)))
  }

  const write = (next: string[]) => {
    storage = getStorage()
    let persisted = false
    try {
      storage?.setItem(OPENED_SESSIONS_KEY, JSON.stringify(next))
      persisted = storage !== undefined
    } catch {
      // The in-memory list remains usable when storage is denied or full.
    }
    memoryOnly = !persisted
    publish(next)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<string[]>(OPENED_SESSIONS_EVENT, { detail: next }))
    }
    return persisted
  }

  const update = (transform: (latest: readonly string[]) => string[]) => {
    storage = getStorage()
    // A readable old value is not authoritative after a rejected write.
    // Keep composing local edits in memory until persistence succeeds again.
    const latest = memoryOnly ? ids : readStored(storage) ?? ids
    const next = transform(latest)
    if (next.length === latest.length && next.every((id, index) => id === latest[index])) return
    write(next)
  }

  const onCatalog = () => {
    const snapshot = source.getSnapshot()
    const catalogIds = snapshot.ids
    const byId = snapshot.byId
    if (!catalogIds || !byId || snapshot.phase !== 'ready') return
    if (!catalogIds.every((id) => byId[id] !== undefined)) return

    // The Host's ready baseline and complete id-to-row mapping can prove that
    // stored shortcuts have disappeared, even when the catalog is empty.
    const catalog = new Set(catalogIds)
    update((latest) => latest.filter((id) => catalog.has(id)))

    // Selection remains unknown for an empty/incomplete retention snapshot.
    const selection = readSessionSelection(catalogIds, byId)
    if (!selection.known) return

    const current = selection.currentSessionId
    if (!observed || current !== observedCurrent) {
      observed = true
      observedCurrent = current
      if (current && byId[current]?.origin !== 'subagent') {
        update((latest) => appendOpenedSession(latest, current))
      }
    }
  }

  const store: OpenedSessionStore = {
    getSnapshot: () => ids,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    remove(id) {
      // Collection occurs only on a confirmed selection transition, so the
      // same currently selected id will not be re-added by catalog refreshes.
      update((latest) => removeOpenedSession(latest, id))
    },
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    window.addEventListener(OPENED_SESSIONS_EVENT, onLocal)
  }
  const unsubscribe = source.subscribe(onCatalog)
  onCatalog()

  return {
    store,
    dispose() {
      unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
        window.removeEventListener(OPENED_SESSIONS_EVENT, onLocal)
      }
      listeners.clear()
    },
  }
}
