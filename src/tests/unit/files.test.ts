import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, applyChange, equalFiles, manifest, path, readText, textFile, validateExport, validateFiles } from '../../shared/files'
import { seedFiles } from '../../seed'
describe('VFS boundaries', () => {
  it.each(['', 'app/x', '/', '/a//b', '/a/../b', '/a/./b', '/a\\b', '/a\0b', '/a/'])('rejects invalid path %j', input => expect(() => path(input)).toThrow())
  it('does not URL-decode or change case-sensitive file keys', () => { expect(() => path('/a/%2e%2e/b')).not.toThrow(); const files = { '/A': textFile('first'), '/a': textFile('second') }; expect(readText(files, '/A')).toBe('first'); expect(readText(files, '/a')).toBe('second') })
  it('round-trips markup as ordinary data and keeps the original map unchanged', () => { const files = seedFiles(); const content = '</script><img onerror="bad()">'; const next = applyChange(files, { '/data/state.json': textFile(content) }, []); expect(readText(next, '/data/state.json')).toBe(content); expect(files['/data/state.json']!.content).not.toBe(content) })
  it('checks decoded sizes, base64, duplicate deletes and overlapping mutations', () => {
    expect(() => validateFiles({ '/binary': { encoding: 'base64', mediaType: 'image/png', content: 'not-base64' } })).toThrow()
    expect(() => validateFiles({ '/large': textFile('x'.repeat(MAX_FILE_BYTES + 1)) })).toThrow()
    expect(() => applyChange({}, { '/x': textFile('a') }, ['/x'])).toThrow()
    expect(() => applyChange({}, {}, ['/x', '/x'])).toThrow()
  })
  it('boots a non-Vue manifest without a hidden library requirement', () => { const files = { '/app/boot.json': textFile('{"format":1,"html":"/other.html","styles":[],"scripts":[]}'), '/other.html': textFile('<p>Different app</p>') }; expect(manifest(files).scripts).toEqual([]) })
  it('compares complete bytes independent of property ordering', () => expect(equalFiles({ '/a': textFile('a'), '/b': textFile('b') }, { '/b': textFile('b'), '/a': textFile('a') })).toBe(true))
})
describe('import graph validation', () => {
  const id = () => crypto.randomUUID()
  const make = () => { const projectId = id(), rootId = id(); return { format: 'ace-project', schemaVersion: 1, exportedAt: 1, project: { id: projectId, name: 'Test', createdAt: 1 }, workspace: { projectId, revision: 0, lastCheckpointRevision: 0, headSnapshotId: rootId, files: {} }, snapshots: [{ id: rootId, projectId, parentId: null, createdAt: 1, label: 'Root', reason: 'seed', runtimeVersion: 'ace-runtime/1', files: {} }] } }
  it('permits broken historical apps and excludes unknown host fields', () => { const value = make(); const result = validateExport({ ...value, connection: { apiKey: 'synthetic-test-only' } }); expect(result.snapshots[0]!.files).toEqual({}); expect(result).not.toHaveProperty('connection') })
  it('rejects duplicate IDs, cycles, missing head, and foreign ownership', () => {
    const duplicate = make(); duplicate.snapshots.push(duplicate.snapshots[0]!); expect(() => validateExport(duplicate)).toThrow()
    const cycle = make(), child = id(); cycle.snapshots.push({ ...cycle.snapshots[0]!, id: child, parentId: child } as any); expect(() => validateExport(cycle)).toThrow()
    const head = make(); head.workspace.headSnapshotId = id(); expect(() => validateExport(head)).toThrow()
    const foreign = make(); foreign.snapshots[0]!.projectId = id(); expect(() => validateExport(foreign)).toThrow()
  })
})
