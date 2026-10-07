import html from './app.html?raw'
import script from './app.js?raw'
import styles from './styles.css?raw'
import vue from './vendor/vue.global.prod.js?raw'
import license from './vendor/vue.LICENSE.txt?raw'
import versions from './vendor/versions.json?raw'
import { textFile } from '../shared/files'
import type { FileMap } from '../shared/types'
export function seedFiles(): FileMap {
  return {
    '/app/boot.json': textFile(JSON.stringify({ format: 1, html: '/app/index.html', styles: ['/app/styles.css'], scripts: ['/vendor/vue.global.prod.js', '/app/app.js'] }, null, 2), 'application/json'),
    '/app/index.html': textFile(html, 'text/html'), '/app/app.js': textFile(script, 'text/javascript'), '/app/styles.css': textFile(styles, 'text/css'),
    '/data/state.json': textFile(JSON.stringify({ counter: 0, note: 'This note is stored in the current version.' }, null, 2), 'application/json'),
    '/agent/instructions.md': textFile('Preserve existing data and unrelated files when changing this app. Read files before editing. Persist data through ace.fs and call ace.runtime.ready() after initialization.', 'text/markdown'),
    '/agent/memory.md': textFile('', 'text/markdown'), '/agent/conversation.json': textFile('[]', 'application/json'),
    '/vendor/vue.global.prod.js': textFile(vue, 'text/javascript'), '/vendor/vue.LICENSE.txt': textFile(license), '/vendor/versions.json': textFile(versions, 'application/json'),
  }
}
