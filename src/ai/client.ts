import { AceError, object, requireValue } from '../shared/files'
import type { ChatMessage, EditOperation, HostLimits, ModelReply, RequestUsage } from '../shared/types'
import type { Database } from '../storage/database'
import { redact } from '../storage/connection'

export const MAX_REQUEST_BYTES = 256 * 1024
export class ModelGateway {
  private active = false
  constructor(private database: Database, private limits: () => HostLimits, private changed: () => Promise<void>) {}
  async request(operation: EditOperation, messages: ChatMessage[], source: RequestUsage['source'], tools?: object[], requestedCap?: number): Promise<ModelReply> {
    requireValue(operation.current(), 'AI operation cancelled.', 'SESSION_EXPIRED')
    requireValue(!this.active, 'Another model request is active.', 'AI_BUSY')
    const { connection } = operation
    requireValue(connection.model && (connection.authMode === 'none' || connection.apiKey), 'Save an endpoint, model, and authentication settings first.', 'AI_REQUEST_FAILED')
    const cap = Math.min(requestedCap ?? this.limits().maxCompletionTokensPerRequest, this.limits().maxCompletionTokensPerRequest)
    const body = JSON.stringify({ model: connection.model, messages, stream: false, [connection.tokenLimitParameter]: cap, ...(connection.temperature === undefined ? {} : { temperature: connection.temperature }), ...(tools ? { tools, tool_choice: 'auto' } : {}) })
    requireValue(new TextEncoder().encode(body).length <= MAX_REQUEST_BYTES, 'Request exceeds the 256 KiB context guard. Use smaller files or read_file ranges.', 'QUOTA_EXCEEDED')
    this.active = true
    let usage: RequestUsage | undefined
    const abort = new AbortController()
    const cancel = () => abort.abort()
    operation.abort.signal.addEventListener('abort', cancel, { once: true })
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      usage = await this.database.reserve(source, connection.model, cap, operation.id, operation.current)
      operation.calls++
      await this.changed()
      requireValue(operation.current(), 'AI operation cancelled.', 'SESSION_EXPIRED')
      timeout = setTimeout(() => abort.abort('timeout'), connection.requestTimeoutMs)
      const response = await fetch(`${connection.baseUrl}/chat/completions`, { method: 'POST', credentials: 'omit', signal: abort.signal, headers: { 'Content-Type': 'application/json', ...(connection.authMode === 'bearer' ? { Authorization: `Bearer ${connection.apiKey}` } : {}), ...connection.extraHeaders }, body })
      const payload: unknown = await response.json().catch(error => {
        if (abort.signal.aborted) throw error
        throw new AceError('AI_REQUEST_FAILED', `Provider returned HTTP ${response.status} with an invalid JSON response.`)
      })
      requireValue(operation.current(), 'AI operation cancelled.', 'SESSION_EXPIRED')
      if (!response.ok || (object(payload) && payload.error)) {
        const detail = object(payload) && object(payload.error) && typeof payload.error.message === 'string' ? payload.error.message : 'Check your saved connection, model availability, and allowance.'
        throw new AceError('AI_REQUEST_FAILED', redact(`Provider HTTP ${response.status}: ${detail}`, connection))
      }
      requireValue(object(payload) && Array.isArray(payload.choices) && object(payload.choices[0]) && object(payload.choices[0].message) && payload.choices[0].message.role === 'assistant' && typeof payload.choices[0].finish_reason === 'string', 'Provider returned an invalid Chat Completions response.', 'AI_REQUEST_FAILED')
      const metadata: Partial<RequestUsage> = {}
      const returned = object(payload.usage) ? payload.usage : undefined
      if (returned) {
        if (typeof returned.prompt_tokens === 'number' && Number.isFinite(returned.prompt_tokens)) metadata.promptTokens = returned.prompt_tokens
        if (typeof returned.completion_tokens === 'number' && Number.isFinite(returned.completion_tokens)) metadata.completionTokens = returned.completion_tokens
        if (typeof returned.cost === 'number' && Number.isFinite(returned.cost)) { metadata.providerCost = returned.cost; metadata.providerCostUnit = connection.preset === 'openrouter' ? 'USD' : (typeof returned.cost_unit === 'string' ? returned.cost_unit : 'provider units') }
      }
      await this.database.finishUsage(usage.id, 'completed', metadata)
      return { message: payload.choices[0].message as ChatMessage, finish_reason: payload.choices[0].finish_reason, usage: returned }
    } catch (error) {
      if (usage) await this.database.finishUsage(usage.id, operation.current() ? 'failed' : 'cancelled').catch(() => {})
      if (error instanceof AceError) throw error
      const message = abort.signal.aborted ? (operation.current() ? 'Model request timed out. The attempt still counts against your allowance.' : 'AI request cancelled.') : 'Model request failed. The endpoint must allow direct browser requests; network or CORS restrictions may be involved.'
      throw new AceError('AI_REQUEST_FAILED', message)
    } finally {
      clearTimeout(timeout); operation.abort.signal.removeEventListener('abort', cancel)
      this.active = false; await this.changed()
    }
  }
}
