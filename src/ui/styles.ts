/**
 * Stylesheet injected by the panel.
 *
 * Kept as one readable string instead of a second bundled CSS asset: the plugin
 * ships through the DSH client loader, and a `<style>` element avoids depending
 * on the host's asset pipeline.
 *
 * Layout rule worth preserving: every top-level block sits on the shared
 * `.wb-container` rail (`.wb-container`). The original layout let the plain
 * workspace grid span the full panel while the header, tree groups and session
 * lists were capped at 1200px, which is what made the three grouping modes look
 * misaligned.
 *
 * The visual system uses one compact set of tokens; density is not user-selectable.
 */
export const styles: string = `
/* ---- Tokens ------------------------------------------------------------ */
.wb-root {
  --wb-border: color-mix(in srgb, currentColor 13%, transparent);
  --wb-muted: color-mix(in srgb, currentColor 60%, transparent);
  --wb-surface: color-mix(in srgb, currentColor 4%, transparent);
  --wb-accent: #4d6bfe;
  --wb-danger: #b42318;

  --wb-card-padding: 12px;
  --wb-card-gap: 8px;
  --wb-grid-min: 258px;
  --wb-card-title: 14px;
  --wb-row-padding: 9px;
  --wb-control-gap: 5px;
  --wb-control-padding: 4px 8px;

  box-sizing: border-box;
  min-height: 100%;
  padding: clamp(20px, 4vw, 52px);
  color: var(--dsh-foreground, currentColor);
  font: inherit;
  overflow: auto;
}
.wb-root * { box-sizing: border-box; }

/* ---- Shared width rail ------------------------------------------------ */
.wb-container {
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
}
.wb-section { margin-block: 0 26px; }

/* ---- Header ----------------------------------------------------------- */
.wb-header { margin-bottom: 26px; container-type: inline-size; container-name: wb-header; }
.wb-title-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  min-height: 64px;
}
.wb-title { min-width: 0; }
.wb-title-row h1 {
  margin: 2px 0 0;
  font-size: clamp(24px, 3vw, 34px);
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}
.wb-eyebrow {
  margin: 0;
  color: var(--wb-muted);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.wb-path, .wb-boundary { color: var(--wb-muted); font-size: 13px; }
.wb-path { margin: 4px 0 0; overflow-wrap: anywhere; }
.wb-boundary { margin: 12px 0 0; }

.wb-back, .wb-primary, .wb-secondary, .wb-more {
  border: 1px solid var(--wb-border);
  border-radius: 10px;
  background: var(--wb-surface);
  color: inherit;
  padding: 9px 12px;
  font: inherit;
  cursor: pointer;
}
.wb-primary {
  margin-left: auto;
  background: var(--wb-accent);
  color: white;
  border-color: transparent;
  font-weight: 600;
}
.wb-secondary, .wb-more { display: block; margin: 14px auto; }
.wb-danger { background: var(--wb-danger); color: white; border-color: transparent; }

/* ---- Toolbar, filters, and plugin settings ---------------------------- */
.wb-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
}
.wb-toolbar label, .wb-filter-grid > label:not(.wb-toggle) {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: var(--wb-muted);
  font-size: 12px;
}
.wb-toolbar select, .wb-filter-grid select, .wb-search input, .wb-field input {
  min-height: 38px;
  border: 1px solid var(--wb-border);
  border-radius: 9px;
  background: var(--wb-surface);
  color: inherit;
  padding: 0 10px;
  font: inherit;
}
.wb-sort select { min-width: 120px; }
.wb-search { position: relative; min-width: 0; }
.wb-search span { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 20px; pointer-events: none; }
.wb-search input { width: 100%; padding-left: 38px; }
.wb-toolbar-button, .wb-settings-toggle, .wb-reset-filters {
  min-height: 38px;
  padding: 0 11px;
  border: 1px solid var(--wb-border);
  border-radius: 9px;
  background: var(--wb-surface);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  white-space: nowrap;
  cursor: pointer;
}
.wb-filter-panel, .wb-settings-panel {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--wb-border);
  border-radius: 10px;
  background: var(--wb-surface);
}
.wb-filter-panel[hidden], .wb-settings-panel[hidden] { display: none; }
.wb-active-filters {
  margin: 6px 0 0;
  color: var(--wb-muted);
  font-size: 11.5px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.wb-filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  align-items: center;
  gap: 10px 14px;
}
.wb-filter-grid > label:not(.wb-toggle) { justify-content: space-between; }
.wb-filter-grid select { flex: 1; min-width: 0; }
.wb-toggle { display: flex; align-items: center; gap: 8px; min-height: 32px; user-select: none; }
.wb-toggle input { flex: 0 0 auto; accent-color: var(--wb-accent); width: 15px; height: 15px; }
.wb-reset-filters { justify-self: start; min-height: 32px; }
.wb-settings-row { margin-top: 7px; }
.wb-settings-toggle { min-height: 30px; padding-inline: 8px; border-color: transparent; background: transparent; color: var(--wb-muted); }
.wb-settings-panel .wb-boundary { margin: 8px 0 0; }
.wb-boundary { color: var(--wb-muted); font-size: 12px; line-height: 1.5; }

/* ---- Section headings ------------------------------------------------- */
.wb-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 20px 0 12px;
}
.wb-section-heading h2 { margin: 0; font-size: 18px; }
.wb-section-heading span, .wb-workspace-count { color: var(--wb-muted); font-size: 12px; }

/* ---- Workspace grid --------------------------------------------------- */
.wb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--wb-grid-min)), 1fr));
  gap: var(--wb-card-gap);
}
.wb-workspace {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--wb-border);
  border-radius: 14px;
  background: var(--wb-surface);
}
.wb-workspace-open {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  min-width: 0;
  padding: var(--wb-card-padding);
  border: 0;
  border-radius: 14px 14px 0 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.wb-workspace-title {
  font-weight: 650;
  font-size: var(--wb-card-title);
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.wb-workspace-path, .wb-session-meta {
  max-width: 100%;
  color: var(--wb-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-workspace-controls, .wb-session-actions {
  display: flex;
  gap: var(--wb-control-gap);
  padding: 0 var(--wb-card-padding) var(--wb-card-padding);
}
.wb-session-actions { flex-wrap: wrap; }
/* One row: pin, new session, more. The divider below the title keeps the
   card readable in a narrow grid cell. */
.wb-workspace-controls {
  position: relative;
  align-items: center;
  flex-wrap: nowrap;
  margin-top: auto;
  padding-top: 6px;
}
.wb-controls-spacer { flex: 1 1 auto; }
/* Direct children only: the overflow menu is a descendant and has its own
   borderless row styling. A bare button selector here gave every menu item a
   control border and overrode the danger colour. */
.wb-workspace-controls > button, .wb-session-actions > button {
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  padding: var(--wb-control-padding);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}
.wb-workspace-controls .wb-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  padding: 0;
}
.wb-workspace-controls .wb-icon-button[aria-pressed='true'] {
  color: var(--wb-accent);
  border-color: color-mix(in srgb, var(--wb-accent) 45%, transparent);
  background: color-mix(in srgb, var(--wb-accent) 10%, transparent);
}
.wb-workspace-controls .wb-card-session {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 30px;
  padding: 0 10px;
  white-space: nowrap;
}
/* Destructive workspace action: outlined like its neighbours, red on hover. */
.wb-workspace-controls .wb-danger-link { color: var(--wb-danger); border-color: color-mix(in srgb, var(--wb-danger) 35%, transparent); }
.wb-workspace-controls .wb-danger-link:hover:not([disabled]) { background: color-mix(in srgb, var(--wb-danger) 12%, transparent); }

/* ---- Workspace overflow menu ------------------------------------------ */
/* Opens upward from the card footer, so a card at the bottom of the grid
   never pushes the menu past the viewport edge. */
.wb-menu {
  position: absolute;
  right: var(--wb-card-padding);
  bottom: calc(100% - 2px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  min-width: 152px;
  max-width: min(232px, calc(100vw - 32px));
  padding: 4px;
  border: 1px solid var(--wb-border);
  border-radius: 10px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}
.wb-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}
.wb-menu-item svg { flex: 0 0 auto; }
.wb-menu-item:hover:not([disabled]) { background: color-mix(in srgb, currentColor 8%, transparent); }
.wb-menu-item[disabled] { opacity: 0.45; cursor: not-allowed; }
.wb-menu-danger { color: var(--wb-danger); }
.wb-menu-danger:hover:not([disabled]) { background: color-mix(in srgb, var(--wb-danger) 12%, transparent); }
.wb-menu-separator { height: 1px; margin: 4px 2px; background: var(--wb-border); }
.wb-menu-note {
  margin: 4px 8px;
  color: var(--wb-muted);
  font-size: 11px;
  line-height: 1.45;
}

/* ---- Workspace tree --------------------------------------------------- */
.wb-tree-group { margin: 0 0 22px; }
.wb-tree-heading {
  margin: 0 0 10px;
  color: var(--wb-muted);
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.wb-ungrouped { margin-top: 26px; }

/* ---- Sessions --------------------------------------------------------- */
.wb-session-list { display: grid; gap: 8px; }
.wb-session {
  display: flex;
  align-items: center;
  min-width: 0;
  border: 1px solid var(--wb-border);
  border-radius: 12px;
  background: var(--wb-surface);
  overflow: hidden;
}
.wb-session-open {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  padding: var(--wb-row-padding) 14px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.wb-session-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}
.wb-session-title {
  font-weight: 620;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.wb-session-title { font-size: 13.5px; }
.wb-session-actions { flex: 0 0 auto; padding: 0 10px 0 0; }
/* A provisional session is not history yet: dashed edge instead of a solid
   card, and the title reads lighter than a real conversation title. */
.wb-session-blank {
  border-style: dashed;
  background: transparent;
}
.wb-session-blank .wb-session-title { font-weight: 560; color: var(--wb-muted); }
.wb-badge {
  border-radius: 999px;
  border: 1px solid var(--wb-border);
  background: color-mix(in srgb, currentColor 8%, transparent);
  padding: 1px 6px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--wb-muted);
  white-space: nowrap;
}
.wb-badge-live { color: #3ecf8e; border-color: color-mix(in srgb, #3ecf8e 45%, transparent); }

/* ---- Feedback --------------------------------------------------------- */
.wb-empty {
  margin: 20px 0;
  padding: 20px;
  border: 1px dashed var(--wb-border);
  border-radius: 12px;
  color: var(--wb-muted);
}
.wb-hint { margin: 10px 0 0; color: var(--wb-muted); font-size: 12px; line-height: 1.6; }
.wb-notice {
  position: sticky;
  top: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--wb-accent) 35%, transparent);
  background: color-mix(in srgb, var(--wb-accent) 16%, Canvas);
}
.wb-notice button { border: 0; background: none; color: inherit; font-size: 13px; cursor: pointer; }
.wb-notice .wb-notice-close { font-size: 18px; line-height: 1; }
.wb-footer {
  margin-top: 40px;
  padding-top: 14px;
  border-top: 1px solid var(--wb-border);
  color: var(--wb-muted);
  font-size: 12px;
}

/* ---- Focus and disabled ---------------------------------------------- */
.wb-root button:focus-visible,
.wb-root input:focus-visible,
.wb-root select:focus-visible {
  outline: 2px solid var(--wb-accent);
  outline-offset: 2px;
}
.wb-root button:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---- Modals ----------------------------------------------------------- */
.wb-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.45);
}
.wb-modal {
  display: flex;
  flex-direction: column;
  width: min(460px, 100%);
  max-height: min(80vh, 720px);
  padding: 22px;
  border: 1px solid var(--wb-border);
  border-radius: 16px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.3);
  overflow: auto;
}
.wb-modal-wide { width: min(640px, 100%); }
.wb-modal h2 { margin: 0 0 8px; font-size: 18px; }
.wb-modal p { margin: 0 0 4px; color: var(--wb-muted); line-height: 1.55; }
/* A refusal stays inside the dialog so the typed draft is not lost. */
.wb-modal .wb-error { margin: 10px 0 0; color: var(--wb-danger); font-size: 13px; }
.wb-modal-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}
.wb-modal-footer button {
  padding: 8px 12px;
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.wb-modal-footer .wb-primary { margin-left: 0; }
.wb-field {
  display: grid;
  gap: 8px;
  margin-top: 14px;
  color: var(--wb-muted);
  font-size: 13px;
}
.wb-field input { width: 100%; }

/* ---- Add-workspace browse -------------------------------------------- */
.wb-browse-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.wb-secondary-inline {
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  background: var(--wb-surface);
  color: inherit;
  padding: 7px 10px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.wb-browse-path {
  min-width: 0;
  color: var(--wb-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.wb-browse {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--wb-border);
  border-radius: 10px;
}
.wb-browse-crumbs { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
.wb-browse-crumb {
  border: 0;
  background: none;
  color: var(--wb-accent);
  font: inherit;
  font-size: 12px;
  padding: 2px 4px;
  cursor: pointer;
}
.wb-browse-crumb + .wb-browse-crumb::before { content: '/'; margin-right: 4px; color: var(--wb-muted); }
.wb-browse-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  max-height: 220px;
  list-style: none;
  overflow: auto;
}
.wb-browse-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
}
.wb-browse-entry:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
.wb-browse-hidden { margin-left: auto; color: var(--wb-muted); font-size: 11px; }
.wb-browse-pick {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin-top: 8px;
  padding: 6px 9px;
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  background: var(--wb-surface);
  color: inherit;
  font: inherit;
  font-size: 12px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.wb-hidden-list {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  overflow: auto;
}
.wb-hidden-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--wb-border);
  border-radius: 10px;
}
.wb-hidden-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.wb-hidden-label input { accent-color: var(--wb-accent); }
.wb-hidden-title { font-weight: 600; white-space: nowrap; }
.wb-hidden-path {
  min-width: 0;
  color: var(--wb-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-hidden-row > button {
  flex: 0 0 auto;
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  padding: 5px 9px;
  font-size: 12px;
  cursor: pointer;
}

/* ---- Narrow screens --------------------------------------------------- */
@container wb-header (max-width: 700px) {
  .wb-toolbar { grid-template-columns: minmax(0, 1fr) auto; }
  .wb-search { grid-column: 1 / -1; }
  .wb-sort { grid-column: 1; }
  .wb-toolbar-button { grid-column: 2; justify-self: end; }
}
@container wb-header (max-width: 440px) {
  .wb-toolbar { grid-template-columns: minmax(0, 1fr); }
  .wb-search, .wb-sort, .wb-toolbar-button { grid-column: 1; }
  .wb-sort { justify-content: space-between; }
  .wb-toolbar-button { justify-self: stretch; }
  .wb-filter-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  .wb-root { padding: 18px 14px; }
  .wb-title-row { align-items: flex-start; }
  .wb-primary { margin-left: 0; }
  .wb-session { align-items: flex-start; flex-direction: column; }
  .wb-session-actions { padding: 0 12px 12px; }
  .wb-session-actions button { min-height: 36px; }
  .wb-hidden-path { display: none; }
}
`

