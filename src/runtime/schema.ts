import Ajv from 'ajv'
import { AceError } from '../shared/files'
const str = { type: 'string' }
const file = { type: 'object', properties: { encoding: { enum: ['utf8', 'base64'] }, mediaType: str, content: str }, required: ['encoding', 'mediaType', 'content'], additionalProperties: false }
const schemas: Record<string, object> = {
  'fs.list': { properties: { prefix: str } },
  'fs.readText': { properties: { path: str }, required: ['path'] },
  'fs.readFile': { properties: { path: str }, required: ['path'] },
  'fs.writeText': { properties: { path: str, content: str, mediaType: str }, required: ['path', 'content'] },
  'fs.writeFile': { properties: { path: str, file }, required: ['path', 'file'] },
  'fs.deleteFile': { properties: { path: str }, required: ['path'] },
  'fs.getRevision': { properties: {} },
  'fs.batch': { properties: { expectedRevision: { type: 'integer', minimum: 0 }, writes: { type: 'object', additionalProperties: file }, deletes: { type: 'array', items: str, uniqueItems: true } }, required: ['writes', 'deletes'] },
  'versions.checkpoint': { properties: { label: { type: 'string', maxLength: 200 } } },
  'runtime.ready': { properties: {} },
  'runtime.restart': { properties: {} },
  'runtime.requestEdit': { properties: { prompt: { type: 'string', minLength: 1, maxLength: 8000 } }, required: ['prompt'] },
  'runtime.error': { properties: { message: { type: 'string', maxLength: 4000 } }, required: ['message'] },
  'ai.request': { properties: { messages: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: { role: { enum: ['user', 'assistant'] }, content: str }, required: ['role', 'content'], additionalProperties: false } }, maxOutputTokens: { type: 'integer', minimum: 1 } }, required: ['messages'] },
}
const ajv = new Ajv()
const validators = Object.fromEntries(Object.entries(schemas).map(([method, schema]) => [method, ajv.compile({ type: 'object', additionalProperties: false, ...schema })]))
export function validateRpc(method: string, params: unknown): asserts params is Record<string, any> {
  const validate = validators[method]
  if (!validate || !validate(params)) throw new AceError('INVALID_REQUEST', `Unknown method or invalid arguments: ${method}`)
}
