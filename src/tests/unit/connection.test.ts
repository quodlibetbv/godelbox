import { describe, expect, it } from 'vitest'
import { defaults, loadConnection, redact, saveConnection, validateConnection } from '../../storage/connection'
describe('browser-local model connection', () => {
  it('persists and restores all connection options, with exactly one storage record', () => {
    const map = new Map<string, string>(), storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } }
    const connection = { ...defaults(), model: 'synthetic-model', apiKey: 'synthetic-test-only', baseUrl: 'https://example.test/prefix///', extraHeaders: { 'X-Test': 'synthetic-header' }, tokenLimitParameter: 'max_completion_tokens' as const, temperature: .4 }
    const saved = saveConnection(connection, storage); expect(loadConnection(storage)).toEqual(saved); expect(saved.baseUrl).toBe('https://example.test/prefix'); expect(map.size).toBe(1)
  })
  it('does not claim success when localStorage reads or writes fail', () => {
    expect(() => loadConnection({ getItem: () => { throw new DOMException('Blocked', 'SecurityError') } })).toThrow('Blocked')
    expect(() => saveConnection(defaults(), { setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } })).toThrow('Full')
    expect(() => loadConnection({ getItem: () => 'not-json' })).toThrow('malformed')
  })
  it.each(['https://user:password@example.test', 'https://example.test/?key=test', 'https://example.test/#fragment', 'http://example.test'])('rejects unsafe endpoint %s', baseUrl => expect(() => validateConnection({ ...defaults(), baseUrl })).toThrow())
  it('supports explicitly configured local HTTP and rejects conflicting headers', () => {
    expect(validateConnection({ ...defaults(), preset: 'custom', baseUrl: 'http://127.0.0.1:9999/prefix' }).baseUrl).toContain('/prefix')
    expect(() => validateConnection({ ...defaults(), extraHeaders: { authorization: 'synthetic-test-only' } })).toThrow()
    expect(() => validateConnection({ ...defaults(), extraHeaders: { 'X-Test': 'a', 'x-test': 'b' } })).toThrow()
  })
  it('redacts configured key and header values even when provider errors echo them', () => { const value = { ...defaults(), apiKey: 'synthetic-test-only', extraHeaders: { 'X-Test': 'synthetic-header' } }; expect(redact('echo synthetic-test-only synthetic-header', value)).toBe('echo [redacted] [redacted]') })
})
