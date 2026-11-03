/**
 * Lifecycle tests for the searchable native workspace picker.
 *
 * The replacement is a shadow at a lower priority than the native picker. It
 * must stay absent by default, register exactly once while enabled, and dispose
 * cleanly so the native menu returns. It must also never declare a child slot:
 * the native picker already owns `conversation.hero.workspace.directoryFlow`,
 * and a second declaration throws.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultBrowserPreferences, type BrowserPreferences } from '../src/logic.js'
import {
  createWorkspacePickerController,
  type WorkspacePickerControllerDeps,
} from '../src/ui/workspacePicker.js'

interface Harness {
  readonly controller: () => void
  readonly registrations: Array<{ options: Record<string, unknown>; disposed: boolean }>
  readonly listeners: Set<(preferences: BrowserPreferences) => void>
  emit(preferences: BrowserPreferences): void
}

function harness(options: {
  enhanceWorkspacePicker: boolean
  register?: WorkspacePickerControllerDeps['slots']['register']
  readPreferences?: () => BrowserPreferences
  writePreferences?: (patch: Partial<BrowserPreferences>) => void
}): Harness {
  let current: BrowserPreferences = {
    ...defaultBrowserPreferences(),
    enhanceWorkspacePicker: options.enhanceWorkspacePicker,
  }
  const registrations: Harness['registrations'] = []
  const listeners = new Set<(preferences: BrowserPreferences) => void>()
  const register: WorkspacePickerControllerDeps['slots']['register'] = options.register ?? ((registrationOptions) => {
    const entry = { options: registrationOptions, disposed: false }
    registrations.push(entry)
    return () => { entry.disposed = true }
  })
  const slots: WorkspacePickerControllerDeps['slots'] = { inject: () => {}, register }
  const controller = createWorkspacePickerController({
    slots,
    readPreferences: options.readPreferences ?? (() => current),
    writePreferences: options.writePreferences,
    subscribePreferences: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    component: () => null,
  })
  return {
    controller,
    registrations,
    listeners,
    emit: (preferences) => {
      current = preferences
      for (const listener of [...listeners]) listener(preferences)
    },
  }
}

describe('workspace picker controller', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves the native picker alone while the preference is off', () => {
    const state = harness({ enhanceWorkspacePicker: false })
    expect(state.registrations).toHaveLength(0)
    state.controller()
    expect(state.listeners.size).toBe(0)
  })

  it('registers once at the shadow priority and swaps as the preference toggles', () => {
    const state = harness({ enhanceWorkspacePicker: false })
    state.emit({ ...defaultBrowserPreferences(), enhanceWorkspacePicker: true })
    expect(state.registrations).toHaveLength(1)
    expect(state.registrations[0].options).toEqual({
      name: 'conversation.hero.workspace',
      priority: -100,
    })
    // A second enabled event must not stack another occupant at the same
    // priority (the registry would reject it).
    state.emit({ ...defaultBrowserPreferences(), enhanceWorkspacePicker: true })
    expect(state.registrations).toHaveLength(1)

    state.emit({ ...defaultBrowserPreferences(), enhanceWorkspacePicker: false })
    expect(state.registrations[0].disposed).toBe(true)
    expect(state.registrations).toHaveLength(1)
    state.controller()
  })

  it('does not declare the native directory-flow child slot', () => {
    const state = harness({ enhanceWorkspacePicker: true })
    expect(state.registrations).toHaveLength(1)
    expect(state.registrations[0].options.children).toBeUndefined()
    state.controller()
  })

  it('corrects the preference when the cell is already occupied', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const written: Array<Partial<BrowserPreferences>> = []
    const state = harness({
      enhanceWorkspacePicker: true,
      register: () => { throw new Error('single slot already has a registration') },
      writePreferences: (patch) => { written.push(patch) },
    })
    expect(state.registrations).toHaveLength(0)
    expect(written).toEqual([{ enhanceWorkspacePicker: false }])
    expect(warn).toHaveBeenCalled()
    state.controller()
  })

  it('uses the event payload instead of re-reading storage', () => {
    let reads = 0
    const state = harness({
      enhanceWorkspacePicker: false,
      // The initial controller sync reads once; later reads would fail. The
      // event must carry the new value, not force another storage read.
      readPreferences: () => {
        if (reads++ > 0) throw new Error('storage unavailable')
        return defaultBrowserPreferences()
      },
    })
    state.emit({ ...defaultBrowserPreferences(), enhanceWorkspacePicker: true })
    expect(state.registrations).toHaveLength(1)
    state.controller()
  })

  it('disposes the registration and subscription together', () => {
    const state = harness({ enhanceWorkspacePicker: true })
    expect(state.listeners.size).toBe(1)
    state.controller()
    expect(state.registrations[0].disposed).toBe(true)
    expect(state.listeners.size).toBe(0)
  })
})