/**
 * Styles for the compact sidebar entry.
 *
 * The entry is registered outside the panel, so it cannot rely on `.wb-root`
 * tokens; it reads only the Host theme's inherited color and Canvas tokens.
 * Geometry mirrors the native sidebar (rows at 2px inset, 36px high, 12px
 * radius, 14px labels) so the shortcut entry does not look like a different
 * product bolted onto the navigation column.
 */
export const sidebarStyles: string = `
.wb-sidebar-entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
  padding: 0 var(--dsh-sidebar-inline-padding, 12px) 0 0;
  box-sizing: border-box;
  color: inherit;
}
.wb-sidebar-entry * { box-sizing: border-box; }
.wb-sidebar-entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 36px;
  margin: 2px 0 4px;
  padding: 0 4px;
  color: color-mix(in srgb, currentColor 60%, transparent);
  font-size: 14px;
  font-weight: 400;
}
.wb-sidebar-entry-title { letter-spacing: 0; }
.wb-sidebar-entry-count { font-size: 12px; font-variant-numeric: tabular-nums; }
.wb-sidebar-entry-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  margin: 0 2px;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.wb-sidebar-entry-primary:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
.wb-sidebar-entry-primary.is-active {
  border-color: color-mix(in srgb, #4d6bfe 32%, transparent);
  background: color-mix(in srgb, #4d6bfe 12%, transparent);
  font-weight: 600;
}
.wb-sidebar-entry-actions { display: flex; flex-direction: column; gap: 2px; }
.wb-sidebar-entry-actions button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  margin: 0 2px;
  padding: 7px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.wb-sidebar-entry-actions button:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
.wb-sidebar-entry-restore { color: color-mix(in srgb, currentColor 65%, transparent); }
.wb-sidebar-entry-hint {
  margin: 4px 6px 0;
  color: color-mix(in srgb, currentColor 55%, transparent);
  font-size: 12px;
  line-height: 1.5;
}

/* ---- Entered session shortcuts --------------------------------------- */
.wb-sidebar-sessions {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(50vh, 440px);
  overflow: auto;
  overscroll-behavior: contain;
  margin: 10px 0 2px;
}
.wb-sidebar-sessions-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  padding: 0 6px;
  color: color-mix(in srgb, currentColor 60%, transparent);
  font-size: 12px;
}
.wb-sidebar-group { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wb-sidebar-group-title {
  margin: 8px 6px 2px;
  color: color-mix(in srgb, currentColor 55%, transparent);
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wb-sidebar-empty { margin: 4px 6px 8px; color: color-mix(in srgb, currentColor 55%, transparent); font-size: 12px; }
.wb-sidebar-session {
  display: flex;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
  min-height: 36px;
  margin: 0 2px;
  border: 0;
  border-radius: 10px;
  background: transparent;
}
.wb-sidebar-session:hover { background: color-mix(in srgb, currentColor 7%, transparent); }
.wb-sidebar-session.is-current { background: color-mix(in srgb, #4d6bfe 14%, transparent); }
.wb-sidebar-session-open, .wb-sidebar-session-remove {
  display: flex;
  align-items: center;
  min-width: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.wb-sidebar-session-open {
  flex: 1 1 auto;
  gap: 8px;
  padding: 6px 7px;
  text-align: left;
}
.wb-sidebar-session-open:disabled { opacity: .55; cursor: not-allowed; }
.wb-sidebar-session-status {
  display: inline-flex;
  flex: 0 0 16px;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  color: color-mix(in srgb, currentColor 55%, transparent);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.wb-sidebar-session-status.is-running { color: #1f9d69; }
.wb-sidebar-session-status.is-approval { color: #b36b00; }
.wb-sidebar-session-status.is-question { color: #a05cc5; }
.wb-sidebar-session-status.is-completed { color: #4d6bfe; }
.wb-sidebar-session-title {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.wb-sidebar-session-remove {
  flex: 0 0 30px;
  justify-content: center;
  margin: 3px;
  border-radius: 7px;
  color: color-mix(in srgb, currentColor 60%, transparent);
  opacity: .45;
}
.wb-sidebar-session:hover .wb-sidebar-session-remove,
.wb-sidebar-session:focus-within .wb-sidebar-session-remove { opacity: 1; }
.wb-sidebar-session-remove:hover { background: color-mix(in srgb, currentColor 9%, transparent); color: inherit; }
.wb-sidebar-rail {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 4px auto;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.wb-sidebar-rail:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.wb-sidebar-entry button:focus-visible,
.wb-sidebar-rail:focus-visible {
  outline: 2px solid #4d6bfe;
  outline-offset: 2px;
}
`
