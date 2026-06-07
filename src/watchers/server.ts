import type { VaultWatcher } from './index'

export class ServerWatcher implements VaultWatcher {
  private treeCb: (() => void) | null = null
  private fileCb: ((path: string) => void) | null = null
  private es: EventSource | null = null

  onTreeChanged(cb: () => void)          { this.treeCb = cb }
  onFileChanged(cb: (p: string) => void) { this.fileCb = cb }

  start() {
    this.es = new EventSource('/api/watch')
    this.es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; path?: string }
        if (msg.type === 'ping') return
        if (msg.type === 'rename') this.treeCb?.()
        else if (msg.type === 'change' && msg.path) this.fileCb?.(msg.path)
      } catch {}
    }
    this.es.onerror = () => console.error('[ServerWatcher] SSE connection error')
  }

  stop() {
    this.es?.close()
    this.es = null
  }
}
