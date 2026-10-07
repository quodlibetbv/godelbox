import { AceError, object, requireValue } from '../shared/files'
import type { ChatMessage, EditOperation, HostLimits, ModelReply, RequestDiagnostic, RequestUsage } from '../shared/types'
import type { Database } from '../storage/database'
import { redact } from '../storage/connection'
import { diagnosticDetails, providerFailure } from '../shared/diagnostics'

export const MAX_REQUEST_BYTES = 256 * 1024
export class ModelGateway {
  private active = false
  constructor(private database: Database, private limits: () => HostLimits, private changed: () => Promise<void>, private diagnostic: (details: RequestDiagnostic) => void = () => {}) {}
  async request(operation: EditOperation, messages: ChatMessage[], source: RequestUsage['source'], tools?: object[], requestedCap?: number): Promise<ModelReply> {
    requireValue(operation.current(), 'AI operation cancelled.', 'SESSION_EXPIRED')
    requireValue(!this.active, 'Another model request is active.', 'AI_BUSY')
    const { connection } = operation
    requireValue(connection.model && (connection.authMode === 'none' || connection.apiKey), 'Save an endpoint, model, and authentication settings first.', 'AI_REQUEST_FAILED')
    const cap = Math.min(requestedCap ?? this.limits().maxCompletionTokensPerRequest, this.limits().maxCompletionTokensPerRequest)
    const body = JSON.stringify({ model: connection.model, messages, stream: false, [connection.tokenLimitParameter]: cap, ...(connection.temperature === undefined ? {} : { temperature: connection.temperature }), ...(tools ? { tools, tool_choice: 'auto' } : {}) })
    const requestBytes = new TextEncoder().encode(body).length
    requireValue(requestBytes <= MAX_REQUEST_BYTES, 'Request exceeds the 256 KiB context guard. Use smaller files or read_file ranges.', 'QUOTA_EXCEEDED')
    const started = performance.now()
    const diagnostic: RequestDiagnostic = { startedAt: Date.now(), durationMs: 0, outcome: 'failed', source, model: connection.model, operationId: operation.id, requestBytes, messageCount: messages.length, toolCount: tools?.length ?? 0, completionTokenCap: cap }
    const safeDiagnostic = () => { diagnostic.durationMs = Math.round(performance.now() - started); return diagnosticDetails(diagnostic, connection) as unknown as RequestDiagnostic }
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
      diagnostic.httpStatus = response.status
      diagnostic.requestId = response.headers?.get('x-request-id') ?? response.headers?.get('x-openrouter-request-id') ?? undefined
      const payload: unknown = await response.json().catch(error => {
        if (abort.signal.aborted) throw error
        throw new AceError('AI_REQUEST_FAILED', `Provider returned HTTP ${response.status} with an invalid JSON response.`)
      })
      requireValue(operation.current(), 'AI operation cancelled.', 'SESSION_EXPIRED')
      const choice = object(payload) && Array.isArray(payload.choices) && object(payload.choices[0]) ? payload.choices[0] : undefined
      Object.assign(diagnostic, diagnosticDetails({ responseId: object(payload) ? payload.id : undefined, provider: object(payload) ? payload.provider : undefined, finishReason: choice?.finish_reason, nativeFinishReason: choice?.native_finish_reason, ...providerFailure(payload) }, connection))
      const metadata: Partial<RequestUsage> = {}
      const returned = object(payload) && object(payload.usage) ? payload.usage : undefined
      if (returned) {
        if (typeof returned.prompt_tokens === 'number' && Number.isFinite(returned.prompt_tokens)) metadata.promptTokens = returned.prompt_tokens
        if (typeof returned.completion_tokens === 'number' && Number.isFinite(returned.completion_tokens)) metadata.completionTokens = returned.completion_tokens
        if (typeof returned.cost === 'number' && Number.isFinite(returned.cost)) { metadata.providerCost = returned.cost; metadata.providerCostUnit = connection.preset === 'openrouter' ? 'USD' : (typeof returned.cost_unit === 'string' ? redact(returned.cost_unit, connection) : 'provider units') }
      }
      if (!response.ok || (object(payload) && payload.error) || choice?.error || choice?.finish_reason === 'error') {
        const detail = diagnostic.errorMessage ?? (choice?.finish_reason === 'error' ? 'Model ended with error; no partial draft applied.' : 'Check your saved connection, model availability, and allowance.')
        const unavailable = [429, 503].includes(response.status) || /capacity|overload|rate.limit|temporarily unavailable/i.test(detail)
        throw new AceError('AI_REQUEST_FAILED', redact(`Provider HTTP ${response.status}: ${detail}${unavailable ? ' Try again later; the provider is currently unavailable.' : ''}`, connection))
      }
      requireValue(choice && object(choice.message) && choice.message.role === 'assistant' && typeof choice.finish_reason === 'string', 'Provider returned an invalid Chat Completions response.', 'AI_REQUEST_FAILED')
      diagnostic.outcome = 'completed'
      await this.database.finishUsage(usage.id, 'completed', { ...metadata, diagnostic: safeDiagnostic() })
      return { message: choice.message as ChatMessage, finish_reason: choice.finish_reason, usage: returned }
    } catch (error) {
      const message = abort.signal.aborted ? (operation.current() ? 'Model request timed out. The attempt still counts against your allowance.' : 'AI request cancelled.') : 'Model request failed. The endpoint must allow direct browser requests; network or CORS restrictions may be involved.'
      const failure = error instanceof AceError ? error : new AceError('AI_REQUEST_FAILED', message)
      diagnostic.outcome = operation.current() ? 'failed' : 'cancelled'
      diagnostic.errorCode ??= failure.code; diagnostic.errorMessage ??= redact(failure.message, connection)
      if (usage) await this.database.finishUsage(usage.id, diagnostic.outcome as RequestUsage['outcome'], { diagnostic: safeDiagnostic() }).catch(() => {})
      throw failure
    } finally {
      clearTimeout(timeout); operation.abort.signal.removeEventListener('abort', cancel)
      this.active = false; this.diagnostic(safeDiagnostic()); await this.changed()
    }
  }
}
