export interface VirtualFile { encoding: 'utf8' | 'base64'; mediaType: string; content: string }
export type FileMap = Record<string, VirtualFile>
export interface Project { id: string; name: string; createdAt: number }
export interface Workspace { projectId: string; revision: number; headSnapshotId: string; lastCheckpointRevision: number; files: FileMap }
export type SnapshotReason = 'seed' | 'manual' | 'before-edit' | 'ai-edit' | 'before-restore' | 'restart' | 'app'
export interface Snapshot { id: string; projectId: string; parentId: string | null; createdAt: number; label: string; reason: SnapshotReason; runtimeVersion: 'ace-runtime/1'; prompt?: string; model?: string; files: FileMap }
export interface HostLimits { maxCompletionTokensPerRequest: number; maxModelCallsPerEdit: number; maxToolCallsPerEdit: number; maxRequestsSinceReset: number }
export interface Allowance { epochId: string; usedRequests: number; resetAt: number }
export interface RequestDiagnostic { startedAt: number; durationMs: number; outcome: string; source: string; model: string; operationId: string; requestBytes: number; messageCount: number; toolCount: number; completionTokenCap: number; httpStatus?: number; requestId?: string; responseId?: string; provider?: string; finishReason?: string; nativeFinishReason?: string; errorCode?: string | number; errorMessage?: string }
export interface RequestUsage { id: string; budgetEpochId: string; startedAt: number; editRunId?: string; source: 'editor' | 'app' | 'connection-test'; model: string; completionTokenCap: number; outcome: 'pending' | 'completed' | 'failed' | 'cancelled' | 'unknown'; promptTokens?: number; completionTokens?: number; providerCost?: number; providerCostUnit?: string; diagnostic?: RequestDiagnostic }
export interface ModelConnection { preset: 'openrouter' | 'custom'; baseUrl: string; model: string; authMode: 'bearer' | 'none'; apiKey: string; extraHeaders: Record<string, string>; tokenLimitParameter: 'max_tokens' | 'max_completion_tokens'; instructionRole: 'system' | 'developer'; temperature?: number; requestTimeoutMs: number }
export interface ProjectExport { format: 'ace-project'; schemaVersion: 1; exportedAt: number; project: Project; workspace: Workspace; snapshots: Snapshot[] }
export interface Change { expectedRevision?: number; writes: FileMap; deletes: string[] }
export interface ChatMessage { role: string; content?: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; [key: string]: unknown }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ModelReply { message: ChatMessage; finish_reason: string; usage?: Record<string, unknown> }
export interface EditOperation { id: string; abort: AbortController; connection: ModelConnection; current: () => boolean; calls: number; tools: number }
export interface ConversationPair { role: 'user' | 'assistant'; content: string; timestamp: number }

export const DEFAULT_LIMITS: HostLimits = { maxCompletionTokensPerRequest: 8192, maxModelCallsPerEdit: 10, maxToolCallsPerEdit: 50, maxRequestsSinceReset: 50 }
export const MODEL_CONNECTION_STORAGE_KEY = 'ace.model-connection.v1'
export const DEFAULT_CONNECTION: ModelConnection = { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: '', authMode: 'bearer', apiKey: '', extraHeaders: {}, tokenLimitParameter: 'max_tokens', instructionRole: 'system', requestTimeoutMs: 120000 }
