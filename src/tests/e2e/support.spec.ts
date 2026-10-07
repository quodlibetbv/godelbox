import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { MOCK, boot, bootUniverse, calls, closePanel, configure, saved, start, state } from './helpers'

test('minimal frame: black header, GitHub link, hideable prompt and full canvas', async ({ page }) => {
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close panel', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Host prompt' })).toBeHidden(); await expect(page.getByRole('link', { name: 'GitHub repository' })).toHaveAttribute('href', 'https://github.com/quodlibetbv/godelbox')
  await page.getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Ready')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const box = await page.getByRole('main', { name: 'Application canvas' }).boundingBox(); expect(box!.width).toBe(width); expect(box!.y).toBeLessThanOrEqual(56)
    await page.getByRole('button', { name: 'Show prompt', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Host prompt' })).toBeVisible()
    await page.getByLabel('What would you like to change?', { exact: true }).fill('Keep this unsent idea')
    await page.getByRole('button', { name: 'Hide prompt', exact: true }).click(); await expect(page.getByRole('complementary', { name: 'Host prompt' })).toBeHidden()
    await page.getByRole('button', { name: 'Show prompt', exact: true }).click(); await expect(page.getByLabel('What would you like to change?', { exact: true })).toHaveValue('Keep this unsent idea')
    await page.getByRole('button', { name: 'Hide prompt', exact: true }).click()
  }
})

test('diagnostics: retain provider error and timing across reload, omit keys, headers, prompt and app data', async ({ page }) => {
  await boot(page); await configure(page); const app = await start(page)
  await app.getByRole('textbox', { name: 'A note to keep' }).fill('private-synthetic-note'); await saved(page)
  const before = await state(page); let count = 0
  await page.route(`${MOCK}/chat/completions`, async route => { count++; await route.fulfill({ json: count === 1 ? calls([['write_file', { path: '/partial.txt', content: 'discard this draft' }]]) : { id: 'synthetic-error-response', choices: [{ finish_reason: 'error', message: { role: 'assistant', content: 'private-synthetic-response' } }], error: { code: 503, message: 'Provider failed', metadata: { provider_name: 'Synthetic provider', raw: JSON.stringify({ error: { message: 'Model at capacity synthetic-test-only synthetic-header' }, prompt: 'private-synthetic-prompt' }) } } }, headers: { 'x-request-id': 'synthetic-trace-id', 'access-control-expose-headers': 'x-request-id' } }) })
  await page.getByLabel('What would you like to change?', { exact: true }).fill('private-synthetic-prompt'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect(page.getByTestId('ai-status')).toHaveText('Failed')
  await expect(page.getByRole('alert')).toContainText('Model at capacity'); expect((await state(page)).workspace.files).toEqual(before.workspace.files); expect(count).toBe(2)
  const download = page.waitForEvent('download'); await page.getByRole('alert').getByRole('button', { name: 'Export diagnostics' }).click(); const file = await download; const text = await readFile((await file.path())!, 'utf8'); const report = JSON.parse(text)
  expect(report.format).toBe('godelbox-diagnostics'); expect(report.requests.find((r: any) => r.outcome === 'failed').diagnostic).toMatchObject({ httpStatus: 200, finishReason: 'error', provider: 'Synthetic provider', requestId: 'synthetic-trace-id' }); expect(report.events.some((e: any) => e.kind === 'model-request')).toBe(true)
  for (const value of ['synthetic-test-only', 'synthetic-header', 'private-synthetic-prompt', 'private-synthetic-note', 'private-synthetic-response', 'discard this draft']) expect(text).not.toContain(value)
  await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click(); const again = page.waitForEvent('download'); await page.getByRole('region', { name: 'Settings' }).getByRole('button', { name: 'Export diagnostics' }).click(); const persisted = JSON.parse(await readFile((await (await again).path())!, 'utf8')); expect(persisted.requests.some((r: any) => r.diagnostic.requestId === 'synthetic-trace-id')).toBe(true)
})

test('reset: confirmed clear keeps connection, limits and usage; delayed response cannot overwrite fresh project', async ({ page }) => {
  await bootUniverse(page); await configure(page); const old = await state(page)
  let received = false, release!: () => void
  await page.route(`${MOCK}/chat/completions`, async route => { received = true; await new Promise<void>(resolve => { release = resolve }); await route.fulfill({ json: calls([['write_file', { path: '/late.txt', content: 'old project' }]]) }).catch(() => {}) })
  await page.getByLabel('What would you like to change?', { exact: true }).fill('Change slowly'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect.poll(() => received).toBe(true)
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Clear app and history' }).click(); expect((await state(page)).project.id).toBe(old.project.id)
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Clear app and history' }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped'); await expect(page.getByRole('region', { name: 'Settings' })).toBeHidden(); release(); await page.waitForTimeout(100)
  const fresh = await state(page); expect(fresh.project.id).not.toBe(old.project.id); expect(fresh.snapshots).toHaveLength(1); expect(fresh.workspace.files).not.toHaveProperty('/late.txt'); expect(fresh.settings.find(s => s.key === 'allowance').value.usedRequests).toBe(1); expect(fresh.settings.find(s => s.key === 'limits')).toEqual(old.settings.find(s => s.key === 'limits'))
  await page.reload(); await closePanel(page); await page.getByRole('button', { name: 'Settings', exact: true }).click(); await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('synthetic-model'); await expect(page.getByLabel('API key', { exact: true })).toHaveValue('synthetic-test-only'); await closePanel(page); const app = await start(page); await expect(app.getByRole('heading', { name: 'What do you want me to become?' })).toBeVisible()
})
