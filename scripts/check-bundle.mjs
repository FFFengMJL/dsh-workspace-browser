/**
 * Loader smoke test.
 *
 * DSH loads the client half through its own module loader, not through a plain
 * ESM import, so a successful build is not enough. This script replays that
 * loader contract against a built package and asserts the plugin still declares
 * exactly the services the panel injects. A missing `inject` entry is what made
 * the panel fail to activate ("cannot get property ... without inject"), so the
 * contract is checked here instead of only in a live browser.
 *
 * It also exercises the two registrations that are installed outside the
 * panel: the sidebar icon row (always) and the optional compact replacement
 * for the native tree (only while its preference is on). Both read browser
 * state, so the sandbox supplies a minimal `window` with storage and events.
 *
 * Usage: node scripts/check-bundle.mjs [package-root]
 *
 * `package-root` defaults to the working directory. `scripts/check-package.mjs`
 * passes an unpacked tarball, so this contract is verified on what users
 * actually install rather than only on the local build directory.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const packageRoot = resolve(process.argv[2] ?? '.')
const label = `package at ${packageRoot}`

for (const file of ['lib/client.js', 'lib/client.d.ts', 'lib/index.js', 'lib/index.d.ts']) {
  assert.ok(existsSync(join(packageRoot, file)), `${label} is missing ${file}; run \`pnpm build\` first`)
}

/**
 * Browser surface the plugin touches at load: plugin-owned preference storage
 * plus the event pair used for same-tab and cross-tab synchronisation.
 */
const storedPreferences = new Map()
const windowListeners = new Map()
const browserWindow = {
  __ModuleLoader__: {
    load(value) {
      definition = value
    },
  },
  localStorage: {
    getItem: (key) => storedPreferences.get(key) ?? null,
    setItem: (key, value) => { storedPreferences.set(key, String(value)) },
  },
  addEventListener(type, listener) {
    const bucket = windowListeners.get(type) ?? new Set()
    bucket.add(listener)
    windowListeners.set(type, bucket)
  },
  removeEventListener(type, listener) {
    windowListeners.get(type)?.delete(listener)
  },
  dispatchEvent(event) {
    for (const listener of [...(windowListeners.get(event.type) ?? [])]) listener(event)
    return true
  },
}

const source = await readFile(join(packageRoot, 'lib/client.js'), 'utf8')
let definition
vm.runInNewContext(source, { window: browserWindow })

assert.equal(definition?.id, 'dsh-workspace-browser', `${label} registers under an unexpected module id`)
const plugin = definition.factory(createRequire(import.meta.url))
assert.equal(typeof plugin.apply, 'function', `${label} does not export apply()`)
assert.deepEqual([...plugin.inject], ['slots', 'sessions', 'workspaces', 'remote', 'uiWorkspace', 'uiSession', 'layout'])

// The host entry is an ordinary ESM module; DSH imports it before any client
// code runs. It must stay importable and side-effect free.
const host = await import(pathToFileURL(join(packageRoot, 'lib/index.js')).href)
assert.equal(typeof host.apply, 'function', `${label} host entry does not export apply()`)
host.apply()

/** Fake Cordis context: records slot registrations instead of rendering them. */
const registrations = []
const entries = []
const runtime = {
  workspaces: {
    list: { getSnapshot: () => ({ items: [] }), subscribe: () => () => {} },
    insertBefore: async () => {},
    create: async ({ path }) => ({ workspaceId: 'w1', title: 'demo', path, sessionIds: [] }),
    rename: async () => ({}),
    delete: async () => {},
  },
  sessions: {
    list: { getSnapshot: () => ({ ids: [], byId: {} }), subscribe: () => () => {} },
  },
  uiWorkspace: {
    pickDirectory: async () => '/srv/picked',
    openSession() {},
    startSession() {},
    archiveSession: async () => {},
    unarchiveSession: async () => {},
    pinSession: async () => {},
    unpinSession: async () => {},
    forkSession: async () => 'child',
    listDirectory: async (path) => ({
      path: path ?? '/home',
      home: '/home',
      crumbs: [],
      entries: [],
      truncated: false,
    }),
  },
  uiSession: { sessionStatus: { getSnapshot: () => new Map(), subscribe: () => () => {} } },
  layout: { panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} }, selectPanel() {} },
  remote: {
    // Mirrors the remote shape: business refusals arrive as `ok: false`.
    session: { rename: async () => ({ ok: false, error: { code: 'session/rename-denied', message: 'denied' } }) },
  },
  slots: {
    inject(name, factory) {
      registrations.push({ name, factory })
    },
    register(options, component) {
      const entry = { options, component, disposed: false }
      entries.push(entry)
      return () => { entry.disposed = true }
    },
  },
}

