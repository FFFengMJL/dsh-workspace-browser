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
 * Density is expressed as custom properties on `.wb-root` and overridden once
 * for `[data-density='compact']`; individual rules never test the mode.
 */
export const styles: string = `
/* ---- Tokens ------------------------------------------------------------ */
.wb-root {
  --wb-border: color-mix(in srgb, currentColor 13%, transparent);
  --wb-muted: color-mix(in srgb, currentColor 60%, transparent);
  --wb-surface: color-mix(in srgb, currentColor 4%, transparent);
  --wb-accent: #4d6bfe;
  --wb-danger: #b42318;

  /* Density knobs (comfortable values); the compact block overrides them. */
  --wb-card-padding: 18px;
  --wb-card-gap: 12px;
  --wb-grid-min: 290px;
  --wb-card-title: 16px;
  --wb-row-padding: 13px;
  --wb-control-gap: 6px;
  --wb-control-padding: 6px 9px;

  box-sizing: border-box;
  min-height: 100%;
  padding: clamp(20px, 4vw, 52px);
  color: var(--dsh-foreground, currentColor);
  font: inherit;
  overflow: auto;
}
.wb-root * { box-sizing: border-box; }

/* Compact is the default: smaller cards, not smaller body text. */
.wb-root[data-density='compact'] {
  --wb-card-padding: 12px;
  --wb-card-gap: 8px;
  --wb-grid-min: 258px;
  --wb-card-title: 14px;
  --wb-row-padding: 9px;
  --wb-control-gap: 5px;
  --wb-control-padding: 4px 8px;
}

/* ---- Shared width rail ------------------------------------------------ */
.wb-container {
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
}
.wb-section { margin-block: 0 26px; }

/* ---- Header ----------------------------------------------------------- */
.wb-header { margin-bottom: 26px; }
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

/* ---- Controls --------------------------------------------------------- */
.wb-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 22px;
}
.wb-controls label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--wb-muted);
  font-size: 12px;
}
.wb-controls select, .wb-search input, .wb-field input {
  min-height: 38px;
  border: 1px solid var(--wb-border);
  border-radius: 9px;
  background: var(--wb-surface);
  color: inherit;
  padding: 0 10px;
  font: inherit;
}
.wb-search { position: relative; flex: 1 1 320px; }
.wb-search span { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 20px; pointer-events: none; }
.wb-search input { width: 100%; padding-left: 38px; }
.wb-toggle { user-select: none; }
.wb-toggle input { accent-color: var(--wb-accent); width: 15px; height: 15px; }

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
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--wb-border);
  border-radius: 14px;
  background: var(--wb-surface);
  overflow: hidden;
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
  flex-wrap: wrap;
  padding: 0 var(--wb-card-padding) var(--wb-card-padding);
}
.wb-workspace-controls { margin-top: auto; padding-top: 6px; }
.wb-workspace-controls button, .wb-session-actions button {
  border: 1px solid var(--wb-border);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  padding: var(--wb-control-padding);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
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
.wb-root[data-density='compact'] .wb-session-title { font-size: 13.5px; }
.wb-session-actions { flex: 0 0 auto; padding: 0 10px 0 0; }
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
@media (max-width: 720px) {
  .wb-root { padding: 18px 14px; }
  .wb-title-row { align-items: flex-start; }
  .wb-primary { margin-left: 0; }
  .wb-controls label:not(.wb-search) { font-size: 11px; }
  .wb-session { align-items: flex-start; flex-direction: column; }
  .wb-session-actions { padding: 0 12px 12px; }
  .wb-session-actions button { min-height: 36px; }
  .wb-hidden-path { display: none; }
}
`
