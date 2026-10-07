import { reactive } from 'vue'
import { AceError, MAX_IMPORT_BYTES, copyFiles, inventory, manifest, object, path, readText, requireValue, textFile, validateExport } from '../shared/files'
import { DEFAULT_LIMITS, MODEL_CONNECTION_STORAGE_KEY, type Allowance, type Change, type ChatMessage, type EditOperation, type FileMap, type HostLimits, type ModelConnection, type Project, type ProjectExport, type RequestUsage, type Snapshot, type Workspace } from '../shared/types'
import { Database } from '../storage/database'
import { defaults, loadConnection, redact, saveConnection, validateLimits } from '../storage/connection'
import { Runtime } from '../runtime/manager'
import { validateRpc } from '../runtime/schema'
import { seedFiles } from '../seed'
import { ModelGateway } from '../ai/client'
import { appInstructions, conversation, runEditor } from '../ai/editor'
import { APP_AI_INSTRUCTIONS } from '../ai/instructions'
import { Diagnostics, diagnosticDetails } from '../shared/diagnostics'

interface EngineState {
  loading: boolean; writable: boolean; prompt: string; project?: Project; workspace?: Workspace; snapshots: Snapshot[]; limits: HostLimits; allowance: Allowance; usage: RequestUsage[]; connection: ModelConnection
  runtimeStatus: string; aiStatus: string; settingsError: string; error: string; errors: string[]; info: string; calls: number; tools: number; filesBusy: boolean; unsavedDraft: boolean; settingsInitially: boolean; connectionTest: string
}
export class Engine {
  state = reactive<EngineState>({ loading: true, writable: false, prompt: '', snapshots: [], limits: { ...DEFAULT_LIMITS }, allowance: { epochId: '', usedRequests: 0, resetAt: 0 }, usage: [], connection: defaults(), runtimeStatus: 'Stopped', aiStatus: 'Idle', settingsError: '', error: '', errors: [], info: '', calls: 0, tools: 0, filesBusy: false, unsavedDraft: false, settingsInitially: false, connectionTest: '' })
  private database!: Database
  private runtime?: Runtime
  private gateway!: ModelGateway
  private epoch = 0
  private operation?: EditOperation
  private releaseLock?: () => void
  private pendingDraft?: { files: FileMap; revision: number; prompt: string; model: string }
  private destroy = false
  private logs = new Diagnostics()
  get dirty() { const w = this.state.workspace; return !!w && w.revision !== w.lastCheckpointRevision }
  get busy() { return !!this.operation || this.state.filesBusy }
  get head() { return this.state.snapshots.find(x => x.id === this.state.workspace?.headSnapshotId) }
  async initialize() {
    try {
      try { this.state.connection = loadConnection() } catch (error) { this.state.settingsError = this.message(error); this.state.settingsInitially = true }
      if (!this.state.connection.model) this.state.settingsInitially = true
      if (navigator.locks) await new Promise<void>(resolve => {
        navigator.locks.request('godelbox-write-v1', { ifAvailable: true }, lock => {
          this.state.writable = !!lock; resolve()
          if (lock) return new Promise<void>(release => { this.releaseLock = release })
        }).catch(error => { this.state.error = this.message(error); resolve() })
      })
      else this.state.error = 'This browser cannot acquire the required Web Lock. Open Godelbox in desktop Chromium.'
      this.database = await Database.open()
      this.applyLoaded(await this.database.initialize(seedFiles(), this.state.writable))
      this.gateway = new ModelGateway(this.database, () => this.state.limits, () => this.refresh(), details => this.logs.record('model-request', details))
      this.logs.record('host', { message: 'Workspace loaded', revision: this.state.workspace?.revision, snapshotCount: this.state.snapshots.length })
      if (this.state.writable) navigator.storage?.persist?.().catch(() => {})
    } catch (error) { this.state.error = this.message(error) } finally { this.state.loading = false }
  }
  attach(target: HTMLElement) {
    this.runtime = new Runtime(target, (method, params, valid) => this.dispatch(method, params, valid), status => { this.state.runtimeStatus = status }, message => this.diagnostic(message))
  }
  dispose() { this.destroy = true; this.stop(); this.releaseLock?.(); this.database?.db.close() }
  private message(error: unknown, connection = this.state.connection) {
    const message = redact(error instanceof Error ? error.message : String(error), connection)
    this.logs.record('error', { message, errorCode: error instanceof AceError ? error.code : undefined })
    return message
  }
  private diagnostic(message: string) { this.state.errors = [...this.state.errors.slice(-99), this.message(message)] }
  private applyLoaded(data: Awaited<ReturnType<Database['load']>>) {
    this.state.project = data.project; this.state.workspace = data.workspace; this.state.snapshots = data.snapshots.sort((a, b) => a.createdAt - b.createdAt)
    this.state.limits = data.limits; this.state.allowance = data.allowance; this.state.usage = data.usage.sort((a, b) => b.startedAt - a.startedAt)
    if (this.operation) { this.state.calls = this.operation.calls; this.state.tools = this.operation.tools }
  }
  async refresh() { if (this.database) await this.database.run(async () => { this.applyLoaded(await this.database.load()) }) }
  private requireWriter() { requireValue(this.state.writable && !this.destroy && this.state.workspace, 'Another tab owns this workspace. Close it and reload this tab.', 'WORKSPACE_BUSY') }
  stop() {
    this.epoch++
    if (this.operation) { this.operation.abort.abort(); this.operation = undefined; this.state.aiStatus = 'Cancelled' }
    this.pendingDraft = undefined; this.state.unsavedDraft = false
    this.runtime?.stop(); this.state.runtimeStatus = 'Stopped'
    this.state.filesBusy = false
  }
  async start() {
    this.requireWriter(); requireValue(!this.busy, 'Wait for the current operation or press Stop.', 'WORKSPACE_BUSY')
    const epoch = this.epoch
    await this.database.drain(); await this.refresh()
    if (epoch !== this.epoch) return
    this.state.error = ''
    try { this.runtime?.start(this.state.workspace!.files) } catch (error) { this.state.runtimeStatus = 'Error reported'; this.state.error = this.message(error); this.diagnostic(this.state.error) }
  }
  async save(label = 'Saved version', reason: Snapshot['reason'] = 'manual', valid = () => true, onlyDirty = false) {
    this.requireWriter(); requireValue(!this.busy, 'Workspace is busy.', 'WORKSPACE_BUSY')
    this.state.filesBusy = true; const epoch = this.epoch
    try {
      await this.database.checkpoint(this.state.workspace!.projectId, reason, label || 'Saved version', onlyDirty, () => valid() && epoch === this.epoch)
      await this.refresh(); this.state.info = `Saved ${this.head?.label ?? 'version'}.`
      return { snapshotId: this.state.workspace!.headSnapshotId }
    } finally { if (epoch === this.epoch) this.state.filesBusy = false }
  }
  async restore(snapshotId: string) {
    this.requireWriter(); this.stop(); this.state.error = ''; this.state.filesBusy = true
    const epoch = this.epoch
    try {
      await this.database.restore(this.state.workspace!.projectId, snapshotId, () => this.epoch === epoch)
      await this.refresh()
      if (epoch === this.epoch) { this.state.filesBusy = false; await this.start(); this.state.info = `Restored ${this.head?.label}. Code, data, dependencies, and instructions were restored together.` }
    } finally { if (epoch === this.epoch) this.state.filesBusy = false }
  }
  async loadStarter() {
    this.requireWriter(); this.stop(); this.state.filesBusy = true
    const epoch = this.epoch, valid = () => epoch === this.epoch
    try {
      await this.database.checkpoint(this.state.workspace!.projectId, 'manual', 'Before loading universe', true, valid)
      await this.refresh()
      await this.database.commit(this.state.workspace!.projectId, seedFiles(), this.state.workspace!.revision, 'Universe starter', '', valid, 'manual')
      await this.refresh()
      if (valid()) { this.state.filesBusy = false; this.state.aiStatus = 'Idle'; await this.start(); this.state.info = 'Universe starter loaded. Earlier versions remain in History.' }
    } finally { if (valid()) this.state.filesBusy = false }
  }
  async resetProject() {
    this.requireWriter(); this.stop(); this.state.filesBusy = true
    const epoch = this.epoch, valid = () => epoch === this.epoch
    try {
      await this.database.resetProject(seedFiles(), valid); await this.refresh()
      if (valid()) {
        this.state.prompt = ''; this.state.error = ''; this.state.errors = []; this.state.aiStatus = 'Idle'; this.state.calls = 0; this.state.tools = 0
        this.state.info = 'Fresh universe created. Press Start. Your connection, limits, and request usage are unchanged.'
        this.logs.record('host', { message: 'Project reset; settings and usage retained', revision: this.state.workspace?.revision })
      }
    } finally { if (valid()) this.state.filesBusy = false }
  }
  exportDiagnostics() {
    const s = this.state, c = s.connection
    const clean = (text: string) => redact(text, c)
    return {
      format: 'godelbox-diagnostics', schemaVersion: 1, exportedAt: new Date().toISOString(),
      environment: { browser: navigator.userAgent, page: `${location.origin}${location.pathname}`, buildAsset: document.querySelector<HTMLScriptElement>('script[src]')?.getAttribute('src') },
      connection: { preset: c.preset, endpointOrigin: new URL(c.baseUrl).origin, model: clean(c.model), authMode: c.authMode, hasApiKey: !!c.apiKey, extraHeaderCount: Object.keys(c.extraHeaders).length, tokenLimitParameter: c.tokenLimitParameter, instructionRole: c.instructionRole, temperature: c.temperature, requestTimeoutMs: c.requestTimeoutMs },
      host: { writable: s.writable, runtimeStatus: s.runtimeStatus, aiStatus: s.aiStatus, calls: s.calls, tools: s.tools, error: clean(s.error), settingsError: clean(s.settingsError), runtimeErrors: s.errors.map(clean), unsavedDraft: s.unsavedDraft },
      workspace: { revision: s.workspace?.revision, headSnapshotId: s.workspace?.headSnapshotId, snapshotCount: s.snapshots.length, fileCount: Object.keys(s.workspace?.files ?? {}).length, dirty: this.dirty },
      limits: { ...s.limits }, allowance: { ...s.allowance },
      requests: s.usage.slice(0, 200).map(u => ({ id: u.id, budgetEpochId: u.budgetEpochId, startedAt: u.startedAt, editRunId: u.editRunId, source: u.source, model: clean(u.model), completionTokenCap: u.completionTokenCap, outcome: u.outcome, promptTokens: u.promptTokens, completionTokens: u.completionTokens, providerCost: u.providerCost, providerCostUnit: u.providerCostUnit === undefined ? undefined : clean(u.providerCostUnit), diagnostic: diagnosticDetails(u.diagnostic, c) })),
      events: this.logs.export(c), omitted: ['API keys', 'header values', 'request and response bodies', 'app files and data', 'prompts and conversation', 'endpoint query strings'],
    }
  }
  exportProject(draft = false): ProjectExport {
    requireValue(this.state.project && this.state.workspace, 'No project is available.')
    const files = draft && this.pendingDraft ? this.pendingDraft.files : this.state.workspace.files
    return { format: 'ace-project', schemaVersion: 1, exportedAt: Date.now(), project: { ...this.state.project }, workspace: { projectId: this.state.workspace.projectId, revision: this.state.workspace.revision, lastCheckpointRevision: this.state.workspace.lastCheckpointRevision, headSnapshotId: this.state.workspace.headSnapshotId, files: copyFiles(files) }, snapshots: this.state.snapshots.map(s => ({ id: s.id, projectId: s.projectId, parentId: s.parentId, createdAt: s.createdAt, label: s.label, reason: s.reason, runtimeVersion: s.runtimeVersion, ...(s.prompt === undefined ? {} : { prompt: s.prompt }), ...(s.model === undefined ? {} : { model: s.model }), files: copyFiles(s.files) })) }
  }
  async importProject(file: File) {
    this.requireWriter(); requireValue(file.size <= MAX_IMPORT_BYTES, 'Import file exceeds 128 MiB.', 'QUOTA_EXCEEDED')
    const data = validateExport(JSON.parse(await file.text()))
    this.stop(); this.state.filesBusy = true; const epoch = this.epoch
    try { await this.database.import(data, () => epoch === this.epoch); await this.refresh(); this.state.info = 'Project imported. Press Start when ready; your connection and usage are unchanged.' }
    finally { if (epoch === this.epoch) this.state.filesBusy = false }
  }
  async updateSettings(connection: unknown, limits: HostLimits) {
    this.requireWriter()
    const validatedLimits = validateLimits(limits)
    try {
      const saved = saveConnection(connection)
      this.state.connection = saved
      await this.database.saveLimits(validatedLimits); await this.refresh()
      this.state.settingsError = ''; this.state.info = 'Settings saved in this browser.'
    } catch (error) { this.state.settingsError = this.message(error); throw error }
  }
  clearConnection() {
    this.requireWriter(); this.stop(); this.state.connection = defaults(); this.state.connectionTest = ''
    try { localStorage.removeItem(MODEL_CONNECTION_STORAGE_KEY); this.state.settingsError = ''; this.state.info = 'Saved connection cleared. Project, history, and request usage are unchanged.' }
    catch (error) { this.state.settingsError = this.message(error); throw error }
  }
  async resetAllowance() { this.requireWriter(); requireValue(!this.busy, 'Stop AI activity before resetting the allowance.', 'AI_BUSY'); this.applyLoaded(await this.database.resetAllowance()); this.state.info = 'Request allowance reset. Previous usage records remain available.' }
  private newOperation(): EditOperation {
    this.requireWriter(); requireValue(!this.operation, 'Another AI operation is active.', 'AI_BUSY')
    const operation: EditOperation = { id: crypto.randomUUID(), abort: new AbortController(), connection: { ...this.state.connection, extraHeaders: { ...this.state.connection.extraHeaders } }, calls: 0, tools: 0, current: () => this.operation === operation && !operation.abort.signal.aborted && !this.destroy }
    this.operation = operation; this.state.calls = 0; this.state.tools = 0; return operation
  }
  async edit(prompt: string, ignore = false) {
    this.requireWriter(); requireValue(prompt.trim(), 'Enter a prompt.')
    this.stop(); const operation = this.newOperation(); this.state.error = ''; this.state.aiStatus = 'Calling model'; this.state.info = ''
    try {
      await this.database.checkpoint(this.state.workspace!.projectId, 'before-edit', 'Before edit', true, operation.current)
      await this.refresh(); requireValue(operation.current(), 'Edit cancelled.', 'SESSION_EXPIRED')
      const base = copyFiles(this.state.workspace!.files), revision = this.state.workspace!.revision
      const result = await runEditor(this.gateway, operation, base, prompt, ignore, { ...this.state.limits }, this.state.errors, (status, info) => { if (operation.current()) { this.state.aiStatus = status; this.state.calls = operation.calls; this.state.tools = operation.tools; if (info) this.state.info = info } }, () => this.diagnostic('The conversation file was missing or invalid; this successful edit starts a fresh conversation array.'))
      requireValue(operation.current(), 'Edit cancelled.', 'SESSION_EXPIRED'); this.state.aiStatus = 'Saving'
      try { await this.database.commit(this.state.workspace!.projectId, result.files, revision, prompt, operation.connection.model, operation.current) }
      catch (error) {
        if (operation.current() && !(error instanceof AceError)) { this.pendingDraft = { files: result.files, revision, prompt, model: operation.connection.model }; this.state.unsavedDraft = true }
        throw error
      }
      await this.refresh()
      if (operation.current()) {
        const appChanges = result.changed.filter(name => name !== '/agent/conversation.json')
        this.state.aiStatus = 'Idle'; this.state.info = appChanges.length ? `Saved “${this.head?.label}”. Changed files: ${appChanges.join(', ')}.` : 'No app changes made. Only the editor conversation was saved. Your app remains unchanged.'
        this.operation = undefined
        await this.start()
        return appChanges.length > 0
      }
    } catch (error) { if (operation.current()) { this.state.aiStatus = 'Failed'; this.state.error = this.message(error, operation.connection) } }
    finally { if (this.operation === operation) { this.state.calls = operation.calls; this.state.tools = operation.tools; this.operation = undefined } }
    return false
  }
  async retryDraft() {
    const draft = this.pendingDraft; requireValue(draft, 'No unsaved edit is available.')
    const operation = this.newOperation(); this.state.aiStatus = 'Saving'
    try {
      await this.database.commit(this.state.workspace!.projectId, draft.files, draft.revision, draft.prompt, draft.model, operation.current)
      await this.refresh()
      if (operation.current()) { this.pendingDraft = undefined; this.state.unsavedDraft = false; this.state.error = ''; this.state.aiStatus = 'Idle'; this.operation = undefined; await this.start() }
    } finally { if (this.operation === operation) this.operation = undefined }
  }
  async models() {
    this.requireWriter(); const operation = this.newOperation(); this.state.aiStatus = 'Calling model'
    const timer = setTimeout(() => operation.abort.abort(), operation.connection.requestTimeoutMs)
    try {
      const response = await fetch(`${operation.connection.baseUrl}/models`, { credentials: 'omit', signal: operation.abort.signal, headers: { ...(operation.connection.authMode === 'bearer' ? { Authorization: `Bearer ${operation.connection.apiKey}` } : {}), ...operation.connection.extraHeaders } })
      requireValue(response.ok && operation.current(), `Model discovery failed (HTTP ${response.status}). Enter a model ID manually.`)
      const data: unknown = await response.json(); requireValue(object(data) && Array.isArray(data.data), 'Model listing did not contain data[].id. Enter a model ID manually.')
      return data.data.filter(x => object(x) && typeof x.id === 'string').map(x => x.id as string)
    } catch (error) { throw new AceError('AI_REQUEST_FAILED', 'Could not load models. Enter a model ID manually; direct browser access requires endpoint CORS support.') }
    finally { clearTimeout(timer); if (this.operation === operation) { this.operation = undefined; this.state.aiStatus = 'Idle' } }
  }
  async testConnection() {
    const operation = this.newOperation(); this.state.aiStatus = 'Calling model'; this.state.connectionTest = 'Testing HTTP/chat connectivity…'
    const tool = { type: 'function', function: { name: 'ace_echo', description: 'Echo the string hello to verify tool calling.', parameters: { type: 'object', properties: { text: { type: 'string', enum: ['hello'] } }, required: ['text'], additionalProperties: false } } }
    const messages: ChatMessage[] = [{ role: operation.connection.instructionRole, content: 'Call ace_echo exactly once with text hello, then after receiving its tool result reply with a short confirmation. Do not call any other tool.' }, { role: 'user', content: 'Test your tool calling using ace_echo.' }]
    try {
      const first = await this.gateway.request(operation, messages, 'connection-test', [tool], Math.min(1024, this.state.limits.maxCompletionTokensPerRequest))
      this.state.connectionTest = 'HTTP/chat connectivity passed. Verifying tool round-trip…'
      const calls = first.message.tool_calls
      requireValue(operation.current() && first.finish_reason === 'tool_calls' && calls?.length === 1 && calls[0]?.function.name === 'ace_echo', 'HTTP/chat passed; the model did not call ace_echo correctly.')
      const args: unknown = JSON.parse(calls[0].function.arguments)
      requireValue(object(args) && args.text === 'hello' && Object.keys(args).length === 1, 'HTTP/chat passed; echo arguments were invalid.')
      messages.push(first.message, { role: 'tool', tool_call_id: calls[0].id, content: JSON.stringify({ text: 'hello' }) })
      const final = await this.gateway.request(operation, messages, 'connection-test', [tool], Math.min(1024, this.state.limits.maxCompletionTokensPerRequest))
      requireValue(operation.current() && final.finish_reason === 'stop' && !final.message.tool_calls?.length && typeof final.message.content === 'string', 'HTTP/chat passed; the model did not complete the tool round-trip.')
      this.state.connectionTest = 'HTTP/chat connectivity passed. Tool round-trip passed (2 accounted requests).'; this.state.aiStatus = 'Idle'
    } catch (error) { if (operation.current()) { this.state.connectionTest += `\n${this.message(error, operation.connection)}`; this.state.aiStatus = 'Failed' } }
    finally { if (this.operation === operation) this.operation = undefined }
  }
  private async dispatch(method: string, params: unknown, valid: () => boolean): Promise<unknown> {
    requireValue(valid(), 'Runtime expired.', 'SESSION_EXPIRED'); validateRpc(method, params)
    this.requireWriter()
    const workspace = this.state.workspace!
    if (method === 'runtime.ready') { this.runtime?.ready(); return }
    if (method === 'runtime.error') { this.runtime?.error(params.message); return }
    if (method === 'runtime.requestEdit') {
      requireValue(!this.busy, 'Wait for the current operation or press Stop.', 'WORKSPACE_BUSY')
      requireValue(navigator.userActivation?.isActive, 'Submit a change with a click or keyboard action.', 'USER_ACTION_REQUIRED')
      requireValue(params.prompt.trim(), 'Enter a prompt.')
      const prompt = params.prompt.trim(); this.state.prompt = prompt
      requireValue(this.state.connection.model && (this.state.connection.authMode === 'none' || this.state.connection.apiKey), 'Open host Settings and save your model connection, then send this prompt.', 'AI_REQUEST_FAILED')
      if (await this.edit(prompt) && this.state.prompt === prompt) this.state.prompt = ''
      return
    }
    if (method === 'fs.list') return inventory(workspace.files, params.prefix)
    if (method === 'fs.getRevision') return workspace.revision
    if (method === 'fs.readText') return readText(workspace.files, params.path)
    if (method === 'fs.readFile') { path(params.path); requireValue(workspace.files[params.path], `Missing file ${params.path}`, 'NOT_FOUND'); return { ...workspace.files[params.path] } }
    if (method.startsWith('fs.')) {
      requireValue(!this.busy, 'Workspace is busy; write was not saved.', 'WORKSPACE_BUSY')
      const change: Change = method === 'fs.batch' ? params as unknown as Change : { writes: method === 'fs.writeText' ? { [params.path]: textFile(params.content, params.mediaType) } : method === 'fs.writeFile' ? { [params.path]: params.file } : {}, deletes: method === 'fs.deleteFile' ? [params.path] : [] }
      const next = await this.database.write(workspace.projectId, change, valid)
      this.state.workspace = next
      return method === 'fs.batch' ? { revision: next.revision } : undefined
    }
    if (method === 'versions.checkpoint') return this.save(params.label ?? 'App checkpoint', 'app', valid)
    if (method === 'runtime.restart') {
      requireValue(!this.busy, 'Workspace is busy.', 'WORKSPACE_BUSY'); this.stop(); const epoch = this.epoch; this.state.filesBusy = true
      try { await this.database.checkpoint(workspace.projectId, 'restart', 'Before restart', true, () => epoch === this.epoch); await this.refresh(); if (epoch === this.epoch) { this.state.filesBusy = false; await this.start() } }
      finally { if (epoch === this.epoch) this.state.filesBusy = false }
      return
    }
    if (method === 'ai.request') {
      requireValue(!this.busy, 'Another AI operation is active.', 'AI_BUSY')
      const operation = this.newOperation(), current = operation.current
      operation.current = () => current() && valid(); this.state.aiStatus = 'Calling model'
      try {
        const reply = await this.gateway.request(operation, [{ role: operation.connection.instructionRole, content: `${APP_AI_INSTRUCTIONS}\nApp behavioral instructions:\n${appInstructions(workspace.files)}` }, ...params.messages], 'app', undefined, params.maxOutputTokens)
        requireValue(operation.current() && reply.finish_reason === 'stop' && !reply.message.tool_calls?.length && typeof reply.message.content === 'string', 'App text request did not complete.', 'AI_REQUEST_FAILED')
        return { text: redact(reply.message.content, operation.connection) }
      } finally { if (this.operation === operation) { this.operation = undefined; this.state.aiStatus = 'Idle' } }
    }
    throw new AceError('INVALID_REQUEST', 'Unknown runtime operation.')
  }
  report(error: unknown) { this.state.error = this.message(error) }
  clearErrors() { this.state.errors = [] }
  completedConversation() { return this.state.workspace ? conversation(this.state.workspace.files) : [] }
}
