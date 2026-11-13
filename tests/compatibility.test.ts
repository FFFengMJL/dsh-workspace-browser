import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { inject } from '../src/client.js'
import { createBrowserServices, type PluginRuntime } from '../src/ui/runtime.js'

describe('real Cordis session service boundary', () => {
  it('allows the declared remote.session service to rename through the adapter', async () => {
    const ctx = new Context()
    const calls: unknown[] = []
    ctx.provide('remote.session', { rename: async (request: unknown) => { calls.push(request); return { ok: true } } })
    const adapt = (scope: Context) => {
      // The namespace facade forwards to Cordis's independently injected service.
      const runtime = Object.create(scope) as PluginRuntime
      Object.defineProperty(runtime, 'remote', { value: { session: scope['remote.session' as keyof Context] } })
      return createBrowserServices(runtime).renameSession
    }
    for (const name of inject.filter(name => !['remote', 'remote.session'].includes(name))) ctx.provide(name, { list: {} })
    let rename: ReturnType<typeof createBrowserServices>['renameSession'] | undefined
    const fiber = ctx.plugin({ inject: inject.filter(name => name !== 'remote'), apply(scope: Context) {
      rename = adapt(scope)
    } })
    await fiber
    expect(rename).toBeTypeOf('function')
    await rename!('synthetic-session', 'synthetic title')
    expect(calls).toEqual([{ sessionId: 'synthetic-session', title: 'synthetic title' }])
    await fiber.dispose()
    expect(inject).toContain('remote.session')
  })
})
