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
    '/agent/instructions.md': textFile('This app starts as a p5.js universe, but may become anything the user requests. Preserve unrelated files and persisted data. The prompt calls ace.runtime.requestEdit(prompt) after a user submits it; this hands control to the permanent host editor. Keep a usable way to request changes when appropriate. Libraries are saved locally. Call ace.runtime.ready() after initialization.', 'text/markdown'),
    '/agent/memory.md': textFile('', 'text/markdown'), '/agent/conversation.json': textFile('[]', 'application/json'),
    '/vendor/p5.min.js': textFile(p5, 'text/javascript'), '/vendor/p5.LICENSE.txt': textFile(license), '/vendor/versions.json': textFile(versions, 'application/json'),
  }
}
