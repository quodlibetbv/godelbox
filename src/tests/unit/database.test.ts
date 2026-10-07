import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Database } from '../../storage/database'
import { copyFiles, readText, textFile, validateExport } from '../../shared/files'
import { seedFiles } from '../../seed'
import type { ProjectExport } from '../../shared/types'
let db: Database
beforeEach(async () => { db = await Database.open(`test-${crypto.randomUUID()}`); await db.initialize(seedFiles(), true) })
afterEach(() => db.db.close())
describe('atomic storage and immutable history', () => {
  it('saves dirty work on restore, preserves branches, and increases revision', async () => {
    const original = await db.load(), pid = original.project!.id, root = original.workspace!.headSnapshotId
    await db.write(pid, { writes: { '/data/state.json': textFile('B') }, deletes: [] }, () => true)
    const b = await db.checkpoint(pid, 'manual', 'B')
    await db.write(pid, { writes: { '/data/state.json': textFile('dirty') }, deletes: [] }, () => true)
    const restored = await db.restore(pid, root, () => true)
    expect(readText(restored.files, '/data/state.json')).toBe(readText(original.workspace!.files, '/data/state.json'))
    expect(restored.revision).toBeGreaterThan(b.revision)
    const c = await db.checkpoint(pid, 'manual', 'C')
    const state = await db.load()
    expect(state.snapshots.find(s => s.id === c.headSnapshotId)!.parentId).toBe(root)
    expect(state.snapshots.some(s => s.id === b.headSnapshotId)).toBe(true)
    expect(state.snapshots.find(s => s.reason === 'before-restore')!.files['/data/state.json']!.content).toBe('dirty')
  })
  it('rejects stale batches, revoked writes, and stale draft commits without changing files', async () => {
    const before = await db.load(), pid = before.project!.id
    await expect(db.write(pid, { expectedRevision: 100, writes: { '/x': textFile('bad') }, deletes: [] }, () => true)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    await expect(db.write(pid, { writes: { '/x': textFile('bad') }, deletes: [] }, () => false)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
    await expect(db.commit(pid, before.workspace!.files, 100, 'test', 'synthetic-model', () => true)).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect((await db.load()).workspace).toEqual(before.workspace)
  })
  it('does not persist a partial write when IndexedDB aborts', async () => {
    const before = await db.load(), transaction = db.db.transaction.bind(db.db)
    const spy = vi.spyOn(db.db, 'transaction').mockImplementation((...args: any[]) => {
      const tx = (transaction as any)(...args)
      if (args[1] === 'readwrite') { void tx.done.catch(() => {}); tx.abort() }
      return tx
    })
    await expect(db.write(before.project!.id, { writes: { '/x': textFile('bad') }, deletes: [] }, () => true)).rejects.toThrow()
    spy.mockRestore(); expect((await db.load()).workspace).toEqual(before.workspace)
  })
  it('accounts failed and pending requests independently of restored/imported projects', async () => {
    const initial = await db.load(), pid = initial.project!.id
    const first = await db.reserve('editor', 'synthetic-model', 10, 'run', () => true); await db.finishUsage(first.id, 'failed')
    await db.reserve('app', 'synthetic-model', 10, 'run', () => true)
    await db.restore(pid, initial.workspace!.headSnapshotId, () => true)
    const payload: ProjectExport = { format: 'ace-project', schemaVersion: 1, exportedAt: 1, project: initial.project!, workspace: initial.workspace!, snapshots: initial.snapshots }
    await db.import(validateExport(payload), () => true)
    await db.initialize(seedFiles(), true)
    const after = await db.load(); expect(after.allowance.usedRequests).toBe(2); expect(after.usage.map(u => u.outcome).sort()).toEqual(['failed', 'unknown'])
    await db.resetAllowance(); expect((await db.load()).allowance.usedRequests).toBe(0); expect((await db.load()).usage).toHaveLength(2)
  })
  it('imports dirty working files using a fresh local revision, preserving usage and limits', async () => {
    const initial = await db.load()
    const files = copyFiles(initial.workspace!.files); files['/data/extra.txt'] = textFile('dirty')
    const payload = validateExport({ format: 'ace-project', schemaVersion: 1, exportedAt: 1, project: initial.project, workspace: { ...initial.workspace, files, revision: 999, lastCheckpointRevision: 999 }, snapshots: initial.snapshots })
    const imported = await db.import(payload, () => true)
    expect(imported.revision).toBe(1); expect(imported.lastCheckpointRevision).toBe(0); expect(imported.files['/data/extra.txt']!.content).toBe('dirty')
  })
})
