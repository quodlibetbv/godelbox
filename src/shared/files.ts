import type { FileMap, ProjectExport, SnapshotReason, VirtualFile } from './types'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_FILES_BYTES = 32 * 1024 * 1024
export const MAX_IMPORT_BYTES = 128 * 1024 * 1024
export class AceError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'AceError' }
}
export function requireValue(condition: unknown, message: string, code = 'INVALID_REQUEST'): asserts condition {
  if (!condition) throw new AceError(code, message)
}
export function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) }
export function path(value: unknown): asserts value is string {
  requireValue(typeof value === 'string' && value.startsWith('/') && value.length > 1 && !/[\\\0]/.test(value) && !value.endsWith('/') && value.split('/').slice(1).every(part => part && part !== '.' && part !== '..'), 'Use an absolute VFS file path, without empty, dot, or backslash segments.', 'INVALID_PATH')
}
export function prefix(value: unknown): asserts value is string {
  requireValue(typeof value === 'string', 'Invalid file prefix.', 'INVALID_PATH')
  if (value === '/' || value === '') return
  path(value.endsWith('/') ? value.slice(0, -1) : value)
}
export function fileBytes(file: VirtualFile): number {
  if (file.encoding === 'utf8') return new TextEncoder().encode(file.content).length
  try {
    const decoded = atob(file.content)
    requireValue(btoa(decoded) === file.content, 'Invalid canonical base64.')
    return decoded.length
  } catch { throw new AceError('INVALID_REQUEST', 'Invalid base64 file content.') }
}
export function validateFile(value: unknown): asserts value is VirtualFile {
  requireValue(object(value) && Object.keys(value).every(key => ['encoding', 'mediaType', 'content'].includes(key)) && ['utf8', 'base64'].includes(String(value.encoding)) && typeof value.mediaType === 'string' && value.mediaType.length > 0 && value.mediaType.length <= 200 && typeof value.content === 'string', 'Invalid virtual file.')
  requireValue(fileBytes(value as unknown as VirtualFile) <= MAX_FILE_BYTES, 'File exceeds the 10 MiB limit.', 'QUOTA_EXCEEDED')
}
export function validateFiles(value: unknown): asserts value is FileMap {
  requireValue(object(value), 'Invalid filesystem.')
  let total = 0
  for (const [name, file] of Object.entries(value)) { path(name); validateFile(file); total += fileBytes(file) }
  requireValue(total <= MAX_FILES_BYTES, 'Filesystem exceeds the 32 MiB limit.', 'QUOTA_EXCEEDED')
}
export function copyFiles(files: FileMap): FileMap { return Object.fromEntries(Object.entries(files).map(([key, value]) => [key, { ...value }])) }
export function textFile(content: string, mediaType = 'text/plain'): VirtualFile { return { encoding: 'utf8', mediaType, content } }
export function readText(files: FileMap, name: string): string {
  path(name)
  const file = files[name]
  requireValue(file, `File not found: ${name}`, 'NOT_FOUND')
  requireValue(file.encoding === 'utf8', `Not a text file: ${name}`, 'BINARY_FILE')
  return file.content
}
export function inventory(files: FileMap, filter = '') {
  prefix(filter)
  return Object.keys(files).filter(name => name.startsWith(filter)).sort().map(name => ({ path: name, encoding: files[name]!.encoding, mediaType: files[name]!.mediaType, byteLength: fileBytes(files[name]!) }))
}
export function equalFiles(a: FileMap, b: FileMap): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => b[key] && a[key]!.encoding === b[key]!.encoding && a[key]!.mediaType === b[key]!.mediaType && a[key]!.content === b[key]!.content)
}
export function applyChange(files: FileMap, writes: FileMap, deletes: string[]): FileMap {
  validateFiles(writes)
  requireValue(Array.isArray(deletes) && new Set(deletes).size === deletes.length, 'Duplicate delete targets.')
  const next = copyFiles(files)
  for (const name of deletes) { path(name); requireValue(!Object.hasOwn(writes, name), 'A file cannot be written and deleted in the same batch.'); delete next[name] }
  for (const [name, file] of Object.entries(writes)) next[name] = { ...file }
  validateFiles(next)
  return next
}
export interface BootManifest { format: 1; html: string; styles: string[]; scripts: string[] }
export function manifest(files: FileMap): BootManifest {
  let boot: unknown
  try { boot = JSON.parse(readText(files, '/app/boot.json')) } catch (error) { throw new AceError('INVALID_REQUEST', `Cannot load /app/boot.json: ${error instanceof Error ? error.message : 'invalid JSON'}`) }
  requireValue(object(boot) && boot.format === 1 && typeof boot.html === 'string' && Array.isArray(boot.styles) && Array.isArray(boot.scripts) && Object.keys(boot).every(key => ['format', 'html', 'styles', 'scripts'].includes(key)), 'Boot manifest needs format 1, html, styles, and scripts.')
  for (const name of [boot.html, ...boot.styles, ...boot.scripts]) { path(name); readText(files, name) }
  return boot as unknown as BootManifest
}

