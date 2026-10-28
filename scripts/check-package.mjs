/**
 * Installable-package check.
 *
 * DSH installs this plugin from the tarball a release publishes, so the tarball
 * — not the working tree — is the artifact that has to be correct. This script
 * packs the project exactly as a release would, unpacks the result into a
 * temporary directory, and verifies what a user would actually receive:
 *
 * - the manifest DSH reads (`dsh.bundle`, `dsh.client`, `dsh.compatibility`)
 *   survived packing, and every `exports` target exists;
 * - no development sources, caches, lockfiles or secrets were swept in;
 * - the client loader contract still holds *inside the unpacked package*, via
 *   `scripts/check-bundle.mjs`;
 * - installing runs no lifecycle code, so users never build or approve scripts.
 *
 * Usage: node scripts/check-package.mjs [--out <dir>]
 *
 * `--out` defaults to `.release` at the repository root (git-ignored). The
 * release workflow uploads that directory, so the bytes that were checked are
 * the bytes that get published.
 *
 * `pnpm pack` runs the `prepack` script, which is `pnpm check`; `verify` must
 * therefore stay `check` + `check:package` and must never call `pack` again, or
 * packing would recurse into itself.
 */
import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Run a command and, on failure, replay its output. `execFile` captures stdout,
 * so without this a failing `prepack` would surface only as an exit code.
 */
async function run(command, args, options) {
  try {
    return await execFile(command, args, options)
  } catch (error) {
    process.stderr.write(`${error.stdout ?? ''}${error.stderr ?? ''}`)
    throw error
  }
}

/** Release output directory: the only place this script writes inside the repo. */
function outputDirFrom(argv) {
  const index = argv.indexOf('--out')
  if (index === -1) return join(root, '.release')
  const value = argv[index + 1]
  assert.ok(value !== undefined && !value.startsWith('-'), '--out needs a directory')
  return resolve(root, value)
}

const outDir = outputDirFrom(process.argv.slice(2))
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const expectedTarball = `${manifest.name}-${manifest.version}.tgz`

// A guard that never fails is worse than no guard, so prove the loader check
// rejects an empty package before trusting it on the real one. This replaces a
// unit test because the test files are typed for the browser build, which has
// no Node type definitions.
const emptyPackage = await mkdtemp(join(tmpdir(), 'dsh-workspace-browser-empty-'))
try {
  await assert.rejects(
    execFile(process.execPath, [join(root, 'scripts/check-bundle.mjs'), emptyPackage], { cwd: root }),
    /is missing lib\/client\.js/,
  )
} finally {
  await rm(emptyPackage, { recursive: true, force: true })
}

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

// `prepack` prints its own lifecycle output, so the tarball is located on disk
// rather than parsed from stdout; a differently named artifact then fails the
// assertion below instead of being silently published.
await run('pnpm', ['pack', '--pack-destination', outDir], {
  cwd: root,
  maxBuffer: 16 * 1024 * 1024,
})
const generated = (await readdir(outDir)).filter((name) => name.endsWith('.tgz'))
assert.deepEqual(generated, [expectedTarball], `expected one tarball named ${expectedTarball}, got ${generated.join(', ')}`)
const tarball = join(outDir, expectedTarball)
assert.ok(existsSync(tarball), 'pack did not write a tarball')

const scratch = await mkdtemp(join(tmpdir(), 'dsh-workspace-browser-package-'))
try {
  await run('tar', ['-xzf', tarball, '-C', scratch])
  const packageRoot = join(scratch, 'package')

  await verifyManifestShape(packageRoot)
  const files = await listFiles(packageRoot)
  await verifyFileSet(files)
  await verifyContents(packageRoot, files)

  // Same loader contract, but resolved from the unpacked package: this is the
  // half of the check that catches a `files` entry dropped from the tarball.
  await run(process.execPath, [join(root, 'scripts/check-bundle.mjs'), packageRoot], {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
  })

  const bytes = await readFile(tarball)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const checksumFile = `${tarball}.sha256`
  await writeFile(checksumFile, `${sha256}  ${expectedTarball}\n`)

  console.log(`Package check passed: ${relative(root, tarball)} (${bytes.length} bytes)`)
  console.log(`sha256 ${sha256}`)
  console.log(`checksum ${relative(root, checksumFile)}`)
  console.log(`contents ${files.length} files: ${files.join(', ')}`)
} finally {
  await rm(scratch, { recursive: true, force: true })
}

/** DSH reads these fields from the installed package, so packing must keep them. */
async function verifyManifestShape(packageRoot) {
  const packedManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(packedManifest.name, manifest.name)
  assert.equal(packedManifest.version, manifest.version)
  assert.equal(packedManifest.type, 'module')
  assert.equal(packedManifest.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(packedManifest.dsh?.client?.platform, 'web')
  assert.deepEqual(packedManifest.dsh?.client?.inject, manifest.dsh.client.inject)
  assert.deepEqual(packedManifest.dsh?.compatibility, manifest.dsh.compatibility)
  assert.equal(packedManifest.license, 'MIT')

  // Installing a plugin must never execute package code: users would otherwise
  // have to approve build scripts, and the release would not be self-contained.
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
    assert.equal(packedManifest.scripts?.[lifecycle], undefined, `packed manifest declares ${lifecycle}`)
  }

  // `exports` mixes string targets (`./package.json`) with condition objects.
  for (const [subpath, target] of Object.entries(packedManifest.exports)) {
    const targets = typeof target === 'string' ? [target] : Object.values(target)
    for (const file of targets) {
      if (typeof file !== 'string') continue
      assert.ok(existsSync(join(packageRoot, file)), `exports["${subpath}"] points at missing ${file}`)
    }
  }
}

/** Exactly the files a user needs; anything else is a packaging mistake. */
async function verifyFileSet(files) {
  const expected = [
    'LICENSE',
    'README.md',
    'README.zh-CN.md',
    'cordis.patch.yml',
    'lib/client.d.ts',
    'lib/client.js',
    'lib/index.d.ts',
    'lib/index.js',
    'package.json',
  ]
  assert.deepEqual(files, expected, 'tarball contents differ from the expected release file set')

  for (const file of files) {
    assert.ok(!file.startsWith('../'), `${file} escapes the package root`)
    for (const segment of file.split('/')) {
      assert.ok(!['node_modules', 'src', 'tests', 'scripts', '.github', '.git'].includes(segment),
        `tarball contains development path ${file}`)
    }
  }
}

/** Repository-relative paths with POSIX separators, so assertions read the same everywhere. */
async function listFiles(packageRoot) {
  const found = []
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) found.push(relative(packageRoot, path).split('\\').join('/'))
    }
  }
  await walk(packageRoot)
  return found.sort()
}

/**
 * Development paths leak the maintainer's machine into a public download, and
 * secrets must never ship. The text scan is a guard, not a security audit.
 */
async function verifyContents(packageRoot, files) {
  const hostPath = /\/home\/[^/\s"']+\/|\/Users\/[^/\s"']+\/|[A-Za-z]:\\Users\\/
  const privateKey = /-----BEGIN [A-Z ]*PRIVATE KEY-----/
  const bannedName = /(^|\/)(\.env(\..*)?|id_rsa|id_ed25519|\.npmrc|\.pypirc|.*\.(pem|key|p12|pfx))$/

  for (const file of files) {
    assert.ok(!bannedName.test(file), `tarball contains ${file}, which may hold secrets`)
    const text = await readFile(join(packageRoot, file), 'utf8')
    assert.ok(!hostPath.test(text), `${file} contains a local filesystem path`)
    assert.ok(!privateKey.test(text), `${file} contains a private key`)
  }
}
