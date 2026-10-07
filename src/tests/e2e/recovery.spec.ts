import { test, expect } from '@playwright/test'
import { MOCK, appFrame, boot, calls, change, closePanel, configure, mockEditor, reply, restore, saved, saveVersion, start, state } from './helpers'

async function plain(page: import('@playwright/test').Page, script: string) {
  await appFrame(page).evaluate(async source => {
    await (window as any).ace.fs.batch({ writes: {
      '/app/boot.json': { encoding: 'utf8', mediaType: 'application/json', content: JSON.stringify({ format: 1, html: '/plain.html', styles: [], scripts: ['/plain.js'] }) },
      '/plain.html': { encoding: 'utf8', mediaType: 'text/html', content: '<h1>Recovery fixture</h1>' },
      '/plain.js': { encoding: 'utf8', mediaType: 'text/javascript', content: source },
    }, deletes: [] })
  }, script)
}

test('A13: a queued old-port RPC cannot write after Stop and a fresh runtime', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage')!
    Object.defineProperty(MessagePort.prototype, 'onmessage', { ...original, set(listener) {
      original.set!.call(this, (event: MessageEvent) => {
        if (event.data?.method === 'fs.writeText' && event.data.params.path === '/late.txt') (window as any).releaseOldRpc = () => listener.call(this, event)
        else listener.call(this, event)
      })
    } })
  })
  await boot(page); await start(page)
  await appFrame(page).evaluate(() => { void (window as any).ace.fs.writeText('/late.txt', 'late') })
  await expect.poll(() => page.evaluate(() => !!(window as any).releaseOldRpc)).toBe(true)
  await page.getByRole('button', { name: 'Stop', exact: true }).click(); await start(page)
  const before = await state(page); await page.evaluate(() => (window as any).releaseOldRpc()); await page.waitForTimeout(100)
  expect((await state(page)).workspace).toEqual(before.workspace); expect((await state(page)).snapshots).toEqual(before.snapshots)
})

test('A15: startup errors and rejections remain saved and never trigger model repair', async ({ page }) => {
  await boot(page); await start(page)
  await plain(page, "throw new Error('Startup exception fixture');")
  await saveVersion(page, 'Broken startup'); const broken = (await state(page)).workspace.headSnapshotId
  await page.getByRole('button', { name: 'Stop', exact: true }).click(); await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByTestId('runtime-status')).toHaveText('Error reported'); await page.getByRole('button', { name: /^Errors/ }).click(); await expect(page.getByRole('region', { name: 'Errors' }).getByText(/Startup exception fixture/)).toBeVisible()
  expect((await state(page)).snapshots.some(s => s.id === broken)).toBe(true); expect((await state(page)).usage).toHaveLength(0)
  await restore(page, 'First version'); await plain(page, "Promise.reject(new Error('Startup rejection fixture'));" )
  await saveVersion(page, 'Rejected startup'); await page.getByRole('button', { name: 'Stop', exact: true }).click(); await page.getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Error reported')
  await restore(page, 'First version')
})

test('A18: imported bundle bytes restore offline and execute only inside the iframe', async ({ page, context }) => {
  await boot(page); await configure(page); await start(page)
  const lib = 'https://library.example.test/bundle.js'
  await page.route(lib, route => route.fulfill({ contentType: 'text/javascript', body: 'window.importedBundle = 42;' }))
  let count = 0
  await page.route(`${MOCK}/chat/completions`, async route => {
    count++
    const payload = count === 1 ? calls([['import_url', { url: lib, path: '/vendor/imported.js' }]]) : count === 2 ? calls([
      ['write_file', { path: '/app/boot.json', content: '{"format":1,"html":"/plain.html","styles":[],"scripts":["/vendor/imported.js","/plain.js"]}' }],
      ['write_file', { path: '/plain.html', content: '<h1>Offline library</h1><output id="library"></output>' }],
      ['write_file', { path: '/plain.js', content: "document.getElementById('library').textContent=String(window.importedBundle);ace.runtime.ready();" }],
    ]) : reply('Imported library')
    await route.fulfill({ json: payload })
  })
  await change(page, 'Import the library'); await expect(page.frameLocator('iframe').locator('#library')).toHaveText('42')
  const head = (await state(page)).snapshots.find(s => s.reason === 'ai-edit')!.label
  expect(await page.evaluate(() => (window as any).importedBundle)).toBeUndefined()
  expect(JSON.parse((await state(page)).workspace.files['/vendor/versions.json'].content)['/vendor/imported.js'].sha256).toMatch(/^[0-9a-f]{64}$/)
  await context.setOffline(true); await restore(page, 'First version'); await restore(page, head); await expect(page.frameLocator('iframe').locator('#library')).toHaveText('42'); await context.setOffline(false)
})

