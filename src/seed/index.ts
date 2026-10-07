import html from './app.html?raw'
import script from './app.js?raw'
import styles from './styles.css?raw'
import p5 from './vendor/p5.min.js?raw'
import license from './vendor/p5.LICENSE.txt?raw'
import versions from './vendor/versions.json?raw'
import { textFile } from '../shared/files'
import type { FileMap } from '../shared/types'
export function seedFiles(): FileMap {
  return {
    '/app/boot.json': textFile(JSON.stringify({ format: 1, html: '/app/index.html', styles: ['/app/styles.css'], scripts: ['/vendor/p5.min.js', '/app/app.js'] }, null, 2), 'application/json'),
    '/app/index.html': textFile(html, 'text/html'), '/app/app.js': textFile(script, 'text/javascript'), '/app/styles.css': textFile(styles, 'text/css'),
    '/data/state.json': textFile(JSON.stringify({ prompt: '' }, null, 2), 'application/json'),
    '/agent/instructions.md': textFile('This app starts as a p5.js universe asking what it should become. A submitted Become request is an instruction to implement a new app with real UI and behavior, not merely save the prompt. The initial form calls ace.runtime.requestEdit(prompt) only to perform that transformation. Replace its form/handlers as needed for the new app, and replace these instructions with the new behavioral role. Normal AI interactions in a transformed app use ace.ai.request and display/persist responses inside that app without handing them to the editor. Preserve unrelated files and persisted data. Libraries are saved locally. Call ace.runtime.ready() after initialization.', 'text/markdown'),
    '/agent/memory.md': textFile('', 'text/markdown'), '/agent/conversation.json': textFile('[]', 'application/json'),
    '/vendor/p5.min.js': textFile(p5, 'text/javascript'), '/vendor/p5.LICENSE.txt': textFile(license), '/vendor/versions.json': textFile(versions, 'application/json'),
  }
}
