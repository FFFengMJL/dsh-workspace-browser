import { describe, expect, it } from 'vitest'
import { pnpmInvocation } from '../scripts/pnpm.mjs'

describe('cross-platform pnpm entry', () => {
  it.each(['/opt/pnpm/pnpm', 'C:\\Program Files\\工具\\pnpm.exe'])( 'runs native entry directly: %s', entry => {
    expect(pnpmInvocation(entry, '/node')).toEqual({ command: entry, prefix: [] })
  })
  it.each(['/opt/pnpm/bin/pnpm.cjs', 'C:\\tools\\pnpm.js', '/tools/pnpm.mjs'])( 'runs JS entry through current Node: %s', entry => {
    expect(pnpmInvocation(entry, '/node')).toEqual({ command: '/node', prefix: [entry] })
  })
  it.each([undefined, '', '/tools/pnpm.cmd', 'C:\\tools\\pnpm.bat', '/bin/not-pnpm', '/bin/other.exe'])( 'rejects missing or unexpected entry: %s', entry => {
    expect(() => pnpmInvocation(entry)).toThrow()
  })
})
