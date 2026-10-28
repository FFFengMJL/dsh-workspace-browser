/**
 * Client half of the workspace browser plugin.
 *
 * This module is the only place that knows about Cordis: it declares the
 * services the panel needs, registers the sidebar entry plus the keyed `main`
 * view, and narrows the runtime context to the port consumed by the view.
 * Rendering lives in `ui/`, pure data rules in `logic.ts`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { WorkspaceBrowser } from './ui/WorkspaceBrowser.js'
import { createBrowserServices, type PluginRuntime } from './ui/runtime.js'

/** Stable key shared by the sidebar entry id and the keyed `main` view. */
const PANEL_ID = 'dsh-workspace-browser'
const PANEL_TITLE = '工作区浏览器'

/**
 * Cordis services this plugin reads. `inject` is validated at boot: removing an
 * entry makes the panel fail to activate with "cannot get property ... without
 * inject", so it must stay in sync with what `ui/runtime.ts` touches.
 */
export const inject: string[] = ['slots', 'sessions', 'workspaces', 'remote', 'uiWorkspace', 'layout']

/** Sidebar glyph: four panes, mirroring the workspace grid. */
function PanelIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
  </svg>
}

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
}