plugin.apply(runtime)
assert.deepEqual(registrations.map(({ name }) => name), ['sidebar.panellist', 'main', 'sidebar.workspaces'])

// Invoke the panel factories exactly as a slot declaration would.
registrations[0].factory()
registrations[1].factory()
const sidebar = entries.find(({ options }) => options.name === 'sidebar.panellist')
assert.equal(sidebar.options.id, 'dsh-workspace-browser')
assert.equal(sidebar.options.label, '工作区浏览器')

const main = entries.find(({ options }) => options.name === 'main')
assert.equal(main.options.key, 'dsh-workspace-browser')
assert.equal(typeof main.options.inject, 'function')
assert.equal(typeof main.component, 'function')

// The compact sidebar entry is installed at load, before any panel mounts.
// With default preferences it must leave DSH's native tree alone.
const workspacesSlot = registrations.find(({ name }) => name === 'sidebar.workspaces')
const disposeController = workspacesSlot.factory()
assert.equal(typeof disposeController, 'function')
const shadowEntries = () => entries.filter(({ options }) => options.name === 'sidebar.workspaces')
assert.equal(shadowEntries().length, 0, 'default preferences must not shadow the native tree')

// Turn the preference on through the same published event the settings
// toggle uses, then check the lowest-priority shadow registration.
const key = 'dsh-workspace-browser.preferences.v1'
const enabled = { schemaVersion: 1, simplifySidebar: true }
storedPreferences.set(key, JSON.stringify(enabled))
browserWindow.dispatchEvent(new CustomEvent('dsh-workspace-browser:preferences-changed', { detail: enabled }))
assert.equal(shadowEntries().length, 1)
assert.equal(shadowEntries()[0].options.priority, -100)
assert.equal(typeof shadowEntries()[0].component, 'function')

// Turning it off disposes exactly that entry, which re-exposes the native row.
browserWindow.dispatchEvent(new CustomEvent('dsh-workspace-browser:preferences-changed', {
  detail: { schemaVersion: 1, simplifySidebar: false },
}))
assert.equal(shadowEntries()[0].disposed, true)

// The panel receives a port rather than the raw context, so a renamed service
// path fails here instead of at the first user click.
const services = main.options.inject()
assert.deepEqual(Object.keys(services).sort(), [
  'renameSession',
  'sessions',
  'uiWorkspace',
  'workspaceController',
  'workspaces',
])
assert.equal(services.workspaces, runtime.workspaces.list)
assert.equal(typeof services.workspaceController.create, 'function')
await assert.rejects(() => services.renameSession('session-1', 'title'), /denied/)

const created = await services.workspaceController.create('/srv/app')
assert.equal(created.workspaceId, 'w1')
assert.equal(created.path, '/srv/app')
const pickedPath = await services.uiWorkspace.pickDirectory()
assert.equal(pickedPath, '/srv/picked')
const listing = await services.uiWorkspace.listDirectory('/srv', new AbortController().signal)
assert.equal(listing.path, '/srv')

// The controller disposer must release the preference subscription too.
disposeController()
assert.equal(windowListeners.get('storage')?.size ?? 0, 0)
assert.equal(windowListeners.get('dsh-workspace-browser:preferences-changed')?.size ?? 0, 0)

console.log(`Client module loader bundle smoke test passed (${label}).`)
