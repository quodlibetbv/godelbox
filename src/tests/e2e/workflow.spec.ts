import { test, expect } from '@playwright/test'
import { MOCK, appFrame, boot, calls, change, closePanel, configure, mockEditor, reply, restore, saveVersion, saved, start, state } from './helpers'

test('A04/A17: no-key counter fixture, acknowledged persistence, stopped reload, markup stays data', async ({ page }) => {
  const requests: string[] = []; page.on('request', r => requests.push(r.url()))
  await boot(page); const app = await start(page)
  await expect(app.getByRole('heading', { name: 'My adaptive app' })).toBeVisible()
  await app.getByRole('button', { name: 'Increase counter' }).click()
  await app.getByRole('textbox', { name: 'A note to keep' }).fill('</script><strong>This is data</strong>'); await saved(page)
  expect((await state(page)).snapshots).toHaveLength(1)
  await page.reload(); await closePanel(page); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped'); expect(page.frames()).toHaveLength(1)
  const restored = await start(page); await expect(restored.getByRole('textbox', { name: 'A note to keep' })).toHaveValue('</script><strong>This is data</strong>')
  await expect(restored.getByLabel('Counter value')).toHaveText('1')
  expect(requests.some(url => url.includes('chat/completions'))).toBe(false)
})
test('A03/A05/A27/A29: real file-tool workflow from static build, connection options and no credential export', async ({ page }) => {
  await boot(page); await configure(page); const mock = await mockEditor(page); const app = await start(page)
  await app.getByRole('textbox', { name: 'A note to keep' }).fill('Keep my note'); await saved(page)
  await change(page, 'Add a reset button without losing my note.')
  await expect(page.frameLocator('iframe').getByRole('button', { name: 'Reset counter' })).toBeVisible()
  await expect(page.frameLocator('iframe').getByRole('textbox', { name: 'A note to keep' })).toHaveValue('Keep my note')
  expect(mock.count()).toBe(3); expect(mock.bodies[0]).toHaveProperty('max_completion_tokens'); expect(mock.bodies[0]).not.toHaveProperty('max_tokens'); expect(mock.bodies[0]!.messages[0].role).toBe('developer')
  expect(mock.bodies[1]!.messages.some((m: any) => m.reasoning_details)).toBe(true)
  const data = await state(page); expect(data.snapshots.some(s => s.reason === 'ai-edit')).toBe(true); expect(data.settings.find(s => s.key === 'allowance').value.usedRequests).toBe(3)
  expect(JSON.stringify(data)).not.toContain('synthetic-test-only'); expect(JSON.stringify(data)).not.toContain('synthetic-header')
  await page.reload(); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped'); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page.getByLabel('API key', { exact: true })).toHaveValue('synthetic-test-only'); await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-model')
})
test('A06/A07/A08/A19: full restore preserves dirty state and branches, export/import keeps usage', async ({ page }) => {
  await boot(page); await configure(page); await mockEditor(page); const app = await start(page)
  await app.getByRole('textbox', { name: 'A note to keep' }).fill('A note'); await saved(page); await saveVersion(page, 'Version A')
  await change(page, 'Add reset'); await saveVersion(page, 'Version B')
  await page.frameLocator('iframe').getByRole('textbox', { name: 'A note to keep' }).fill('Unsaved history data'); await saved(page)
  await restore(page, 'Version A'); await expect(page.frameLocator('iframe').getByRole('button', { name: 'Reset counter' })).toHaveCount(0); await expect(page.frameLocator('iframe').getByRole('textbox', { name: 'A note to keep' })).toHaveValue('A note')
  const a = (await state(page)).workspace.headSnapshotId
  await change(page, 'Add another reset'); const data = await state(page)
  expect(data.snapshots.find(s => s.id === data.workspace.headSnapshotId).parentId).toBe(a)
  expect(data.snapshots.some(s => s.label === 'Version B')).toBe(true); expect(data.snapshots.some(s => s.reason === 'before-restore' && s.files['/data/state.json'].content.includes('Unsaved history data'))).toBe(true)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export project', exact: true }).click(); const download = await downloadEvent
  const fs = await import('node:fs/promises'); const exported = await fs.readFile((await download.path())!, 'utf8')
  expect(exported).not.toContain('synthetic-test-only'); expect(exported).not.toContain('synthetic-header'); expect(JSON.parse(exported).snapshots).toHaveLength(data.snapshots.length)
  await page.getByLabel('Import project JSON (up to 128 MiB)').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(exported) })
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Import and replace project' }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped')
  expect((await state(page)).settings.find(s => s.key === 'allowance').value.usedRequests).toBe(6); await expect(page.getByLabel('API key', { exact: true })).toHaveValue('synthetic-test-only')
})
test('A09/A10/A11: repair while stopped bypasses app behavioral context, instructions version with files', async ({ page }) => {
  await boot(page); await configure(page); await start(page)
  await appFrame(page).evaluate(async () => { await (window as any).ace.fs.writeText('/agent/instructions.md', 'APP-INSTRUCTIONS-MARKER'); await (window as any).ace.fs.writeText('/agent/memory.md', 'APP-MEMORY-MARKER'); document.body.replaceChildren() })
  await expect(page.getByLabel('What would you like to change?')).toBeVisible(); await page.getByRole('button', { name: 'Stop', exact: true }).click()
  const mock = await mockEditor(page); await page.getByLabel('Ignore app instructions / Repair mode').check(); await change(page, 'Repair and add reset')
  const request = JSON.stringify(mock.bodies[0]!.messages)
  expect(request).not.toContain('APP-INSTRUCTIONS-MARKER'); expect(request).not.toContain('APP-MEMORY-MARKER'); expect((await state(page)).workspace.files['/agent/instructions.md'].content).toBe('APP-INSTRUCTIONS-MARKER')
  await restore(page, 'First version'); expect((await state(page)).workspace.files['/agent/instructions.md'].content).not.toBe('APP-INSTRUCTIONS-MARKER')
})
test('A12/A25/A28: Stop and connection clearing invalidate delayed AI results', async ({ page }) => {
  await boot(page); await configure(page); await start(page)
  let release: (() => void) | undefined, received = false
  await page.route(`${MOCK}/chat/completions`, async route => { received = true; await new Promise<void>(resolve => { release = resolve }); await route.fulfill({ json: calls([['write_file', { path: '/bad.txt', content: 'stale' }]]) }).catch(() => {}) })
  await page.getByLabel('What would you like to change?').fill('Delayed edit'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect.poll(() => received).toBe(true)
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Clear saved connection', exact: true }).click(); release?.()
  await expect(page.getByTestId('runtime-status')).toHaveText('Stopped'); await expect(page.getByLabel('API key', { exact: true })).toHaveValue('')
  await page.waitForTimeout(100); const data = await state(page); expect(data.workspace.files).not.toHaveProperty('/bad.txt'); expect(data.settings.find(s => s.key === 'allowance').value.usedRequests).toBe(1)
  expect(await page.evaluate(() => localStorage.getItem('ace.model-connection.v1'))).toBeNull()
})
test('A14/A16: provider truncation discards drafts, allowance survives reload and restores', async ({ page }) => {
  await boot(page); await configure(page); await start(page)
  let count = 0
  await page.route(`${MOCK}/chat/completions`, async route => { count++; await route.fulfill({ json: count === 1 ? calls([['write_file', { path: '/bad.txt', content: 'partial' }]]) : { choices: [{ finish_reason: 'length', message: { role: 'assistant', content: 'truncated' } }] } }) })
  await page.getByLabel('What would you like to change?').fill('Truncate'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect(page.getByTestId('ai-status')).toHaveText('Failed'); expect((await state(page)).workspace.files).not.toHaveProperty('/bad.txt')
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByLabel('Requests since reset', { exact: true }).fill('2'); await page.getByRole('button', { name: 'Save settings', exact: true }).click(); await closePanel(page)
  await restore(page, 'First version'); await page.reload(); await page.getByLabel('What would you like to change?').fill('Blocked'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect(page.getByTestId('ai-status')).toHaveText('Failed'); expect(count).toBe(2)
})
test('A21/A26: second tab is read-only and RPC schemas reject unknown fields and invalid paths', async ({ page, context }) => {
  await boot(page); await start(page)
  const outcomes = await appFrame(page).evaluate(async () => {
    const ace = (window as any).ace, result: string[] = []
    for (const action of [() => ace.fs.writeText('/../escape', 'bad'), () => ace.fs.batch({ writes: {}, deletes: [], unexpected: true })]) { try { await action() } catch (e: any) { result.push(e.code) } }
    try { await ace.fs.readText('/settings') } catch (e: any) { result.push(e.code) }; return result
  })
  expect(outcomes).toEqual(['INVALID_PATH', 'INVALID_REQUEST', 'NOT_FOUND'])
  const second = await context.newPage(); await second.goto('/'); await closePanel(second); await expect(second.getByText('Read-only tab.', { exact: false })).toBeVisible(); await expect(second.getByRole('button', { name: 'Start', exact: true })).toBeDisabled(); expect((await state(page)).workspace.files).not.toHaveProperty('/../escape'); await second.close()
})
test('A23/A24: non-Vue app uses VFS, assets, and the shared text AI gateway without credentials', async ({ page }) => {
  await boot(page); await configure(page); await start(page)
  await page.route(`${MOCK}/chat/completions`, route => route.fulfill({ json: reply('Synthetic text answer') }))
  const response = await appFrame(page).evaluate(async () => {
    const ace = (window as any).ace
    await ace.fs.writeText('/data/sdk.txt', 'SDK persisted')
    const text = await ace.fs.readText('/data/sdk.txt'), answer = await ace.ai.request({ messages: [{ role: 'user', content: 'Hello' }], maxOutputTokens: 12 })
    const asset = await ace.assets.url('/data/sdk.txt'); const contents = await fetch(asset).then(r => r.text()); ace.assets.release(asset)
    await ace.fs.batch({ writes: { '/app/boot.json': { encoding: 'utf8', mediaType: 'application/json', content: '{"format":1,"html":"/plain.html","styles":[],"scripts":["/plain.js"]}' }, '/plain.html': { encoding: 'utf8', mediaType: 'text/html', content: '<h1>Plain app</h1>' }, '/plain.js': { encoding: 'utf8', mediaType: 'text/javascript', content: 'ace.runtime.ready();' } }, deletes: [] })
    return { text, answer, contents, key: (window as any).apiKey }
  })
  expect(response).toMatchObject({ text: 'SDK persisted', answer: { text: 'Synthetic text answer' }, contents: 'SDK persisted' }); expect(response.key).toBeUndefined()
  await page.getByRole('button', { name: 'Stop', exact: true }).click(); await page.getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Plain app' })).toBeVisible()
})
