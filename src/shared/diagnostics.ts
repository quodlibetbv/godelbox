import { object } from './files'
import { redact } from '../storage/connection'
import type { ModelConnection } from './types'

const fields = new Set(['startedAt', 'durationMs', 'outcome', 'source', 'model', 'operationId', 'requestBytes', 'messageCount', 'toolCount', 'completionTokenCap', 'httpStatus', 'requestId', 'responseId', 'provider', 'finishReason', 'nativeFinishReason', 'errorCode', 'errorMessage', 'message', 'method', 'revision', 'snapshotCount'])
export function diagnosticDetails(value: unknown, connection?: ModelConnection): Record<string, string | number | boolean> {
  if (!object(value)) return {}
  const result: Record<string, string | number | boolean> = {}
  for (const [key, entry] of Object.entries(value)) if (fields.has(key)) {
    if (typeof entry === 'string') result[key] = redact(entry, connection).slice(0, 2048)
    else if (typeof entry === 'boolean' || (typeof entry === 'number' && Number.isFinite(entry))) result[key] = entry
  }
  return result
}
export class Diagnostics {
  private events: Array<{ timestamp: number; kind: string; details: ReturnType<typeof diagnosticDetails> }> = []
  record(kind: string, details: unknown, connection?: ModelConnection) {
    this.events.push({ timestamp: Date.now(), kind, details: diagnosticDetails(details, connection) })
    this.events = this.events.slice(-200)
  }
  export(connection: ModelConnection) { return this.events.map(event => ({ ...event, details: diagnosticDetails(event.details, connection) })) }
}

// Never capture raw provider payloads. Extract only known error fields.
export function providerFailure(payload: unknown) {
  if (!object(payload)) return {}
  const choice = Array.isArray(payload.choices) && object(payload.choices[0]) ? payload.choices[0] : undefined
  const error = object(payload.error) ? payload.error : object(choice?.error) ? choice.error : undefined
  if (!error) return {}
  const metadata = object(error.metadata) ? error.metadata : {}
  let nested: Record<string, any> = {}
  if (typeof metadata.raw === 'string' && metadata.raw.length <= 8192) {
    try { const raw: unknown = JSON.parse(metadata.raw); if (object(raw)) nested = object(raw.error) ? raw.error : raw } catch { /* Raw text is deliberately omitted. */ }
  }
  const message = [error.message, nested.message, nested.detail, typeof nested.error === 'string' ? nested.error : undefined].filter(value => typeof value === 'string').join(' · ')
  return { ...(message ? { errorMessage: message } : {}), errorCode: error.code ?? nested.code ?? metadata.provider_code, provider: metadata.provider_name ?? payload.provider }
}
