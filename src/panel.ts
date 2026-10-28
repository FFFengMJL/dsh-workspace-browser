/**
 * Identity shared by the sidebar entry and the keyed `main` view.
 *
 * Kept in its own module so the compact sidebar entry can select the panel
 * without importing the Cordis entry (which would make the two modules
 * circular).
 */
export const PANEL_ID: string = 'dsh-workspace-browser'
export const PANEL_TITLE: string = '工作区浏览器'
