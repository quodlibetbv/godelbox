import bootstrap from './bootstrap.html?raw'
import { AceError, manifest, object, requireValue, type BootManifest } from '../shared/files'
import type { FileMap } from '../shared/types'

export class Runtime {
  private frame?: HTMLIFrameElement
  private port?: MessagePort
  private session?: string
  private handshake?: (event: MessageEvent) => void
  private timer?: ReturnType<typeof setTimeout>
  constructor(private target: HTMLElement, private dispatch: (method: string, params: unknown, valid: () => boolean) => Promise<unknown>, private status: (status: string) => void, private diagnostic: (message: string) => void) {}
  stop() {
    this.session = undefined
    clearTimeout(this.timer)
    if (this.handshake) window.removeEventListener('message', this.handshake)
    this.port?.close(); this.port = undefined
    this.frame?.remove(); this.frame = undefined
    this.status('Stopped')
  }
  start(files: FileMap) {
    this.stop()
    const boot: BootManifest = manifest(files)
    const session = crypto.randomUUID(); this.session = session
    const valid = () => this.session === session
    const frame = document.createElement('iframe'); this.frame = frame
    frame.title = 'ACE application'; frame.name = session; frame.setAttribute('sandbox', 'allow-scripts')
    frame.srcdoc = bootstrap
    this.handshake = (event: MessageEvent) => {
      if (!valid() || this.port || event.source !== frame.contentWindow || !object(event.data) || event.data.type !== 'bootstrap' || event.data.protocol !== 'ace/1' || event.data.sessionId !== session) return
      window.removeEventListener('message', this.handshake!)
      const channel = new MessageChannel(); this.port = channel.port1
      channel.port1.onmessage = async event => {
        const request = event.data
        if (!valid()) return
        try {
          requireValue(object(request) && Object.keys(request).every(key => ['protocol', 'sessionId', 'requestId', 'method', 'params'].includes(key)) && request.protocol === 'ace/1' && request.sessionId === session && typeof request.requestId === 'string' && request.requestId.length <= 100 && typeof request.method === 'string', 'Invalid bridge request.')
          const result = await this.dispatch(request.method, request.params, valid)
          if (valid()) channel.port1.postMessage({ protocol: 'ace/1', sessionId: session, requestId: request.requestId, ok: true, result })
        } catch (error) {
          if (valid() && object(request) && typeof request.requestId === 'string') channel.port1.postMessage({ protocol: 'ace/1', sessionId: session, requestId: request.requestId, ok: false, error: { code: error instanceof AceError ? error.code : 'INVALID_REQUEST', message: error instanceof Error ? error.message : 'Bridge request failed.' } })
        }
      }
      channel.port1.start()
      frame.contentWindow!.postMessage({ protocol: 'ace/1', type: 'connect', sessionId: session }, '*', [channel.port2])
      const required = Object.fromEntries([boot.html, ...boot.styles, ...boot.scripts].map(name => [name, { ...files[name] }]))
      channel.port1.postMessage({ protocol: 'ace/1', sessionId: session, type: 'boot', manifest: boot, files: required })
    }
    window.addEventListener('message', this.handshake)
    this.status('Starting')
    this.timer = setTimeout(() => { if (valid()) this.status('No ready signal') }, 10000)
    this.target.replaceChildren(frame)
  }
  ready() { clearTimeout(this.timer); this.status('Ready') }
  error(message: string) { clearTimeout(this.timer); this.status('Error reported'); this.diagnostic(message) }
}
