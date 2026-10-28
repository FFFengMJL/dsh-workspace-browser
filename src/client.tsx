/**
 * Client half of the workspace browser plugin.
 *
 * This module is the only place that knows about Cordis: it declares the
 * services the panel needs, registers the sidebar entry plus the keyed `main`
 * view, and installs the optional compact replacement for the native tree.
 * Rendering lives in `ui/`, pure data rules in `logic.ts`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { PANEL_ID, PANEL_TITLE } from './panel.js'
import { WorkspaceBrowser } from './ui/WorkspaceBrowser.js'
import { PanelIcon } from './ui/icons.js'
import { createBrowserServices, type PluginRuntime } from './ui/runtime.js'
import { installSidebarEntry } from './ui/sidebar.js'

/**
 * Cordis services this plugin reads. `inject` is validated at boot: removing an
 * entry makes the panel fail to activate with "cannot get property ... without
 * inject", so it must stay in sync with what `ui/runtime.ts` touches (and with
 * what the compact sidebar entry reads).
 */
export const inject: string[] = ['slots', 'sessions', 'workspaces', 'remote', 'uiWorkspace', 'uiSession', 'layout']

export function apply(ctx: Context): void {
  // Cordis types this plugin's own services; the DSH client services arrive
  // through `inject` at runtime. This is the single place where that dynamic
  // surface is narrowed, so views stay fully typed.
  const runtime = ctx as unknown as PluginRuntime

  runtime.slots.inject('sidebar.panellist', () => runtime.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 30,
    label: PANEL_TITLE,
  }, PanelIcon))

  runtime.slots.inject('main', () => runtime.slots.register({
    name: 'main',
    key: PANEL_ID,
    // Built lazily: touching the remote transport is deferred until the panel
    // is actually mounted, so plugin load cannot fail on a not-ready service.
    inject: () => createBrowserServices(runtime),
  }, WorkspaceBrowser))

  // Optional and default-off: the shadow only exists while the preference is
  // on, and disposing it restores the native sidebar entry.
  installSidebarEntry(runtime)
}
