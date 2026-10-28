import { defineConfig } from 'tsdown'

const runtimeDeps = ['react', 'react/jsx-runtime']

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/client.tsx'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    dts: true,
    outDir: 'lib',
    clean: true,
    deps: { neverBundle: runtimeDeps },
  },
  {
    entry: ['src/client.tsx'],
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    dts: false,
    outDir: '.build',
    clean: true,
    deps: { neverBundle: runtimeDeps },
  },
])
