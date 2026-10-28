import { readFile, writeFile } from 'node:fs/promises'

const source = await readFile('.build/client.cjs', 'utf8')
const body = source.replace(/^Object\.defineProperty\(exports, Symbol\.toStringTag, \{ value: "Module" \}\);\s*/, '')
const bundle = `window.__ModuleLoader__.load({
  id: "dsh-workspace-browser",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body.split('\n').map((line) => `    ${line}`).join('\n')}
    return module.exports;
  }
});
`

await writeFile('lib/client.js', bundle)
