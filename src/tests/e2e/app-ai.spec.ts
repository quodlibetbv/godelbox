import { test, expect } from '@playwright/test'
import { assistantFiles } from '../fixtures/assistant-files'
import { APP_AI_INSTRUCTIONS, HOST_INSTRUCTIONS } from '../../ai/instructions'
import { MOCK, appFrame, bootUniverse, calls, configure, reply, state } from './helpers'

test('transformation creates an assistant; ordinary AI stays in the canvas with persisted chat and recoverable failures', async ({ page }) => {
  await bootUniverse(page); await configure(page); await page.getByRole('button', { name: 'Hide prompt', exact: true }).click()
  let edits = 0, appCalls = 0; const appBodies: any[] = []
  await page.route(`${MOCK}/chat/completions`, async route => {
    const body = route.request().postDataJSON()
    if (body.tools) {
      edits++; expect(body.messages[0]).toMatchObject({ role: 'developer', content: HOST_INSTRUCTIONS })
      await route.fulfill({ json: edits === 1 ? calls(Object.entries(assistantFiles).map(([path, content]) => ['write_file', { path, content }])) : reply('Built your motivational assistant.') })
    } else {
      appCalls++; appBodies.push(body)
      expect(body.messages[0].content).toContain(APP_AI_INSTRUCTIONS); expect(body.messages[0].content).not.toContain(HOST_INSTRUCTIONS)
      expect(body.messages[0].content).toContain('You are a motivational assistant.')
      await route.fulfill({ json: appCalls === 2 ? { error: { code: 503, message: 'Synthetic model at capacity' } } : reply('Start with one small task you can finish in five minutes.') })
    }
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click(); await expect(page.getByTestId('runtime-status')).toHaveText('Ready')
  await page.frameLocator('iframe').getByRole('textbox', { name: 'What do you want me to become?' }).fill('Become a motivational AI assistant')
  await page.frameLocator('iframe').getByRole('button', { name: 'Become', exact: true }).click()
  const app = page.frameLocator('iframe'); await expect(app.getByRole('heading', { name: 'Your motivational assistant' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Host prompt' })).toBeHidden(); expect(edits).toBe(2)
  const transformed = await state(page), frame = appFrame(page)
  await app.getByRole('textbox', { name: 'What is on your mind?' }).fill('What advice do you have for me?'); await app.getByRole('button', { name: 'Ask assistant' }).click()
  await expect(app.getByRole('article', { name: 'Assistant response' })).toHaveText('Start with one small task you can finish in five minutes.')
  await expect(app.getByRole('status')).toHaveText('Saved'); expect(appFrame(page)).toBe(frame)
  const answered = await state(page)
  expect(answered.snapshots).toEqual(transformed.snapshots); expect(answered.usage.filter(r => r.source === 'app')).toHaveLength(1)
  expect(JSON.parse(answered.workspace.files['/data/chat.json'].content)).toHaveLength(2)
  expect(answered.workspace.files['/agent/conversation.json']).toEqual(transformed.workspace.files['/agent/conversation.json'])
  await app.getByRole('textbox', { name: 'What is on your mind?' }).fill('Help me start again'); await app.getByRole('textbox', { name: 'What is on your mind?' }).press('Control+Enter')
  await expect(app.getByRole('alert')).toContainText('Synthetic model at capacity'); await expect(app.getByRole('status')).toHaveText('Reply failed')
  expect(appFrame(page)).toBe(frame); expect(edits).toBe(2); expect(appCalls).toBe(2)
  await expect(app.getByRole('button', { name: 'Ask assistant' })).toBeEnabled(); await expect(page.getByTestId('runtime-status')).toHaveText('Ready')
  expect(appBodies[1].messages.slice(1)).toEqual(JSON.parse((await state(page)).workspace.files['/data/chat.json'].content))
  await page.reload(); await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(app.getByRole('article', { name: 'Assistant response' })).toHaveText('Start with one small task you can finish in five minutes.')
  await expect(page.getByRole('complementary', { name: 'Host prompt' })).toBeHidden()
  expect(edits).toBe(2); expect(appCalls).toBe(2)
})

test('a prose-only editor turn reports no app change, retains the prompt, and displays the answer once', async ({ page }) => {
  await bootUniverse(page); await configure(page); const before = await state(page)
  await page.route(`${MOCK}/chat/completions`, route => route.fulfill({ json: reply('Synthetic claim: the requested assistant is already configured.') }))
  await page.getByLabel('What would you like to change?', { exact: true }).fill('Become a motivational AI assistant'); await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByTestId('runtime-status')).toHaveText('Ready')
  await expect(page.getByRole('status').filter({ hasText: 'No app changes made.' })).toBeVisible()
  await expect(page.getByText('Synthetic claim: the requested assistant is already configured.', { exact: true })).toHaveCount(1)
  await expect(page.getByLabel('What would you like to change?', { exact: true })).toHaveValue('Become a motivational AI assistant')
  const after = await state(page)
  for (const [name, file] of Object.entries(before.workspace.files)) if (name !== '/agent/conversation.json') expect(after.workspace.files[name]).toEqual(file)
  expect(after.snapshots).toHaveLength(before.snapshots.length + 1)
  await page.getByRole('button', { name: 'Hide prompt', exact: true }).click()
  await page.frameLocator('iframe').getByRole('textbox', { name: 'What do you want me to become?' }).fill('Become an assistant inside the canvas')
  await page.frameLocator('iframe').getByRole('button', { name: 'Become', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Host prompt' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'No app changes made.' })).toBeVisible()
  await expect(page.getByLabel('What would you like to change?', { exact: true })).toHaveValue('Become an assistant inside the canvas')
})
