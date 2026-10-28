/**
 * One-shot intents between the compact sidebar entry and the panel.
 *
 * The sidebar can ask the panel to open the add-workspace dialog, but the two
 * are separate registrations: the panel is mounted asynchronously by the
 * layout service, so a request made just before its mount must survive until
 * the panel subscribes. A listener-less request is therefore held as pending
 * instead of being dropped.
 */
type IntentListener = () => void

let pendingAddWorkspace = false
const addWorkspaceListeners = new Set<IntentListener>()

/** Ask the panel to open its add-workspace dialog as soon as it can. */
export function requestAddWorkspace(): void {
  if (addWorkspaceListeners.size === 0) {
    pendingAddWorkspace = true
    return
  }
  for (const listener of [...addWorkspaceListeners]) listener()
}

/** Take a request that arrived before the panel could listen. */
export function consumeAddWorkspaceIntent(): boolean {
  const pending = pendingAddWorkspace
  pendingAddWorkspace = false
  return pending
}

/** Listen for new requests; returns an unsubscribe function. */
export function onAddWorkspaceRequest(listener: IntentListener): () => void {
  addWorkspaceListeners.add(listener)
  return () => { addWorkspaceListeners.delete(listener) }
}
