import { test, expect } from '@playwright/test'
import { MOCK, appFrame, boot, change, closePanel, configure, mockEditor, start, state } from './helpers'

test('A10: next normal edit reads changed or missing app instructions', async ({ page }) => {
  await boot(page); await configure(page); await start(page)
  await appFrame(page).evaluate(async () => { await (window as any).ace.fs.writeText('/agent/instructions.md', 'UPDATED-BEHAVIOR-MARKER') })
  const mock = await mockEditor(page); await change(page, 'Add reset')
  expect(JSON.stringify(mock.bodies[0]!.messages)).toContain('UPDATED-BEHAVIOR-MARKER')
  await appFrame(page).evaluate(async () => { await (window as any).ace.fs.deleteFile('/agent/instructions.md'); await (window as any).ace.fs.writeText('/agent/conversation.json', 'broken') })
  await change(page, 'Keep the app intact'); expect(JSON.stringify(mock.bodies[3]!.messages)).not.toContain('UPDATED-BEHAVIOR-MARKER')
  expect(JSON.stringify(mock.bodies[3]!.messages)).toContain('Preserve unrelated files and persisted data.')
  await page.getByRole('button', { name: /^Errors/ }).click(); await expect(page.getByRole('region', { name: 'Errors' }).getByText(/conversation file was missing or invalid/)).toBeVisible()
})

test('A28: clearing connection survives reload without removing project, history or usage', async ({ page }) => {
  await boot(page); await configure(page); await mockEditor(page); await change(page, 'Add reset'); const before = await state(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByRole('button', { name: 'Clear saved connection', exact: true }).click(); await page.reload()
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue(''); await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue(''); await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue('https://openrouter.ai/api/v1')
  const after = await state(page); expect(after.workspace).toEqual(before.workspace); expect(after.snapshots).toEqual(before.snapshots); expect(after.settings.find(s => s.key === 'allowance')).toEqual(before.settings.find(s => s.key === 'allowance'))
  expect(await page.evaluate(() => localStorage.getItem('ace.model-connection.v1'))).toBeNull()
})

test('model discovery accepts data[].id and reports failure without preventing manual setup', async ({ page }) => {
  await boot(page); await configure(page); await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.route(`${MOCK}/models`, route => route.fulfill({ json: { data: [{ id: 'synthetic-discovered' }] } }))
  await page.getByRole('button', { name: 'Load models' }).click(); await expect(page.getByRole('status').filter({ hasText: /Loaded 1 models/ })).toBeVisible(); await expect(page.locator('#models option')).toHaveAttribute('value', 'synthetic-discovered')
  await page.route(`${MOCK}/models`, route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }))
  await page.getByRole('button', { name: 'Load models' }).click(); await expect(page.getByRole('alert').filter({ hasText: /Enter a model ID manually/ })).toBeVisible(); await page.getByLabel('Model ID', { exact: true }).fill('synthetic-manual'); await page.getByRole('button', { name: 'Save settings', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
})

test('A14: malformed provider JSON and HTTP errors never apply draft writes', async ({ page }) => {
  await boot(page); await configure(page)
  for (const kind of ['json', 'http']) {
    if (kind === 'http') await page.reload()
    await page.route(`${MOCK}/chat/completions`, route => route.fulfill(kind === 'json' ? { body: '{invalid', contentType: 'application/json' } : { status: 401, json: { error: { message: 'Synthetic authentication failure synthetic-test-only' } } }))
    const before = await state(page); await page.getByLabel('What would you like to change?').fill('Broken response'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect(page.getByTestId('ai-status')).toHaveText('Failed')
    expect((await state(page)).workspace).toEqual(before.workspace); expect((await state(page)).snapshots).toEqual(before.snapshots)
    expect((await page.getByRole('alert').allTextContents()).join(' ')).not.toContain('synthetic-test-only')
  }
})

test('A20: a completed AI draft survives a failed local commit for explicit retry without extra model requests', async ({ page }) => {
  await boot(page); await configure(page); const mock = await mockEditor(page); const before = await state(page)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add; (window as any).restoreAdd = () => { IDBObjectStore.prototype.add = original }
    IDBObjectStore.prototype.add = function(...args) { if (this.name === 'snapshots' && args[0].reason === 'ai-edit') throw new DOMException('Synthetic commit quota failure', 'QuotaExceededError'); return original.apply(this, args as any) }
  })
  await page.getByLabel('What would you like to change?').fill('Add reset'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect(page.getByTestId('ai-status')).toHaveText('Failed'); await expect(page.getByText('Not saved. The completed edit remains in memory.', { exact: true })).toBeVisible()
  expect((await state(page)).workspace).toEqual(before.workspace); expect((await state(page)).snapshots).toEqual(before.snapshots); expect(mock.count()).toBe(3)
  await page.evaluate(() => (window as any).restoreAdd()); await page.getByRole('button', { name: 'Retry saving edit' }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Ready'); await expect(page.frameLocator('iframe').getByRole('button', { name: 'Reset counter' })).toBeVisible(); expect(mock.count()).toBe(3)
})
