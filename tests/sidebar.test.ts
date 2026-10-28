/**
 * Lifecycle tests for the optional compact sidebar entry.
 *
 * The controller is the only piece of the plugin that registers and disposes a
 * slot outside the panel lifecycle. These cases pin the rules that keep it
 * safe: default off, one registration while on, re-registration after a
 * toggle, and a warning instead of a crash when the cell is already occupied.
 */
import { describe, expect, it, vi } from 'vitest'
import { defaultBrowserPreferences, type BrowserPreferences } from '../src/logic.js'
import { consumeAddWorkspaceIntent, onAddWorkspaceRequest, requestAddWorkspace } from '../src/ui/intents.js'
import { createSidebarController, type SidebarControllerDeps } from '../src/ui/sidebar.js'

interface Harness {
  readonly controller: () => void
  readonly registrations: Array<{ options: Record<string, unknown>; disposed: boolean }>
  readonly listeners: Set<(preferences: BrowserPreferences) => void>
  emit(preferences: BrowserPreferences): void
}

function harness(options: {
  simplifySidebar: boolean
  register?: SidebarControllerDeps['slots']['register']
  readPreferences?: () => BrowserPreferences
  writePreferences?: (patch: Partial<BrowserPreferences>) => void
}): Harness {
  let current: BrowserPreferences = { ...defaultBrowserPreferences(), simplifySidebar: options.simplifySidebar }
  const registrations: Harness['registrations'] = []
  const listeners = new Set<(preferences: BrowserPreferences) => void>()
  const register: SidebarControllerDeps['slots']['register'] = options.register ?? ((registrationOptions) => {
    const entry = { options: registrationOptions, disposed: false }
    registrations.push(entry)
    return () => { entry.disposed = true }
  })
  const slots: SidebarControllerDeps['slots'] = { inject: () => {}, register }
  const controller = createSidebarController({
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

describe('compact sidebar controller', () => {
  it('leaves the native tree alone while the preference is off', () => {
    const state = harness({ simplifySidebar: false })
    expect(state.registrations).toHaveLength(0)
    state.controller()
    expect(state.listeners.size).toBe(0)
  })

  it('registers once while on and swaps the entry as the preference toggles', () => {
    const state = harness({ simplifySidebar: true })
    expect(state.registrations).toHaveLength(1)
    expect(state.registrations[0].options).toEqual({ name: 'sidebar.workspaces', priority: -100 })

    state.emit({ ...defaultBrowserPreferences(), simplifySidebar: false })
    expect(state.registrations[0].disposed).toBe(true)

    state.emit({ ...defaultBrowserPreferences(), simplifySidebar: true })
    expect(state.registrations).toHaveLength(2)
    expect(state.registrations[1].disposed).toBe(false)

    state.controller()
    expect(state.registrations[1].disposed).toBe(true)
    expect(state.listeners.size).toBe(0)
  })

  it('keeps the native tree when the cell is already occupied', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const writePreferences = vi.fn()
    const state = harness({
      simplifySidebar: true,
      writePreferences,
      register: () => { throw new Error('slot "sidebar.workspaces" already has an entry at priority -100') },
    })
    expect(state.registrations).toHaveLength(0)
    expect(warn).toHaveBeenCalledOnce()
    // The toggle cannot stay checked while the native tree is still rendered.
    expect(writePreferences).toHaveBeenCalledWith({ simplifySidebar: false })
    // A later toggle retries instead of leaving a half-registered entry.
    state.emit({ ...defaultBrowserPreferences(), simplifySidebar: true })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(writePreferences).toHaveBeenCalledTimes(2)
    state.controller()
    warn.mockRestore()
  })

  it('uses the event payload when storage cannot be re-read', () => {
    // Memory-only mode: the reader always reports the old value, so only the
    // published preferences can turn the shadow off.
    const state = harness({
      simplifySidebar: true,
      readPreferences: () => ({ ...defaultBrowserPreferences(), simplifySidebar: true }),
    })
    state.emit({ ...defaultBrowserPreferences(), simplifySidebar: false })
    expect(state.registrations[0].disposed).toBe(true)
    state.controller()
  })
})

describe('add-workspace intent', () => {
  it('holds a request that arrives before the panel can listen', () => {
    requestAddWorkspace()
    const listener = vi.fn()
    const unsubscribe = onAddWorkspaceRequest(listener)
    expect(listener).not.toHaveBeenCalled()
    expect(consumeAddWorkspaceIntent()).toBe(true)
    expect(consumeAddWorkspaceIntent()).toBe(false)
    unsubscribe()
  })

  it('delivers to a mounted panel and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = onAddWorkspaceRequest(listener)
    requestAddWorkspace()
    expect(listener).toHaveBeenCalledOnce()
    // A delivered request is not also kept pending.
    expect(consumeAddWorkspaceIntent()).toBe(false)
    unsubscribe()
    requestAddWorkspace()
    expect(listener).toHaveBeenCalledOnce()
    expect(consumeAddWorkspaceIntent()).toBe(true)
  })
})
