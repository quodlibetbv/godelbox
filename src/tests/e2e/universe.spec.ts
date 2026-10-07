import { test, expect } from '@playwright/test'
import { MOCK, appFrame, boot, bootUniverse, calls, closePanel, configure, reply, restore, saved, start, state } from './helpers'
const question = 'What do you want me to become?'
async function pixels(page: import('@playwright/test').Page) {
  return appFrame(page).evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#cosmos canvas')!, data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let hash = 2166136261
    for (let i = 0; i < data.length; i += 97) hash = Math.imul(hash ^ data[i]!, 16777619)
    return hash
  })
}

test('universe: offline p5 starter animates, pauses and preserves typed prompt on stopped reload', async ({ page, context }) => {
  await bootUniverse(page); await context.setOffline(true); const app = await start(page)
  await expect(app.getByRole('heading', { name: question })).toBeVisible(); await expect(app.locator('#cosmos canvas')).toBeVisible()
  // The unchanged npm p5@2.3.3 bundle still reports 2.3.1 internally.
  expect(await appFrame(page).evaluate(() => (window as any).p5.VERSION)).toBe('2.3.1')
  const initial = await state(page); expect(initial.snapshots).toHaveLength(1); expect(initial.usage).toHaveLength(0); expect(JSON.parse(initial.workspace.files['/vendor/versions.json'].content)['/vendor/p5.min.js'].version).toBe('2.3.3')
  const first = await pixels(page); await expect.poll(() => pixels(page)).not.toBe(first)
  await app.getByRole('button', { name: 'Pause animation' }).click(); await page.waitForTimeout(100); const paused = await pixels(page); await page.waitForTimeout(150); expect(await pixels(page)).toBe(paused)
  await app.getByRole('textbox', { name: question }).fill('Become a tiny observatory'); await saved(page)
  await context.setOffline(false); await page.reload(); await closePanel(page); await expect(page.getByTestId('runtime-status')).toHaveText('Stopped'); const reopened = await start(page); await expect(reopened.getByRole('textbox', { name: question })).toHaveValue('Become a tiny observatory')
})

test('universe: reduced motion starts paused', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://127.0.0.1:5173' }), page = await context.newPage(); await bootUniverse(page); const app = await start(page)
  await expect(app.getByRole('button', { name: 'Resume animation' })).toHaveAttribute('aria-pressed', 'true'); const before = await pixels(page); await page.waitForTimeout(150); expect(await pixels(page)).toBe(before); await context.close()
})

test('universe: an older write acknowledgement cannot mark a newer prompt Saved', async ({ page }) => {
  await bootUniverse(page); const app = await start(page)
  await appFrame(page).evaluate(() => {
    const sdk = (window as any).ace, write = sdk.fs.writeText; (window as any).pendingAcks = []
    sdk.fs.writeText = async (...args: any[]) => { await write(...args); await new Promise(resolve => (window as any).pendingAcks.push(resolve)) }
  })
  await app.getByRole('textbox', { name: question }).fill('First idea')
  await expect.poll(() => appFrame(page).evaluate(() => (window as any).pendingAcks.length)).toBe(1)
  await app.getByRole('textbox', { name: question }).fill('A newer idea')
  const label = await appFrame(page).evaluate(async () => { (window as any).pendingAcks.shift()(); await new Promise(resolve => setTimeout(resolve, 0)); return document.getElementById('save-state')!.textContent })
  expect(label).toBe('Saving…')
  await expect.poll(() => appFrame(page).evaluate(() => (window as any).pendingAcks.length)).toBe(1)
  await expect(app.getByRole('status')).toHaveText('Saving…'); await appFrame(page).evaluate(() => (window as any).pendingAcks.shift()()); await saved(page)
  expect(JSON.parse((await state(page)).workspace.files['/data/state.json'].content).prompt).toBe('A newer idea')
})

