import Ajv from 'ajv'
import { AceError, MAX_FILE_BYTES, applyChange, copyFiles, fileBytes, inventory, manifest, object, path, readText, requireValue, textFile } from '../shared/files'
import type { ChatMessage, ConversationPair, EditOperation, FileMap, HostLimits } from '../shared/types'
import { redact } from '../storage/connection'
import type { ModelGateway } from './client'
import { HOST_INSTRUCTIONS, REPAIR_INSTRUCTIONS } from './instructions'

const string = { type: 'string' }
export const EDIT_TOOLS = [
  { name: 'list_files', description: 'List file metadata in sorted VFS path order.', properties: { prefix: string }, required: [] },
  { name: 'read_file', description: 'Read a UTF-8 file range; returns total length and whether more remains. Vendor sources are not automatically included.', properties: { path: string, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 20000 } }, required: ['path'] },
  { name: 'write_file', description: 'Replace a complete UTF-8 file in the edit draft.', properties: { path: string, content: string, mediaType: string }, required: ['path', 'content'] },
  { name: 'delete_file', description: 'Delete a file from the edit draft.', properties: { path: string }, required: ['path'] },
  { name: 'import_url', description: 'Download public browser-ready bytes into a draft file; libraries must be classic browser bundles. HTTPS only, subject to CORS. Returns metadata.', properties: { url: string, path: string }, required: ['url', 'path'] },
].map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: { type: 'object', properties: tool.properties, required: tool.required, additionalProperties: false } } }))
const ajv = new Ajv()
const validators = Object.fromEntries(EDIT_TOOLS.map(tool => [tool.function.name, ajv.compile(tool.function.parameters)]))
export function appInstructions(files: FileMap, ignore = false): string {
  if (ignore) return ''
  const file = files['/agent/instructions.md']
  if (!file || (file.encoding === 'utf8' && !file.content.trim())) return 'Preserve unrelated files and persisted data. Use the ACE SDK.'
  requireValue(file.encoding === 'utf8' && fileBytes(file) <= 64000, 'App instructions are invalid or oversized. Use Ignore app instructions / Repair mode.')
  return file.content
}
export function conversation(files: FileMap, recovery?: () => void): ConversationPair[] {
  try {
    const file = files['/agent/conversation.json']
    requireValue(file && file.encoding === 'utf8' && fileBytes(file) <= 128000, 'Invalid conversation.')
    const parsed: unknown = JSON.parse(file.content)
    requireValue(Array.isArray(parsed) && parsed.length % 2 === 0 && parsed.every((x, index) => object(x) && x.role === (index % 2 ? 'assistant' : 'user') && typeof x.content === 'string' && Number.isFinite(x.timestamp)), 'Invalid conversation.')
    return parsed as ConversationPair[]
  } catch { recovery?.(); return [] }
}
export function initialContext(files: FileMap, prompt: string, ignore: boolean, role: string, errors: string[]): ChatMessage[] {
  const source = Object.entries(files).filter(([name, file]) => name.startsWith('/app/') && file.encoding === 'utf8' && (name === '/app/boot.json' || fileBytes(file) <= 16000)).map(([name, file]) => `File ${name} (complete):\n${file.content}`).join('\n\n')
  const context = `Current file inventory:\n${JSON.stringify(inventory(files))}\n\n${source}\n\n${errors.length ? `Recent runtime diagnostics:\n${errors.slice(-5).join('\n')}` : ''}`
  const messages: ChatMessage[] = [{ role, content: ignore ? REPAIR_INSTRUCTIONS : HOST_INSTRUCTIONS }]
  if (!ignore) messages.push({ role: 'user', content: `Subordinate app instructions:\n${appInstructions(files)}\n\nApp memory:\n${files['/agent/memory.md']?.encoding === 'utf8' ? files['/agent/memory.md'].content.slice(0, 16000) : ''}` }, ...conversation(files).slice(-16).map(x => ({ role: x.role, content: x.content })))
  messages.push({ role: 'user', content: `${context}\n\nUser request:\n${prompt}` })
  return messages
}
export async function importPublic(urlValue: string, signal: AbortSignal) {
  let url: URL
  try { url = new URL(urlValue) } catch { throw new AceError('INVALID_REQUEST', 'Invalid import URL.') }
  requireValue(url.protocol === 'https:' && !url.username && !url.password && !url.search.match(/(?:token|key|secret|signature|auth)=/i), 'Import a public HTTPS resource without credentials.')
  const response = await fetch(url.href, { credentials: 'omit', signal, referrerPolicy: 'no-referrer' })
  requireValue(response.ok, `Import failed: HTTP ${response.status}.`, 'AI_REQUEST_FAILED')
  requireValue(Number(response.headers.get('content-length') ?? 0) <= MAX_FILE_BYTES, 'Import exceeds the file size limit.', 'QUOTA_EXCEEDED')
  const reader = response.body?.getReader(); requireValue(reader, 'Import response has no body.')
  const chunks: Uint8Array[] = []; let size = 0
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; requireValue(size <= MAX_FILE_BYTES, 'Import exceeds the file size limit.', 'QUOTA_EXCEEDED'); chunks.push(value) } } catch (error) { await reader.cancel(); throw error }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  const mediaType = response.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream'
  let encoding: 'utf8' | 'base64' = 'utf8', content: string
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {
    encoding = 'base64'; let binary = ''
    for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192))
    content = btoa(binary)
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return { file: { encoding, mediaType, content }, provenance: { url: url.href, resolvedUrl: response.url, sha256: [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''), importedAt: new Date().toISOString() } }
}
export async function runEditor(gateway: ModelGateway, operation: EditOperation, base: FileMap, prompt: string, ignore: boolean, limits: HostLimits, errors: string[], status: (state: string, info?: string) => void, recovery?: () => void) {
  let draft = copyFiles(base)
  const messages = initialContext(draft, prompt, ignore, operation.connection.instructionRole, errors)
  const included = Object.entries(draft).filter(([name, file]) => name.startsWith('/app/') && file.encoding === 'utf8' && (name === '/app/boot.json' || fileBytes(file) <= 16000)).map(([name]) => name)
  status('Calling model', `Context includes the inventory and these complete files: ${included.join(', ')}. ${ignore ? 'Repair mode excludes app behavioral context.' : 'App instructions, memory up to 16,000 characters, and the last eight conversation pairs are included.'} Other files remain available through read_file ranges.`)
  for (;;) {
    requireValue(operation.current(), 'Edit cancelled.', 'SESSION_EXPIRED')
    requireValue(operation.calls < limits.maxModelCallsPerEdit, 'Model calls per edit exhausted; no draft applied.', 'AI_LIMIT_REACHED')
    // Re-read the draft's instructions on every request. Recovery never loads behavioral app context.
    if (!ignore) messages[1] = { role: 'user', content: `Subordinate app instructions:\n${appInstructions(draft)}\n\nApp memory (up to 16,000 characters):\n${draft['/agent/memory.md']?.encoding === 'utf8' ? draft['/agent/memory.md'].content.slice(0, 16000) : ''}` }
    status('Calling model')
    const reply = await gateway.request(operation, messages, 'editor', EDIT_TOOLS)
    requireValue(operation.current(), 'Edit cancelled.', 'SESSION_EXPIRED')
    const calls = reply.message.tool_calls
    requireValue(reply.finish_reason === 'stop' || reply.finish_reason === 'tool_calls', `Model ended with ${reply.finish_reason}; no partial draft applied.`, 'AI_REQUEST_FAILED')
    if (!calls || calls.length === 0) {
      requireValue(reply.finish_reason === 'stop' && typeof reply.message.content === 'string', 'Model did not finish a normal assistant turn.', 'AI_REQUEST_FAILED')
      const old = conversation(draft, recovery)
      const pair: ConversationPair[] = [{ role: 'user', content: prompt, timestamp: Date.now() }, { role: 'assistant', content: redact(reply.message.content, operation.connection), timestamp: Date.now() }]
      draft = applyChange(draft, { '/agent/conversation.json': textFile(JSON.stringify([...old, ...pair]), 'application/json') }, [])
      manifest(draft)
      return { files: draft, answer: pair[1]!.content, changed: Object.keys({ ...base, ...draft }).filter(name => JSON.stringify(base[name]) !== JSON.stringify(draft[name])) }
    }
    requireValue(Array.isArray(calls) && calls.length > 0 && calls.every(call => object(call) && call.type === 'function' && typeof call.id === 'string' && call.id.length > 0 && object(call.function) && typeof call.function.name === 'string' && typeof call.function.arguments === 'string') && new Set(calls.map(x => x.id)).size === calls.length, 'Invalid or duplicate tool calls.', 'AI_REQUEST_FAILED')
    // Preserve reasoning_details and all provider continuation fields unchanged within this run.
    messages.push(reply.message)
    for (const call of calls) {
      requireValue(operation.current(), 'Edit cancelled.', 'SESSION_EXPIRED')
      requireValue(operation.tools < limits.maxToolCallsPerEdit, 'Tool calls per edit exhausted; no draft applied.', 'AI_LIMIT_REACHED')
      operation.tools++; status('Using tools', `${call.function?.name ?? 'unknown tool'} (${operation.tools}/${limits.maxToolCallsPerEdit})`)
      let result: unknown
      try {
        requireValue(call.type === 'function' && typeof call.id === 'string' && object(call.function) && typeof call.function.arguments === 'string', 'Malformed tool call.')
        const name = call.function.name
        const raw: unknown = JSON.parse(call.function.arguments)
        requireValue(validators[name]?.(raw), 'Unknown tool or invalid arguments.')
        const args = raw as { path: string; prefix?: string; offset?: number; limit?: number; content: string; mediaType?: string; url: string }
        if (name === 'list_files') result = inventory(draft, args.prefix)
        else if (name === 'read_file') {
          path(args.path); const file = draft[args.path]
          if (file?.encoding === 'base64') result = { error: { code: 'BINARY_FILE', message: 'Binary file; content omitted.' }, metadata: inventory(draft).find(x => x.path === args.path) }
          else { const content = readText(draft, args.path); const offset = Math.min(content.length, args.offset ?? 0); const limit = args.limit ?? 20000; const end = Math.min(content.length, offset + limit); result = { path: args.path, offset, end, totalLength: content.length, more: end < content.length, content: content.slice(offset, end) } }
        } else if (name === 'write_file') { draft = applyChange(draft, { [args.path]: textFile(args.content, args.mediaType ?? draft[args.path]?.mediaType) }, []); result = inventory(draft).find(x => x.path === args.path) }
        else if (name === 'delete_file') { draft = applyChange(draft, {}, [args.path]); result = { deleted: args.path } }
        else if (name === 'import_url') {
          path(args.path); requireValue(args.path !== '/vendor/versions.json', 'Import destination cannot replace the provenance file.'); const imported = await importPublic(args.url, operation.abort.signal)
          requireValue(operation.current(), 'Edit cancelled.', 'SESSION_EXPIRED')
          let provenance: Record<string, unknown> = {}
          if (draft['/vendor/versions.json']) { const prior: unknown = JSON.parse(readText(draft, '/vendor/versions.json')); requireValue(object(prior), 'Repair /vendor/versions.json before importing.'); provenance = prior }
          draft = applyChange(draft, { [args.path]: imported.file, '/vendor/versions.json': textFile(JSON.stringify({ ...provenance, [args.path]: imported.provenance }, null, 2), 'application/json') }, [])
          result = { metadata: inventory(draft).find(x => x.path === args.path), provenance: imported.provenance }
        }
      } catch (error) { result = { error: { code: error instanceof AceError ? error.code : 'INVALID_REQUEST', message: redact(error instanceof Error ? error.message : 'Tool failed.', operation.connection) } } }
      requireValue(operation.current(), 'Edit cancelled.', 'SESSION_EXPIRED')
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) })
    }
  }
}
