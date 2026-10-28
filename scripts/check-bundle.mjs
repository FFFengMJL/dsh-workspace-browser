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

const source = await readFile(join(packageRoot, 'lib/client.js'), 'utf8')
let definition
vm.runInNewContext(source, {
  window: {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  },
})

assert.equal(definition?.id, 'dsh-workspace-browser', `${label} registers under an unexpected module id`)
const plugin = definition.factory(createRequire(import.meta.url))
assert.equal(typeof plugin.apply, 'function', `${label} does not export apply()`)
assert.deepEqual([...plugin.inject], ['slots', 'sessions', 'workspaces', 'remote', 'uiWorkspace', 'layout'])

// The host entry is an ordinary ESM module; DSH imports it before any client
// code runs. It must stay importable and side-effect free.
const host = await import(pathToFileURL(join(packageRoot, 'lib/index.js')).href)
assert.equal(typeof host.apply, 'function', `${label} host entry does not export apply()`)
host.apply()

/** Fake Cordis context: records slot registrations instead of rendering them. */
const registrations = []
const runtime = {
  workspaces: {
    list: { getSnapshot: () => ({ items: [] }), subscribe: () => () => {} },
    insertBefore: async () => {},
  },
  sessions: {
    list: { getSnapshot: () => ({ ids: [], byId: {} }), subscribe: () => () => {} },
  },
  uiWorkspace: {},
  layout: {},
  remote: {
    // Mirrors the remote shape: business refusals arrive as `ok: false`.
    session: { rename: async () => ({ ok: false, error: { code: 'session/rename-denied', message: 'denied' } }) },
  },
  slots: {
    inject(name, factory) {
      registrations.push({ name, factory })
    },
    register(options, component) {
      return { options, component }
    },
  },
}

plugin.apply(runtime)
assert.deepEqual(registrations.map(({ name }) => name), ['sidebar.panellist', 'main'])

const sidebar = registrations[0].factory()
assert.equal(sidebar.options.id, 'dsh-workspace-browser')
assert.equal(sidebar.options.label, '工作区浏览器')

const main = registrations[1].factory()
assert.equal(main.options.key, 'dsh-workspace-browser')
assert.equal(typeof main.options.inject, 'function')
assert.equal(typeof main.component, 'function')

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
await assert.rejects(() => services.renameSession('session-1', 'title'), /denied/)

console.log(`Client module loader bundle smoke test passed (${label}).`)
