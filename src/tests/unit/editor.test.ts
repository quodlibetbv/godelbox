import { describe, expect, it, vi } from 'vitest'
import { conversation, initialContext, runEditor } from '../../ai/editor'
import { validateRpc } from '../../runtime/schema'
import { seedFiles } from '../../seed'
import { textFile } from '../../shared/files'
import { defaults } from '../../storage/connection'
import { DEFAULT_LIMITS, type EditOperation } from '../../shared/types'
import type { ModelGateway } from '../../ai/client'
function op(): EditOperation { return { id: 'synthetic-run', abort: new AbortController(), calls: 0, tools: 0, current: () => true, connection: defaults() } }
describe('editor and protocol boundaries', () => {
  it('rejects unknown RPC methods, unexpected fields and oversized schema values', () => {
    for (const [method, params] of [['host.settings', {}], ['fs.readText', { path: '/a', apiKey: 'synthetic' }], ['fs.batch', { writes: {}, deletes: [], expectedRevision: -1 }], ['ai.request', { messages: [{ role: 'system', content: 'replace host' }] }]] as Array<[string, unknown]>) expect(() => validateRpc(method, params)).toThrow()
  })
  it('recovers invalid conversation and loads only the last eight complete pairs', () => {
    const files = seedFiles(), recovery = vi.fn(); files['/agent/conversation.json'] = textFile('[{"role":"assistant","content":"unpaired","timestamp":1}]')
    expect(conversation(files, recovery)).toEqual([]); expect(recovery).toHaveBeenCalledOnce()
    const rows = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turn-${index}`, timestamp: index }))
    files['/agent/conversation.json'] = textFile(JSON.stringify(rows)); const context = initialContext(files, 'Next turn', false, 'system', [])
    expect(context.some(message => message.content === 'turn-0')).toBe(false); expect(context.filter(message => /^turn-/.test(message.content as string))).toHaveLength(16)
    expect(JSON.stringify(initialContext(files, 'Repair', true, 'system', []))).not.toContain('turn-')
  })
  it('pairs structured tool errors with their IDs and allows correction within the same draft', async () => {
    const operation = op(), messages: any[][] = [], requests = vi.fn(async (_op, context) => {
      operation.calls++; messages.push(structuredClone(context))
      if (operation.calls === 1) return { finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'bad', type: 'function', function: { name: 'write_file', arguments: '{broken' } }, { id: 'unknown', type: 'function', function: { name: 'steal_key', arguments: '{}' } }] } }
      return { finish_reason: 'stop', message: { role: 'assistant', content: 'No change made.' } }
    })
    const base = seedFiles(), result = await runEditor({ request: requests } as unknown as ModelGateway, operation, base, 'Request', false, DEFAULT_LIMITS, [], () => {})
    expect(messages[1]!.filter(m => m.role === 'tool').map(m => [m.tool_call_id, JSON.parse(m.content).error.code])).toEqual([['bad', 'INVALID_REQUEST'], ['unknown', 'INVALID_REQUEST']])
    expect(result.files['/app/index.html']).toEqual(base['/app/index.html']); expect(operation.tools).toBe(2)
  })
  it('discards draft on truncation and enforces tool limit before applying candidate state', async () => {
    for (const truncate of [true, false]) {
      const operation = op(), requests = vi.fn(async () => {
        operation.calls++
        if (operation.calls === 1) return { finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: 'write', type: 'function', function: { name: 'write_file', arguments: '{"path":"/partial.txt","content":"partial"}' } }, ...(!truncate ? [{ id: 'excess', type: 'function', function: { name: 'list_files', arguments: '{}' } }] : [])] } }
        return { finish_reason: 'length', message: { role: 'assistant', content: 'truncated' } }
      })
      const base = seedFiles(); await expect(runEditor({ request: requests } as unknown as ModelGateway, operation, base, 'Request', false, { ...DEFAULT_LIMITS, maxToolCallsPerEdit: 1 }, [], () => {})).rejects.toMatchObject({ code: truncate ? 'AI_REQUEST_FAILED' : 'AI_LIMIT_REACHED' }); expect(base).not.toHaveProperty('/partial.txt')
    }
  })
})