const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const reasons: SnapshotReason[] = ['seed', 'manual', 'before-edit', 'ai-edit', 'before-restore', 'restart', 'app']
export function validateExport(value: unknown): ProjectExport {
  requireValue(object(value) && value.format === 'ace-project' && value.schemaVersion === 1 && object(value.project) && object(value.workspace) && Array.isArray(value.snapshots), 'Unsupported project export.')
  const { project, workspace, snapshots } = value
  requireValue(uuid(project.id) && typeof project.name === 'string' && Number.isFinite(project.createdAt) && Number.isFinite(value.exportedAt), 'Invalid project identity.')
  requireValue(workspace.projectId === project.id && Number.isSafeInteger(workspace.revision) && Number(workspace.revision) >= 0 && Number.isSafeInteger(workspace.lastCheckpointRevision) && Number(workspace.lastCheckpointRevision) >= 0 && Number(workspace.lastCheckpointRevision) <= Number(workspace.revision), 'Invalid workspace.')
  validateFiles(workspace.files)
  const ids = new Map<string, Record<string, unknown>>()
  for (const snapshot of snapshots) {
    requireValue(object(snapshot) && uuid(snapshot.id) && !ids.has(String(snapshot.id)) && snapshot.projectId === project.id && (snapshot.parentId === null || uuid(snapshot.parentId)) && snapshot.runtimeVersion === 'ace-runtime/1' && reasons.includes(snapshot.reason as SnapshotReason) && typeof snapshot.label === 'string' && Number.isFinite(snapshot.createdAt) && (snapshot.prompt === undefined || typeof snapshot.prompt === 'string') && (snapshot.model === undefined || typeof snapshot.model === 'string'), 'Invalid snapshot record or duplicate ID.')
    validateFiles(snapshot.files)
    ids.set(String(snapshot.id), snapshot)
  }
  requireValue(ids.has(String(workspace.headSnapshotId)) && [...ids.values()].filter(item => item.parentId === null).length === 1, 'History needs one root and a valid head.')
  const finished = new Set<string>()
  for (const id of ids.keys()) {
    const chain = new Set<string>(); let cursor: string | null = id
    while (cursor !== null && !finished.has(cursor)) {
      requireValue(ids.has(cursor) && !chain.has(cursor), 'History has a missing parent or a cycle.')
      chain.add(cursor); cursor = ids.get(cursor)!.parentId as string | null
    }
    for (const key of chain) finished.add(key)
  }
  // Reconstruct an explicit allowlist; never carry imported host configuration into storage.
  return {
    format: 'ace-project', schemaVersion: 1, exportedAt: Number(value.exportedAt),
    project: { id: String(project.id), name: String(project.name), createdAt: Number(project.createdAt) },
    workspace: { projectId: String(project.id), revision: Number(workspace.revision), lastCheckpointRevision: Number(workspace.lastCheckpointRevision), headSnapshotId: String(workspace.headSnapshotId), files: copyFiles(workspace.files) },
    snapshots: [...ids.values()].map(s => ({ id: String(s.id), projectId: String(s.projectId), parentId: s.parentId as string | null, createdAt: Number(s.createdAt), label: String(s.label), reason: s.reason as SnapshotReason, runtimeVersion: 'ace-runtime/1', ...(s.prompt !== undefined ? { prompt: String(s.prompt) } : {}), ...(s.model !== undefined ? { model: String(s.model) } : {}), files: copyFiles(s.files as FileMap) })),
  }
}
