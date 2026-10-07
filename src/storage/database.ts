import { openDB, type IDBPDatabase } from 'idb'
import { AceError, applyChange, copyFiles, equalFiles, requireValue, validateFiles } from '../shared/files'
import { DEFAULT_LIMITS, type Allowance, type Change, type FileMap, type HostLimits, type Project, type ProjectExport, type RequestUsage, type Snapshot, type SnapshotReason, type Workspace } from '../shared/types'

export class Database {
  private queue: Promise<unknown> = Promise.resolve()
  private constructor(public db: IDBPDatabase) {}
  static async open(name = 'godelbox-v1') {
    const db = await openDB(name, 1, { upgrade(db) {
      db.createObjectStore('projects', { keyPath: 'id' })
      db.createObjectStore('workspaces', { keyPath: 'projectId' })
      const snapshots = db.createObjectStore('snapshots', { keyPath: 'id' })
      snapshots.createIndex('projectId', 'projectId'); snapshots.createIndex('parentId', 'parentId')
      db.createObjectStore('settings', { keyPath: 'key' }); db.createObjectStore('usage', { keyPath: 'id' })
    } })
    return new Database(db)
  }
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => {})
    return result
  }
  async drain() { await this.queue }
  private snapshot(workspace: Workspace, reason: SnapshotReason, label: string, extras: { prompt?: string; model?: string } = {}): Snapshot {
    return { id: crypto.randomUUID(), projectId: workspace.projectId, parentId: workspace.headSnapshotId || null, createdAt: Date.now(), label: label.slice(0, 200), reason, runtimeVersion: 'ace-runtime/1', ...extras, files: copyFiles(workspace.files) }
  }
  async initialize(files: FileMap, writable: boolean) {
    return this.run(async () => {
      const existing: Project[] = await this.db.getAll('projects')
      if (!existing.length && writable) {
        validateFiles(files)
        const project: Project = { id: crypto.randomUUID(), name: 'Godelbox', createdAt: Date.now() }
        const workspace: Workspace = { projectId: project.id, revision: 0, lastCheckpointRevision: 0, headSnapshotId: '', files: copyFiles(files) }
        const snapshot = this.snapshot(workspace, 'seed', 'First version'); workspace.headSnapshotId = snapshot.id
        const tx = this.db.transaction(['projects', 'workspaces', 'snapshots', 'settings'], 'readwrite'); void tx.done.catch(() => {})
        await Promise.all([tx.objectStore('projects').put(project), tx.objectStore('workspaces').put(workspace), tx.objectStore('snapshots').add(snapshot), tx.objectStore('settings').put({ key: 'limits', value: DEFAULT_LIMITS }), tx.objectStore('settings').put({ key: 'allowance', value: { epochId: crypto.randomUUID(), usedRequests: 0, resetAt: Date.now() } })])
        await tx.done
      }
      if (writable) {
        const tx = this.db.transaction('usage', 'readwrite'); void tx.done.catch(() => {})
        for (const usage of await tx.store.getAll() as RequestUsage[]) if (usage.outcome === 'pending') await tx.store.put({ ...usage, outcome: 'unknown' })
        await tx.done
      }
      return this.load()
    })
  }
  async load() {
    const tx = this.db.transaction(['projects', 'workspaces', 'snapshots', 'settings', 'usage']); void tx.done.catch(() => {})
    const projects = await tx.objectStore('projects').getAll() as Project[]
    const project = projects[0]
    const workspace = project ? await tx.objectStore('workspaces').get(project.id) as Workspace : undefined
    const snapshots = project ? await tx.objectStore('snapshots').index('projectId').getAll(project.id) as Snapshot[] : []
    const limits = (await tx.objectStore('settings').get('limits'))?.value as HostLimits | undefined
    const allowance = (await tx.objectStore('settings').get('allowance'))?.value as Allowance | undefined
    const usage = await tx.objectStore('usage').getAll() as RequestUsage[]
    await tx.done
    return { project, workspace, snapshots, limits: limits ?? { ...DEFAULT_LIMITS }, allowance: allowance ?? { epochId: '', usedRequests: 0, resetAt: 0 }, usage }
  }
  write(projectId: string, change: Change, valid: () => boolean) {
    return this.run(async () => {
      requireValue(valid(), 'Runtime session expired.', 'SESSION_EXPIRED')
      const tx = this.db.transaction('workspaces', 'readwrite'); void tx.done.catch(() => {})
      try {
        const current = await tx.store.get(projectId) as Workspace
        requireValue(valid(), 'Runtime session expired.', 'SESSION_EXPIRED')
        requireValue(change.expectedRevision === undefined || change.expectedRevision === current.revision, 'The filesystem changed; read its revision and retry.', 'REVISION_CONFLICT')
        const workspace = { ...current, revision: current.revision + 1, files: applyChange(current.files, change.writes, change.deletes) }
        await tx.store.put(workspace); await tx.done
        return workspace
      } catch (error) { try { tx.abort() } catch {} await tx.done.catch(() => {}); throw error }
    })
  }
  checkpoint(projectId: string, reason: SnapshotReason, label: string, onlyDirty = false, valid = () => true) {
    return this.run(async () => {
      requireValue(valid(), 'Operation cancelled.', 'SESSION_EXPIRED')
      const tx = this.db.transaction(['workspaces', 'snapshots'], 'readwrite'); void tx.done.catch(() => {})
      try {
        const workspace = await tx.objectStore('workspaces').get(projectId) as Workspace
        requireValue(valid(), 'Operation cancelled.', 'SESSION_EXPIRED')
        if (onlyDirty && workspace.revision === workspace.lastCheckpointRevision) { await tx.done; return workspace }
        const snapshot = this.snapshot(workspace, reason, label)
        workspace.headSnapshotId = snapshot.id; workspace.lastCheckpointRevision = workspace.revision
        await tx.objectStore('snapshots').add(snapshot); await tx.objectStore('workspaces').put(workspace); await tx.done
        return workspace
      } catch (error) { try { tx.abort() } catch {} await tx.done.catch(() => {}); throw error }
    })
  }
  restore(projectId: string, snapshotId: string, valid: () => boolean) {
    return this.run(async () => {
      const tx = this.db.transaction(['workspaces', 'snapshots'], 'readwrite'); void tx.done.catch(() => {})
      try {
        const current = await tx.objectStore('workspaces').get(projectId) as Workspace
        const selected = await tx.objectStore('snapshots').get(snapshotId) as Snapshot | undefined
        requireValue(selected && selected.projectId === projectId, 'Version not found.', 'NOT_FOUND')
        requireValue(valid(), 'Restore cancelled.', 'SESSION_EXPIRED')
        if (current.revision !== current.lastCheckpointRevision) await tx.objectStore('snapshots').add(this.snapshot(current, 'before-restore', 'Before restore'))
        const workspace = { ...current, revision: current.revision + 1, lastCheckpointRevision: current.revision + 1, headSnapshotId: selected.id, files: copyFiles(selected.files) }
        await tx.objectStore('workspaces').put(workspace); await tx.done
        return workspace
      } catch (error) { try { tx.abort() } catch {} await tx.done.catch(() => {}); throw error }
    })
  }
  commit(projectId: string, files: FileMap, revision: number, prompt: string, model: string, valid: () => boolean, reason: 'ai-edit' | 'manual' = 'ai-edit') {
    validateFiles(files)
    const plain = copyFiles(files)
    return this.run(async () => {
      const tx = this.db.transaction(['workspaces', 'snapshots'], 'readwrite'); void tx.done.catch(() => {})
      try {
        const workspace = await tx.objectStore('workspaces').get(projectId) as Workspace
        requireValue(valid(), 'Edit cancelled.', 'SESSION_EXPIRED')
        requireValue(workspace.revision === revision, 'Edit base revision is stale.', 'REVISION_CONFLICT')
        workspace.files = plain; workspace.revision++; workspace.lastCheckpointRevision = workspace.revision
        const snapshot = this.snapshot(workspace, reason, prompt.slice(0, 80), reason === 'ai-edit' ? { prompt, model } : {}); workspace.headSnapshotId = snapshot.id
        await tx.objectStore('snapshots').add(snapshot); await tx.objectStore('workspaces').put(workspace); await tx.done
        return workspace
      } catch (error) { try { tx.abort() } catch {} await tx.done.catch(() => {}); throw error }
    })
  }
  import(data: ProjectExport, valid: () => boolean) {
    return this.run(async () => {
      const tx = this.db.transaction(['projects', 'workspaces', 'snapshots'], 'readwrite'); void tx.done.catch(() => {})
      try {
        const previous = await tx.objectStore('workspaces').getAll() as Workspace[]
        requireValue(valid(), 'Import cancelled.', 'SESSION_EXPIRED')
        const revision = Math.max(0, ...previous.map(w => w.revision)) + 1
        const head = data.snapshots.find(s => s.id === data.workspace.headSnapshotId)!
        const workspace = { ...data.workspace, files: copyFiles(data.workspace.files), revision, lastCheckpointRevision: equalFiles(data.workspace.files, head.files) ? revision : revision - 1 }
        await tx.objectStore('projects').clear(); await tx.objectStore('workspaces').clear(); await tx.objectStore('snapshots').clear()
        await tx.objectStore('projects').add({ ...data.project }); await tx.objectStore('workspaces').add(workspace)
        for (const snapshot of data.snapshots) await tx.objectStore('snapshots').add({ ...snapshot, files: copyFiles(snapshot.files) })
        await tx.done; return workspace
      } catch (error) { try { tx.abort() } catch {} await tx.done.catch(() => {}); throw error }
    })
  }
  reserve(source: RequestUsage['source'], model: string, cap: number, editRunId: string, valid: () => boolean) {
    return this.run(async () => {
      const tx = this.db.transaction(['settings', 'usage'], 'readwrite'); void tx.done.catch(() => {})
      try {
        const allowance = (await tx.objectStore('settings').get('allowance')).value as Allowance
        const limits = (await tx.objectStore('settings').get('limits')).value as HostLimits
        requireValue(valid(), 'AI operation cancelled.', 'SESSION_EXPIRED')
        requireValue(allowance.usedRequests < limits.maxRequestsSinceReset, 'Request allowance exhausted. Reset it explicitly in Settings.', 'AI_LIMIT_REACHED')
        const usage: RequestUsage = { id: crypto.randomUUID(), budgetEpochId: allowance.epochId, startedAt: Date.now(), editRunId, source, model, completionTokenCap: cap, outcome: 'pending' }
        allowance.usedRequests++
        await tx.objectStore('settings').put({ key: 'allowance', value: allowance }); await tx.objectStore('usage').add(usage); await tx.done
        return usage
      } catch (error) { try { tx.abort() } catch {} await tx.done.catch(() => {}); throw error }
    })
  }
  finishUsage(id: string, outcome: RequestUsage['outcome'], metadata: Partial<RequestUsage> = {}) {
    return this.run(async () => {
      const tx = this.db.transaction('usage', 'readwrite'); void tx.done.catch(() => {})
      const usage = await tx.store.get(id) as RequestUsage
      await tx.store.put({ ...usage, ...metadata, outcome }); await tx.done
    })
  }
  saveLimits(limits: HostLimits) { return this.run(async () => { await this.db.put('settings', { key: 'limits', value: { ...limits } }) }) }
  resetAllowance() { return this.run(async () => { await this.db.put('settings', { key: 'allowance', value: { epochId: crypto.randomUUID(), usedRequests: 0, resetAt: Date.now() } }); return this.load() }) }
}
