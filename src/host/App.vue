<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Engine } from './engine'
import { defaults } from '../storage/connection'
import { fileBytes, inventory, readText } from '../shared/files'
import type { HostLimits, ModelConnection } from '../shared/types'

const engine = new Engine(), state = engine.state
const favicon = `${import.meta.env.BASE_URL}favicon.svg`
const canvas = ref<HTMLElement>(), panel = ref(''), ignore = ref(false), label = ref(''), selected = ref(''), selectedFile = ref('/app/app.js')
const prompt = computed({ get: () => state.prompt, set: value => { state.prompt = value } })
const promptVisible = ref(false)
const hostReady = ref(false)
const form = ref<ModelConnection>(defaults()), limitsForm = ref<HostLimits>({ ...state.limits }), headers = ref('{}'), reveal = ref(false), models = ref<string[]>([]), settingsNotice = ref(''), importFile = ref<File>(), fileInput = ref<HTMLInputElement>()
const busy = computed(() => ['Calling model', 'Using tools', 'Saving'].includes(state.aiStatus) || state.filesBusy)
const head = computed(() => engine.head)
const dirty = computed(() => engine.dirty)
const selectedSnapshot = computed(() => state.snapshots.find(s => s.id === selected.value))
const viewedFiles = computed(() => selectedSnapshot.value?.files ?? state.workspace?.files ?? {})
const files = computed(() => inventory(viewedFiles.value))
const inspected = computed(() => viewedFiles.value[selectedFile.value])
const pairs = computed(() => engine.completedConversation().slice(-16))
const remaining = computed(() => Math.max(0, state.limits.maxRequestsSinceReset - state.allowance.usedRequests))
const historyRows = computed(() => {
  const result: Array<{ id: string; label: string; reason: string; createdAt: number; depth: number }> = []
  const children = new Map<string | null, typeof state.snapshots>()
  for (const snapshot of state.snapshots) {
    const siblings = children.get(snapshot.parentId) ?? []
    siblings.push(snapshot); children.set(snapshot.parentId, siblings)
  }
  const pending = (children.get(null) ?? []).map(snapshot => ({ snapshot, depth: 0 })).reverse()
  while (pending.length) {
    const { snapshot, depth } = pending.pop()!
    result.push({ ...snapshot, depth })
    for (const child of [...(children.get(snapshot.id) ?? [])].reverse()) pending.push({ snapshot: child, depth: depth + 1 })
  }
  return result
})
async function act(operation: () => unknown | Promise<unknown>) { try { await operation() } catch (error) { engine.report(error) } }
function settings() {
  form.value = { ...state.connection, extraHeaders: { ...state.connection.extraHeaders } }; limitsForm.value = { ...state.limits }
  headers.value = JSON.stringify(form.value.extraHeaders, null, 2); settingsNotice.value = ''; reveal.value = false; panel.value = 'Settings'
}
function toggle(name: string) { if (panel.value === name) panel.value = ''; else if (name === 'Settings') settings(); else panel.value = name }
async function saveSettings() {
  try {
    try { form.value.extraHeaders = JSON.parse(headers.value) } catch { throw new Error('Extra headers must be a valid JSON object.') }
    await engine.updateSettings(form.value, limitsForm.value); settingsNotice.value = 'Saved'; form.value = { ...state.connection, extraHeaders: { ...state.connection.extraHeaders } }
  }
  catch (error) { settingsNotice.value = 'Not saved'; engine.report(error) }
}
async function send() { if (await engine.edit(prompt.value.trim(), ignore.value)) prompt.value = '' }
function shortcut(event: KeyboardEvent) { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); if (!busy.value && state.writable && prompt.value.trim()) void act(send) } }
function downloadJson(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function download(draft = false) { downloadJson(engine.exportProject(draft), draft ? 'godelbox-unsaved-edit.ace-project.json' : 'godelbox.ace-project.json') }
function exportDiagnostics() { downloadJson(engine.exportDiagnostics(), `godelbox-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`) }
async function resetProject() {
  if (!window.confirm('Delete this app, its data, and ALL its history, and start with a fresh universe? This cannot be undone. Export your project first to keep a backup. Your model connection, limits, and request usage will remain.')) return
  await engine.resetProject(); selected.value = ''; panel.value = ''
}
function chooseImport(event: Event) { importFile.value = (event.target as HTMLInputElement).files?.[0] }
async function loadUniverse() {
  if (!window.confirm('Load the universe starter? Your current files will be preserved in History.')) return
  await engine.loadStarter(); panel.value = ''
}
async function replaceProject() {
  if (!importFile.value) return
  if (!window.confirm('Replace the current project and its history? Export your current project first if you want to keep it. Your connection and request usage will remain unchanged.')) return
  await engine.importProject(importFile.value); importFile.value = undefined; selected.value = ''; if (fileInput.value) fileInput.value.value = ''
}
function date(timestamp: number) { return new Date(timestamp).toLocaleString() }
function preset() { if (form.value.preset === 'openrouter') { form.value.baseUrl = 'https://openrouter.ai/api/v1'; form.value.authMode = 'bearer' } }
onMounted(async () => { await engine.initialize(); await nextTick(); if (canvas.value) engine.attach(canvas.value); if (state.settingsInitially) settings(); hostReady.value = true })
onBeforeUnmount(() => engine.dispose())
</script>

<template>
  <div class="shell">
    <header class="toolbar">
      <a class="brand" href="./about.html" title="About Godelbox">Godelbox</a>
      <nav aria-label="Application controls" class="controls">
        <span class="runtime-state" title="Canvas status" role="status" data-testid="runtime-status">{{ state.runtimeStatus }}</span>
        <button :disabled="!hostReady || state.loading || !state.writable || busy || state.runtimeStatus === 'Ready'" @click="act(() => engine.start())">Start</button>
        <button :disabled="!hostReady || state.loading || !state.writable" @click="engine.stop()">Stop</button>
        <button class="icon-button" :disabled="!hostReady" :aria-label="promptVisible ? 'Hide prompt' : 'Show prompt'" :title="promptVisible ? 'Hide prompt' : 'Show prompt'" :aria-expanded="promptVisible" aria-controls="host-prompt-panel" @click="promptVisible = !promptVisible"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M6 9h5M6 13h5"/></svg></button>
        <a class="icon-button" href="https://github.com/quodlibetbv/godelbox" aria-label="GitHub repository" title="GitHub repository" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 20v-3c-4 1-4-2-6-2M15 20v-4c0-1-.4-1.7-1-2 3-.4 5-1.5 5-5 0-1-.4-2-1-2.7 0-1-.1-2-.6-2.8-1 0-2 .5-2.8 1-1.7-.5-3.5-.5-5.2 0-.8-.5-1.8-1-2.8-1C6.1 4.3 6 5.3 6 6.3 5.4 7 5 8 5 9c0 3.5 2 4.6 5 5-.6.3-1 1-1 2"/></svg></a>
        <button class="icon-button" :disabled="!hostReady" aria-label="Settings" title="Settings" :aria-pressed="panel === 'Settings'" @click="toggle('Settings')"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg></button>
      </nav>
    </header>

    <div v-if="!state.loading && !state.writable" class="notice" role="status">Read-only tab. Another tab owns this workspace. Close that tab and reload here to run or change the app.</div>
    <div v-if="state.error" class="notice error" role="alert">{{ state.error }} <button @click="act(exportDiagnostics)">Export diagnostics</button><button @click="state.error = ''" aria-label="Dismiss error">Dismiss</button></div>
    <div v-if="state.settingsError" class="notice error" role="alert">Connection settings error: {{ state.settingsError }} <button @click="settings">Open Settings</button></div>

    <div class="workbench" :class="{ 'prompt-hidden': !promptVisible }">
      <main class="canvas-region" aria-label="Application canvas">
        <div ref="canvas" class="canvas" :class="{ stopped: state.runtimeStatus === 'Stopped' }"></div>
        <div v-if="state.loading || state.runtimeStatus === 'Stopped'" class="canvas-placeholder">
          <img :src="favicon" alt="" width="46" height="46">
          <h1>{{ state.loading ? 'Preparing your canvas' : busy ? 'Changing your app' : 'Your canvas is ready' }}</h1>
          <p>{{ state.loading ? 'Loading saved files and versions…' : busy ? 'The app is paused while Godelbox works on its files. You can stop at any time.' : 'Press Start to open your app. Use the prompt to reshape it, and save a version whenever you want a way back.' }}</p>
          <button v-if="!state.loading && !busy" class="primary" :disabled="!state.writable" @click="act(() => engine.start())">Start app</button>
          <p v-if="!state.loading && !form.model" class="hint">The starter app works without a model or API key.</p>
        </div>
      </main>

      <aside v-show="promptVisible" id="host-prompt-panel" class="prompt-region" aria-label="Host prompt">
        <div class="prompt-heading"><h2>Shape your app</h2><button aria-label="Hide prompt panel" @click="promptVisible = false">Close</button></div>
        <nav class="prompt-tools" aria-label="Project controls"><button :disabled="!hostReady || state.loading || !state.writable || busy" @click="toggle('Save version')">Save version</button><button v-for="name in ['History', 'Files', 'Errors']" :key="name" :aria-pressed="panel === name" @click="toggle(name)">{{ name }}<span v-if="name === 'Errors' && state.errors.length"> ({{ state.errors.length }})</span></button></nav>
        <div class="status-bar" aria-live="polite"><span>{{ head?.label ?? 'Preparing project…' }} <span v-if="dirty" class="dirty">· Changes since saved version</span></span><span>AI: <strong data-testid="ai-status">{{ state.aiStatus }}</strong> · {{ state.calls }} calls · {{ remaining }} requests left</span></div>
        <div class="conversation" aria-live="polite">
          <p v-if="!pairs.length" class="prompt-intro">Describe what you want your app to become. Try “Become a star atlas.”</p>
          <article v-for="(pair, index) in pairs" :key="`${pair.timestamp}-${index}`" :class="['message', pair.role]"><h3>{{ pair.role === 'user' ? 'You' : 'Godelbox' }}</h3><p>{{ pair.content }}</p></article>
          <p v-if="state.info" class="operation-info" role="status">{{ state.info }}</p>
          <div v-if="state.unsavedDraft" class="notice error"><p>Not saved. The completed edit remains in memory.</p><button @click="act(() => engine.retryDraft())" :disabled="busy">Retry saving edit</button><button @click="act(() => download(true))">Export unsaved edit</button></div>
        </div>
        <form class="prompt-form" @submit.prevent="act(send)">
          <label for="host-prompt">What would you like to change?</label>
          <textarea id="host-prompt" v-model="prompt" rows="4" placeholder="Describe a change, or ask Godelbox to repair the app…" @keydown="shortcut" :disabled="!state.writable || state.loading"></textarea>
          <label class="checkbox"><input v-model="ignore" type="checkbox">Ignore app instructions / Repair mode</label>
          <div class="submit-row"><span class="hint">Ctrl/Cmd + Enter to send</span><button class="primary" type="submit" :disabled="busy || !state.writable || !prompt.trim() || state.loading">{{ busy ? 'Working…' : 'Send' }}</button></div>
        </form>
      </aside>
    </div>

    <section v-if="panel" class="panel" :aria-label="panel">
      <div class="panel-heading"><h2>{{ panel }}</h2><button @click="panel = ''" aria-label="Close panel">Close</button></div>
      <form v-if="panel === 'Save version'" @submit.prevent="act(async () => { await engine.save(label); label = ''; panel = '' })" class="stack">
        <p>Save all currently persisted code, data, libraries, and instructions together.</p><label for="version-label">Version label</label><input id="version-label" v-model="label" placeholder="Before changes" maxlength="200"><button class="primary" :disabled="busy || !state.writable">Save version</button>
      </form>

      <template v-if="panel === 'History'">
        <p class="hint">Select a version to inspect it. Restore replaces the whole working filesystem; existing branches remain available.</p>
        <p>Working copy: {{ dirty ? 'Changes since saved version' : 'Matches saved version' }}</p>
        <div class="history" aria-label="Saved versions"><button v-for="row in historyRows" :key="row.id" :style="{ paddingLeft: `${12 + Math.min(row.depth, 12) * 14}px` }" :class="{ selected: selected === row.id }" @click="selected = row.id"><strong>{{ row.label }} <span v-if="row.id === state.workspace?.headSnapshotId">· Current head</span></strong><small>{{ date(row.createdAt) }} · {{ row.reason }}</small></button></div>
        <div class="row"><button :disabled="!selected" @click="panel = 'Files'">Inspect files</button><button :disabled="!selected || !state.writable" class="primary" @click="act(() => engine.restore(selected))">Restore selected version</button></div>
        <hr><button @click="act(() => download())">Export project</button><p class="hint">Exports include all history, app data, and prompts. Host connection settings and request usage are excluded.</p>
      </template>

      <template v-if="panel === 'Files'">
        <label for="file-version">Inspect</label><select id="file-version" v-model="selected"><option value="">Current working files</option><option v-for="s in state.snapshots" :key="s.id" :value="s.id">{{ s.label }} · {{ date(s.createdAt) }}</option></select>
        <label for="file-path">File</label><select id="file-path" v-model="selectedFile"><option v-for="file in files" :key="file.path" :value="file.path">{{ file.path }} ({{ file.byteLength }} bytes)</option></select>
        <p v-if="inspected" class="hint">{{ inspected.mediaType }} · {{ inspected.encoding }} · {{ fileBytes(inspected) }} bytes · Read-only</p>
        <pre v-if="inspected?.encoding === 'utf8'">{{ inspected.content }}</pre><p v-else-if="inspected">Binary contents are omitted from the file viewer.</p><p v-else>Select a file to inspect it.</p>
      </template>

      <template v-if="panel === 'Errors'">
        <p class="hint">Runtime messages are diagnostics, not proof of correctness. Godelbox never makes an automatic paid repair request.</p><div class="row"><button @click="act(exportDiagnostics)">Export diagnostics</button><button @click="engine.clearErrors">Clear error log</button></div><pre v-if="state.error">{{ state.error }}</pre><p v-if="!state.errors.length">No runtime errors reported.</p><pre v-for="(error, index) in state.errors" :key="index">{{ error }}</pre>
      </template>

      <template v-if="panel === 'Settings'">
        <h3>Diagnostics</h3><p class="hint">Export request timings, provider errors, and runtime logs. Keys, header values, app files, and prompt bodies are excluded. Review error text before sharing: an app or provider may include its own content there.</p><button @click="act(exportDiagnostics)">Export diagnostics</button><hr>
        <form class="stack" @submit.prevent="saveSettings">
          <p class="hint">Connect directly from this browser. The endpoint must support Chat Completions, tool calling, and browser CORS.</p>
          <label for="preset">Provider</label><select id="preset" v-model="form.preset" @change="preset"><option value="openrouter">OpenRouter</option><option value="custom">Custom compatible endpoint</option></select>
          <label for="base-url">Base URL</label><input id="base-url" v-model="form.baseUrl" type="url" required autocomplete="off" spellcheck="false">
          <label for="model-id">Model ID</label><input id="model-id" v-model="form.model" list="models" autocomplete="off" placeholder="Enter a model ID" spellcheck="false"><datalist id="models"><option v-for="model in models" :key="model" :value="model"></option></datalist>
          <label for="auth-mode">Authentication</label><select id="auth-mode" v-model="form.authMode"><option value="bearer">Bearer API key</option><option value="none">None</option></select>
          <label for="api-key">API key</label><div class="key-input"><input id="api-key" v-model="form.apiKey" :type="reveal ? 'text' : 'password'" autocomplete="off" spellcheck="false"><button type="button" :aria-pressed="reveal" @click="reveal = !reveal">{{ reveal ? 'Hide' : 'Reveal' }}</button></div>
          <p class="hint">The key is remembered as plain text in this browser's localStorage. It stays outside app files, versions, and project exports.</p>
          <details><summary>Advanced connection options</summary><div class="stack">
            <label for="extra-headers">Extra headers (JSON object)</label><textarea id="extra-headers" v-model="headers" rows="3" spellcheck="false"></textarea>
            <label for="token-field">Completion-token field</label><select id="token-field" v-model="form.tokenLimitParameter"><option value="max_tokens">max_tokens</option><option value="max_completion_tokens">max_completion_tokens</option></select>
            <label for="instruction-role">Instruction role</label><select id="instruction-role" v-model="form.instructionRole"><option value="system">system</option><option value="developer">developer</option></select>
            <label for="temperature">Temperature (optional)</label><input id="temperature" :value="form.temperature" @input="form.temperature = ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)" type="number" min="0" max="2" step="0.1">
            <label for="timeout">Request timeout (milliseconds)</label><input id="timeout" v-model.number="form.requestTimeoutMs" type="number" min="1000" max="600000">
          </div></details>
          <details open><summary>Host usage allowance</summary><div class="stack">
            <label for="completion-cap">Completion-token cap per request</label><input id="completion-cap" v-model.number="limitsForm.maxCompletionTokensPerRequest" type="number" min="1">
            <label for="edit-calls">Model calls per edit</label><input id="edit-calls" v-model.number="limitsForm.maxModelCallsPerEdit" type="number" min="1">
            <label for="tool-calls">Tool calls per edit</label><input id="tool-calls" v-model.number="limitsForm.maxToolCallsPerEdit" type="number" min="1">
            <label for="request-allowance">Requests since reset</label><input id="request-allowance" v-model.number="limitsForm.maxRequestsSinceReset" type="number" min="1">
            <p>{{ remaining }} requests left; {{ state.allowance.usedRequests }} used in this allowance. Failed and cancelled requests also count.</p>
          </div></details>
          <button class="primary" :disabled="!state.writable">Save settings</button><p v-if="settingsNotice" role="status">{{ settingsNotice }}</p>
        </form>
        <div class="row"><button :disabled="busy || !state.writable" @click="act(() => engine.testConnection())">Test connection</button><button :disabled="busy || !state.writable" @click="act(async () => { models = await engine.models(); settingsNotice = `Loaded ${models.length} models` })">Load models</button></div>
        <p class="hint">Test connection and Load models use the saved connection. Save your changes first. The connection test uses two requests.</p><p v-if="state.connectionTest" class="operation-info" role="status">{{ state.connectionTest }}</p>
        <button :disabled="!state.writable" @click="act(() => { engine.clearConnection(); form = defaults(); headers = '{}'; models = []; settingsNotice = 'Connection cleared' })">Clear saved connection</button>
        <hr><h3>Usage records</h3><button :disabled="busy || !state.writable" @click="act(() => engine.resetAllowance())">Reset request allowance</button><p class="hint">Only this explicit reset replenishes requests. Restore, reload, and import do not.</p>
        <ul class="usage"><li v-for="u in state.usage.slice(0, 20)" :key="u.id"><strong>{{ u.source }} · {{ u.outcome }}</strong><small>{{ u.model }} · {{ date(u.startedAt) }}</small><small>Tokens: {{ u.promptTokens ?? 'unknown' }} input / {{ u.completionTokens ?? 'unknown' }} output · Cost: {{ u.providerCost === undefined ? 'unknown' : `${u.providerCost} ${u.providerCostUnit}` }}</small></li></ul>
        <hr><h3>Starter app</h3><p class="hint">Load the animated universe as a new version. Current files and earlier versions remain in History; connection and usage stay unchanged.</p><button :disabled="state.filesBusy || !state.writable" @click="act(loadUniverse)">Load universe starter</button>
        <hr><h3>Start fresh</h3><p class="hint">Delete the current app, its data, and all history. Start again with a fresh universe while keeping your model connection, limits, and usage. Export your project first if you want a backup.</p><button :disabled="state.filesBusy || !state.writable" @click="act(resetProject)">Clear app and history</button>
        <hr><h3>Project backup</h3><button @click="act(() => download())">Export project</button><p class="hint">Exports include all historical code, data, instructions, and prompts. They exclude the connection, headers, and usage records.</p>
        <label for="import-file">Import project JSON (up to 128 MiB)</label><input id="import-file" ref="fileInput" type="file" accept="application/json,.json" :disabled="!state.writable" @change="chooseImport"><button :disabled="!importFile || !state.writable" @click="act(replaceProject)">Import and replace project</button>
        <hr><p class="hint">Named in honour of Kurt Friedrich Gödel. <a href="./about.html">About Godelbox</a> · <a href="https://github.com/quodlibetbv/godelbox">Source</a></p>
      </template>
    </section>
  </div>
</template>
