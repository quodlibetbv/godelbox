import { AceError, object, requireValue } from '../shared/files'
import { DEFAULT_CONNECTION, MODEL_CONNECTION_STORAGE_KEY, type HostLimits, type ModelConnection } from '../shared/types'

export function defaults(): ModelConnection { return { ...DEFAULT_CONNECTION, extraHeaders: {} } }
export function validateConnection(value: unknown): ModelConnection {
  requireValue(object(value), 'Invalid saved model connection.')
  const fields = ['preset', 'baseUrl', 'model', 'authMode', 'apiKey', 'extraHeaders', 'tokenLimitParameter', 'instructionRole', 'temperature', 'requestTimeoutMs']
  requireValue(Object.keys(value).every(key => fields.includes(key)) && ['openrouter', 'custom'].includes(String(value.preset)) && typeof value.baseUrl === 'string' && typeof value.model === 'string' && typeof value.apiKey === 'string' && ['bearer', 'none'].includes(String(value.authMode)) && ['max_tokens', 'max_completion_tokens'].includes(String(value.tokenLimitParameter)) && ['system', 'developer'].includes(String(value.instructionRole)) && Number.isSafeInteger(value.requestTimeoutMs) && Number(value.requestTimeoutMs) >= 1000 && Number(value.requestTimeoutMs) <= 600000 && (value.temperature === undefined || (typeof value.temperature === 'number' && Number.isFinite(value.temperature) && value.temperature >= 0 && value.temperature <= 2)) && object(value.extraHeaders), 'Invalid connection options.')
  let url: URL
  try { url = new URL(value.baseUrl) } catch { throw new AceError('INVALID_REQUEST', 'Enter a valid endpoint base URL.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  requireValue((url.protocol === 'https:' || (url.protocol === 'http:' && local && value.preset === 'custom')) && !url.username && !url.password && !url.search && !url.hash, 'Use HTTPS (or an explicitly configured local HTTP endpoint), without URL credentials, query, or fragment.')
  const seen = new Set<string>()
  const headers: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value.extraHeaders)) {
    const lower = key.toLowerCase()
    requireValue(typeof entry === 'string' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) && !/[\r\n]/.test(entry) && !['authorization', 'content-type', 'cookie', 'host', 'proxy-authorization'].includes(lower) && !seen.has(lower), 'Extra headers must have unique valid names and cannot override authentication or Content-Type.')
    seen.add(lower); headers[key] = entry
  }
  return { preset: value.preset as ModelConnection['preset'], baseUrl: value.baseUrl.replace(/\/+$/, ''), model: value.model.trim(), authMode: value.authMode as ModelConnection['authMode'], apiKey: value.apiKey, extraHeaders: headers, tokenLimitParameter: value.tokenLimitParameter as ModelConnection['tokenLimitParameter'], instructionRole: value.instructionRole as ModelConnection['instructionRole'], ...(value.temperature === undefined ? {} : { temperature: Number(value.temperature) }), requestTimeoutMs: Number(value.requestTimeoutMs) }
}
export function loadConnection(storage: Pick<Storage, 'getItem'> = localStorage): ModelConnection {
  const raw = storage.getItem(MODEL_CONNECTION_STORAGE_KEY)
  if (raw === null) return defaults()
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new AceError('INVALID_REQUEST', 'Saved model settings are malformed. Correct them in Settings; your project is unchanged.') }
  requireValue(object(value) && value.schemaVersion === 1 && Object.keys(value).every(key => ['schemaVersion', 'connection'].includes(key)), 'Unsupported saved connection schema. Correct it in Settings.')
  return validateConnection(value.connection)
}
export function saveConnection(value: unknown, storage: Pick<Storage, 'setItem'> = localStorage): ModelConnection {
  const connection = validateConnection(value)
  storage.setItem(MODEL_CONNECTION_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, connection }))
  return connection
}
export function validateLimits(value: HostLimits): HostLimits {
  const names: (keyof HostLimits)[] = ['maxCompletionTokensPerRequest', 'maxModelCallsPerEdit', 'maxToolCallsPerEdit', 'maxRequestsSinceReset']
  requireValue(names.every(key => Number.isSafeInteger(value[key]) && value[key] >= 1 && value[key] <= 1000000), 'Usage limits must be positive integers (maximum 1,000,000).')
  return Object.fromEntries(names.map(key => [key, value[key]])) as unknown as HostLimits
}
export function redact(message: string, connection?: ModelConnection): string {
  let result = message
  if (connection) for (const secret of [connection.apiKey, ...Object.values(connection.extraHeaders)].filter(Boolean).sort((a, b) => b.length - a.length)) result = result.split(secret).join('[redacted]')
  return result.replace(/\b(?:sk-(?:or-v1-|proj-|ant-)?[\w-]+|gh[pousr]_[\w]+)\b/g, '[redacted]').slice(0, 4000)
}
