import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import semver from 'semver'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
describe('DSH prerelease-aware loading range', () => {
  for (const version of ['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.99', '0.2.2']) {
    it(`allows ${version}`, () => expect(semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true })).toBe(true))
  }
  for (const version of ['0.2.1-rc.4', '0.2.3-0', '0.2.3-rc.1', '0.2.3', '0.3.0']) {
    it(`rejects ${version}`, () => expect(semver.satisfies(version, manifest.engines.dsh, { includePrerelease: true })).toBe(false))
  }
})
