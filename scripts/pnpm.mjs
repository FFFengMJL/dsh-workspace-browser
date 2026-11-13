/** Resolve pnpm's exact lifecycle entry without invoking a command shell. */
export function pnpmInvocation(entry, node = process.execPath) {
  if (typeof entry !== 'string' || !entry) throw new Error('Run this script through pnpm (npm_execpath is required)')
  if (/[\\/]pnpm\.(?:c?js|mjs)$/i.test(entry)) return { command: node, prefix: [entry] }
  if (/[\\/]pnpm(?:\.exe)?$/i.test(entry)) return { command: entry, prefix: [] }
  throw new Error('npm_execpath must identify a native pnpm executable or pnpm JS entry, not a command shim')
}
