import { expect, type Page } from '@playwright/test'
import type { ChatMessage } from '../../shared/types'
export const MOCK = 'https://model.example.test/prefix/v1'
export function reply(content: string) { return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }], usage: { prompt_tokens: 12, completion_tokens: 8 } } }
export function calls(entries: Array<[string, object]>) {
  return {
    choices: [{ finish_reason: 'tool_calls', message: {
      role: 'assistant', content: null,
      reasoning_details: [{ type: 'reasoning.text', text: 'synthetic continuation' }],
      tool_calls: entries.map(([name, args], index) => ({ id: `call-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })),
    } }],
    usage: { prompt_tokens: 12, completion_tokens: 8 },
  }
}
export async function closePanel(page: Page) { const close = page.getByRole('button', { name: 'Close panel', exact: true }); if (await close.isVisible()) await close.click() }
export async function boot(page: Page) { await page.goto('/'); await expect(page.getByRole('button', { name: 'Save settings', exact: true })).toBeVisible(); await closePanel(page) }
export async function configure(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Provider', { exact: true }).selectOption('custom')
  await page.getByLabel('Base URL', { exact: true }).fill(MOCK)
  await page.getByLabel('Model ID', { exact: true }).fill('synthetic-model')
  await page.getByLabel('Authentication', { exact: true }).selectOption('none')
  await page.getByLabel('API key', { exact: true }).fill('synthetic-test-only')
  await page.getByText('Advanced connection options', { exact: true }).click()
  await page.getByLabel('Extra headers (JSON object)', { exact: true }).fill('{"X-Test":"synthetic-header"}')
  await page.getByLabel('Completion-token field', { exact: true }).selectOption('max_completion_tokens')
  await page.getByLabel('Instruction role', { exact: true }).selectOption('developer')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible(); await closePanel(page)
}
export async function start(page: Page) { await closePanel(page); await page.getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Ready'); return page.frameLocator('iframe') }
export function appFrame(page: Page) { const frame = page.frames().find(f => f.parentFrame()); if (!frame) throw new Error('App frame missing'); return frame }
export async function saved(page: Page) { await expect(page.frameLocator('iframe').getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible() }
export async function change(page: Page, prompt: string) { await closePanel(page); await page.getByLabel('What would you like to change?', { exact: true }).fill(prompt); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect(page.getByTestId('ai-status')).toHaveText('Idle'); await expect(page.getByTestId('runtime-status')).toHaveText('Ready') }
export async function state(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('godelbox-v1'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const tx = db.transaction(['projects', 'workspaces', 'snapshots', 'settings', 'usage'])
    const get = (name: string) => new Promise<any[]>((resolve, reject) => { const request = tx.objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const [projects, workspaces, snapshots, settings, usage] = await Promise.all(['projects', 'workspaces', 'snapshots', 'settings', 'usage'].map(get)); db.close()
    return { project: projects[0], workspace: workspaces[0], snapshots, settings, usage }
  })
}
export async function saveVersion(page: Page, name: string) { await page.getByRole('button', { name: 'Save version', exact: true }).click(); await page.getByLabel('Version label').fill(name); await page.getByRole('region', { name: 'Save version' }).getByRole('button', { name: 'Save version', exact: true }).click(); await expect(page.getByRole('region', { name: 'Save version' })).toBeHidden() }
export async function restore(page: Page, name: string) { await closePanel(page); await page.getByRole('button', { name: 'History', exact: true }).click(); await page.getByRole('button', { name: new RegExp(`^${name}`) }).click(); await page.getByRole('button', { name: 'Restore selected version', exact: true }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Ready'); await closePanel(page) }
export async function mockEditor(page: Page, transform: (html: string) => string = html => html.replace('</main>', '<button @click="counter=0; persist()">Reset counter</button></main>')) {
  let number = 0
  const bodies: Record<string, any>[] = []
  await page.route(`${MOCK}/chat/completions`, async route => {
    const body = route.request().postDataJSON(); bodies.push(body); number++
    const toolReplies = (body.messages as ChatMessage[]).filter(message => message.role === 'tool')
    let payload
    if (!toolReplies.length) payload = calls([['read_file', { path: '/app/index.html' }], ['read_file', { path: '/data/state.json' }]])
    else if (toolReplies.length === 2) {
      const html = JSON.parse(toolReplies[0]!.content as string).content
      payload = calls([['write_file', { path: '/app/index.html', content: transform(html), mediaType: 'text/html' }]])
    } else payload = reply('Updated the app and preserved its data.')
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(payload) })
  })
  return { bodies, count: () => number }
}
