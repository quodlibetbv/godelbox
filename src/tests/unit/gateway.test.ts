import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Database } from '../../storage/database'
import { ModelGateway } from '../../ai/client'
import { seedFiles } from '../../seed'
import { defaults } from '../../storage/connection'
import { DEFAULT_LIMITS, type EditOperation } from '../../shared/types'
let db: Database, gateway: ModelGateway, operation: EditOperation
beforeEach(async () => {
  db = await Database.open(`gateway-${crypto.randomUUID()}`); await db.initialize(seedFiles(), true)
  gateway = new ModelGateway(db, () => DEFAULT_LIMITS, async () => {})
  const abort = new AbortController()
  operation = { id: crypto.randomUUID(), abort, calls: 0, tools: 0, current: () => !abort.signal.aborted, connection: { ...defaults(), preset: 'custom', baseUrl: 'https://provider.example.test/prefix/v1', model: 'synthetic-model', authMode: 'none', tokenLimitParameter: 'max_completion_tokens' } }
})
afterEach(() => { db.db.close(); vi.unstubAllGlobals() })
const final = { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Synthetic response' } }] }
describe('direct-browser gateway', () => {
  it('counts an HTTP 200 error finish as failed even without a top-level error object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'synthetic-failed-completion', provider: 'Synthetic provider', choices: [{ finish_reason: 'error', native_finish_reason: 'provider_disconnected', message: { role: 'assistant', content: 'discard this partial response' } }] }))))
    await expect(gateway.request(operation, [{ role: 'user', content: 'Hello' }], 'editor')).rejects.toThrow(/Model ended with error/)
    expect((await db.load()).usage[0]).toMatchObject({ outcome: 'failed', diagnostic: { httpStatus: 200, finishReason: 'error', nativeFinishReason: 'provider_disconnected', responseId: 'synthetic-failed-completion' } })
  })
  it.each([200, 503])('records provider failure at HTTP %i without exporting credentials, raw bodies or retrying', async status => {
    operation.connection.apiKey = 'synthetic-credential-only'; operation.connection.extraHeaders = { 'X-Test': 'synthetic-header-only' }
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 'synthetic-response-id', choices: [{ finish_reason: 'error', message: { role: 'assistant', content: 'private-response-body' } }], error: { code: 503, message: 'Provider returned error', metadata: { provider_name: 'Synthetic provider', raw: JSON.stringify({ error: { message: 'Model at capacity synthetic-credential-only synthetic-header-only', code: 'capacity' }, request: { prompt: 'private-prompt-body' } }) } } }), { status, headers: { 'x-request-id': 'synthetic-request-id' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(gateway.request(operation, [{ role: 'user', content: 'private-prompt-body' }], 'editor')).rejects.toThrow(/Model at capacity.*Try again later/)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const state = await db.load(), diagnostic = state.usage[0]!.diagnostic!
    expect(state.usage[0]!.outcome).toBe('failed'); expect(state.allowance.usedRequests).toBe(1)
    expect(diagnostic).toMatchObject({ httpStatus: status, finishReason: 'error', provider: 'Synthetic provider', requestId: 'synthetic-request-id', responseId: 'synthetic-response-id', errorCode: 503 })
    for (const value of ['synthetic-credential-only', 'synthetic-header-only', 'private-prompt-body', 'private-response-body']) expect(JSON.stringify(diagnostic)).not.toContain(value)
  })
  it('reserves usage before fetch, preserves prefix/options and clamps app tokens', async () => {
    const fetcher = vi.fn(async (_url, options) => {
      expect((await db.load()).allowance.usedRequests).toBe(1)
      expect(options.credentials).toBe('omit'); expect(JSON.parse(options.body)).toMatchObject({ max_completion_tokens: 8192, stream: false })
      expect(JSON.parse(options.body)).not.toHaveProperty('max_tokens')
      return new Response(JSON.stringify(final))
    }); vi.stubGlobal('fetch', fetcher)
    await gateway.request(operation, [{ role: 'user', content: 'Hello' }], 'app', undefined, 9000)
    expect(fetcher.mock.calls[0]![0]).toBe('https://provider.example.test/prefix/v1/chat/completions')
    const data = await db.load(); expect(data.usage[0]).toMatchObject({ outcome: 'completed', completionTokenCap: 8192 }); expect(data.usage[0]).not.toHaveProperty('completionTokens')
  })
  it('rejects oversized context before counting or fetching', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(gateway.request(operation, [{ role: 'user', content: 'x'.repeat(256 * 1024) }], 'editor')).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' })
    expect(fetcher).not.toHaveBeenCalled(); expect((await db.load()).allowance.usedRequests).toBe(0)
  })
  it('counts network failures once without retrying or inventing zero usage', async () => {
    const fetcher = vi.fn(() => Promise.reject(new TypeError('Synthetic network failure'))); vi.stubGlobal('fetch', fetcher)
    await expect(gateway.request(operation, [{ role: 'user', content: 'Hello' }], 'editor')).rejects.toThrow(/CORS/)
    expect(fetcher).toHaveBeenCalledTimes(1); const data = await db.load(); expect(data.allowance.usedRequests).toBe(1); expect(data.usage[0]).toMatchObject({ outcome: 'failed' }); expect(data.usage[0]).not.toHaveProperty('promptTokens')
  })
  it('rejects late responses after cancellation and retains accounted attempt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { operation.abort.abort(); return new Response(JSON.stringify(final)) }))
    await expect(gateway.request(operation, [{ role: 'user', content: 'Hello' }], 'editor')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    expect((await db.load()).usage[0]).toMatchObject({ outcome: 'cancelled' }); expect((await db.load()).allowance.usedRequests).toBe(1)
  })
  it('reports timeout during response decoding as a counted timeout', async () => {
    operation.connection.requestTimeoutMs = 10
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => { options.signal.addEventListener('abort', () => reject(new DOMException('Aborted response', 'AbortError')), { once: true }) }) })))
    await expect(gateway.request(operation, [{ role: 'user', content: 'Hello' }], 'editor')).rejects.toThrow(/timed out/)
    expect((await db.load()).usage[0]).toMatchObject({ outcome: 'failed' }); expect((await db.load()).allowance.usedRequests).toBe(1)
  })
  it('blocks exhausted allowance before network and retains old records after reset', async () => {
    await db.saveLimits({ ...DEFAULT_LIMITS, maxRequestsSinceReset: 1 }); await db.reserve('editor', 'synthetic-model', 10, 'first', () => true)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(gateway.request(operation, [{ role: 'user', content: 'Hello' }], 'editor')).rejects.toMatchObject({ code: 'AI_LIMIT_REACHED' }); expect(fetcher).not.toHaveBeenCalled()
    await db.resetAllowance(); expect((await db.load()).allowance.usedRequests).toBe(0); expect((await db.load()).usage).toHaveLength(1)
  })
})