test('A20: quota failures reject app writes and restore atomically, without false Saved or deleting history', async ({ page }) => {
  await boot(page); const app = await start(page)
  await app.getByRole('textbox', { name: 'A note to keep' }).fill('Before failure'); await saved(page); await saveVersion(page, 'Persisted')
  await app.getByRole('textbox', { name: 'A note to keep' }).fill('Dirty value'); await saved(page); const before = await state(page)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put; (window as any).restorePut = () => { IDBObjectStore.prototype.put = original }
    IDBObjectStore.prototype.put = function(...args) { if (this.name === 'workspaces') throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return original.apply(this, args as any) }
  })
  await app.getByRole('textbox', { name: 'A note to keep' }).fill('Not committed'); await expect(app.getByRole('status').filter({ hasText: /^Not saved/ })).toBeVisible()
  expect((await state(page)).workspace).toEqual(before.workspace)
  await page.getByRole('button', { name: 'History', exact: true }).click(); await page.getByRole('button', { name: /^First version/ }).click(); await page.getByRole('button', { name: 'Restore selected version' }).click(); await expect(page.getByRole('alert').filter({ hasText: /Synthetic quota failure/ })).toBeVisible()
  expect((await state(page)).workspace).toEqual(before.workspace); expect((await state(page)).snapshots).toEqual(before.snapshots)
  await page.evaluate(() => (window as any).restorePut()); await restore(page, 'First version')
})

test('A22: infinite loop does not block host Stop; safe reopen stays stopped', async ({ page, browser }) => {
  console.log(`A22 browser: ${browser.version()}; Playwright Chromium headless, default site isolation, OS sandbox disabled for root runner`)
  await boot(page); await start(page); await plain(page, 'ace.runtime.ready(); setTimeout(() => { while(true) {} }, 250);')
  await saveVersion(page, 'Loop fixture'); await page.getByRole('button', { name: 'Stop', exact: true }).click(); await page.getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Ready'); await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Stop', exact: true }).click({ timeout: 3000 }); await expect(page.locator('iframe')).toHaveCount(0); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped')
  await page.goto('/?safe=1'); await closePanel(page); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped'); await expect(page.locator('iframe')).toHaveCount(0)
})

for (const action of ['Stop', 'Restore', 'Import'] as const) test(`A12/A25: ${action} cancels pending editor before late tools`, async ({ page }) => {
  await boot(page); await configure(page); await start(page); const initial = await state(page)
  let release!: () => void, received = false
  await page.route(`${MOCK}/chat/completions`, async route => { received = true; await new Promise<void>(resolve => { release = resolve }); await route.fulfill({ json: calls([['write_file', { path: '/stale.txt', content: 'cancelled' }]]) }).catch(() => {}) })
  await page.getByLabel('What would you like to change?').fill('Delayed edit'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect.poll(() => received).toBe(true)
  if (action === 'Stop') await page.getByRole('button', { name: 'Stop', exact: true }).click()
  if (action === 'Restore') await restore(page, 'First version')
  if (action === 'Import') {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByLabel('Import project JSON (up to 128 MiB)').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'ace-project', schemaVersion: 1, exportedAt: Date.now(), project: initial.project, workspace: initial.workspace, snapshots: initial.snapshots })) })
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Import and replace project' }).click(); await expect(page.getByRole('status').filter({ hasText: /Project imported/ })).toBeVisible()
  }
  const selected = await state(page); release(); await page.waitForTimeout(100); expect((await state(page)).workspace).toEqual(selected.workspace); expect((await state(page)).snapshots).toEqual(selected.snapshots)
  await expect(page.getByTestId('runtime-status')).toHaveText(action === 'Restore' ? 'Ready' : 'Stopped')
})

for (const failure of ['save', 'remove', 'load', 'malformed'] as const) test(`A30: localStorage ${failure} error preserves project and input`, async ({ page }) => {
  await boot(page); await configure(page); const before = await state(page)
  if (failure === 'malformed') await page.evaluate(() => localStorage.setItem('ace.model-connection.v1', '{broken-json'))
  if (failure === 'load') await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new DOMException('Synthetic blocked storage', 'SecurityError') } })
  if (failure === 'load' || failure === 'malformed') {
    await page.reload(); await expect(page.getByRole('alert').filter({ hasText: /Connection settings error/ })).toBeVisible(); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped')
  } else {
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.evaluate(method => { Storage.prototype[method] = () => { throw new DOMException('Synthetic blocked storage', 'SecurityError') } }, failure === 'save' ? 'setItem' : 'removeItem')
    if (failure === 'save') { await page.getByLabel('Model ID', { exact: true }).fill('Unsaved model'); await page.getByRole('button', { name: 'Save settings', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: /^Not saved$/ })).toBeVisible(); await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('Unsaved model') }
    else { await page.getByRole('button', { name: 'Clear saved connection', exact: true }).click(); await expect(page.getByLabel('API key', { exact: true })).toHaveValue('synthetic-test-only') }
    await expect(page.getByRole('alert').filter({ hasText: /Connection settings error/ })).toBeVisible()
  }
  expect((await state(page)).workspace).toEqual(before.workspace); expect((await state(page)).snapshots).toEqual(before.snapshots); expect((await state(page)).usage).toEqual(before.usage)
})
