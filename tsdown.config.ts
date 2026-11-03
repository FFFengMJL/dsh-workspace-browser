import { defineConfig } from 'tsdown'

const runtimeDeps = ['react', 'react/jsx-runtime']
// pinyin-pro is a pure browser library: bundle it so the plugin has no runtime
// dependency beyond React, which the DSH loader supplies.
const bundledDeps = ['pinyin-pro']

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/client.tsx'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    outDir: 'lib',
    clean: true,
    deps: { neverBundle: runtimeDeps, onlyBundle: bundledDeps },
  },
  {
    entry: ['src/client.tsx'],
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    outDir: '.build',
    clean: true,
    deps: { neverBundle: runtimeDeps, onlyBundle: bundledDeps },
  },
])