test('universe: Become submits to real host editor, saves a child and restores universe', async ({ page }) => {
  await bootUniverse(page); await configure(page); const app = await start(page), base = await state(page)
  let count = 0; const bodies: any[] = []
  await page.route(`${MOCK}/chat/completions`, async route => {
    bodies.push(route.request().postDataJSON()); count++
    await route.fulfill({ json: count === 1 ? calls([['write_file', { path: '/app/index.html', content: base.workspace.files['/app/index.html'].content.replace('What do you want<br>me to become?', 'A star atlas, taking shape'), mediaType: 'text/html' }]]) : reply('Changed the universe into a star atlas introduction.') })
  })
  await app.getByRole('textbox', { name: question }).fill('Become a star atlas'); await app.getByRole('button', { name: 'Become', exact: true }).click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'A star atlas, taking shape' })).toBeVisible(); await expect(page.getByTestId('ai-status')).toHaveText('Idle')
  expect(count).toBe(2); expect(JSON.stringify(bodies[0]!.messages)).toContain('Become a star atlas')
  const changed = await state(page); expect(changed.snapshots.some(s => s.reason === 'ai-edit')).toBe(true); expect(changed.settings.find(s => s.key === 'allowance').value.usedRequests).toBe(2); expect(JSON.stringify(changed)).not.toContain('synthetic-test-only')
  await restore(page, 'First version'); await expect(page.frameLocator('iframe').getByRole('heading', { name: question })).toBeVisible()
})

test('universe: missing model keeps universe open and transfers prompt for Settings/retry; background edits rejected', async ({ page }) => {
  await bootUniverse(page); const app = await start(page)
  await app.getByRole('textbox', { name: question }).fill('Become a garden'); await app.getByRole('textbox', { name: question }).press('Control+Enter'); await expect(app.getByRole('alert')).toContainText('Open host Settings')
  await expect(page.getByLabel('What would you like to change?', { exact: true })).toHaveValue('Become a garden'); await expect(page.getByTestId('runtime-status')).toHaveText('Ready'); expect((await state(page)).usage).toHaveLength(0)
  // Playwright evaluate itself grants activation: let it expire inside this call.
  const result = await appFrame(page).evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 5500)); try { await (window as any).ace.runtime.requestEdit('Background request') } catch (error: any) { return error.code } })
  expect(result).toBe('USER_ACTION_REQUIRED'); expect((await state(page)).usage).toHaveLength(0)
})

test('universe: existing project can load starter with dirty files preserved in History', async ({ page }) => {
  await boot(page); const old = await start(page); await old.getByRole('textbox', { name: 'A note to keep' }).fill('Keep the old universe'); await saved(page)
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Load universe starter' }).click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: question })).toBeVisible()
  const data = await state(page); const preserved = data.snapshots.find(s => s.label === 'Before loading universe')!; expect(preserved.files['/data/state.json'].content).toContain('Keep the old universe'); expect(data.snapshots.find(s => s.id === data.workspace.headSnapshotId).reason).toBe('manual'); expect(data.usage).toHaveLength(0)
  await restore(page, 'Before loading universe'); await expect(page.frameLocator('iframe').getByRole('textbox', { name: 'A note to keep' })).toHaveValue('Keep the old universe')
})

test('universe: Stop cancels an edit started from inside the app', async ({ page }) => {
  await bootUniverse(page); await configure(page); const app = await start(page)
  let received = false, release!: () => void
  await page.route(`${MOCK}/chat/completions`, async route => { received = true; await new Promise<void>(resolve => { release = resolve }); await route.fulfill({ json: calls([['write_file', { path: '/late.txt', content: 'late' }]]) }).catch(() => {}) })
  await app.getByRole('textbox', { name: question }).fill('Become slowly'); await app.getByRole('button', { name: 'Become', exact: true }).click(); await expect.poll(() => received).toBe(true)
  const before = await state(page); await page.getByRole('button', { name: 'Stop', exact: true }).click(); release(); await page.waitForTimeout(100); expect((await state(page)).workspace).toEqual(before.workspace); await expect(page.locator('iframe')).toHaveCount(0); await expect(page.getByLabel('What would you like to change?', { exact: true })).toHaveValue('Become slowly')
})
