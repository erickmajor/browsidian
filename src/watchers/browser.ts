import type { VaultWatcher } from './index'
import type { VaultAdapter } from '@/adapters'

const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

type Snapshot = Map<string, number>  // path → lastModified (0 if unavailable)

export class BrowserWatcher implements VaultWatcher {
  private adapter: VaultAdapter
  private vaultPath: string
  private treeCb: (() => void) | null = null
  private fileCb: ((path: string) => void) | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private snapshot: Snapshot = new Map()

  constructor(adapter: VaultAdapter, vaultPath: string) {
    this.adapter = adapter
    this.vaultPath = vaultPath
  }

  onTreeChanged(cb: () => void)          { this.treeCb = cb }
  onFileChanged(cb: (p: string) => void) { this.fileCb = cb }

  start() {
    void this._buildSnapshot()
      .then((snap) => {
        this.snapshot = snap
        this.intervalId = setInterval(() => void this._poll(), 15_000)
      })
      .catch((err) => console.error('[BrowserWatcher] init error', err))
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async _buildSnapshot(): Promise<Snapshot> {
    const snap: Snapshot = new Map()
    const walk = async (dir: string) => {
      const entries = await this.adapter.listFiles(dir)
      for (const e of entries) {
        if (IGNORED.has(e.name)) continue
        if (e.isDir) { await walk(e.path); continue }
        const mtime = this.adapter.getLastModified
          ? ((await this.adapter.getLastModified(e.path)) ?? 0)
          : 0
        snap.set(e.path, mtime)
      }
    }
    await walk(this.vaultPath)
    return snap
  }

  private async _poll() {
    try {
      const next = await this._buildSnapshot()
      let treeChanged = false
      let changedFile: string | null = null

      // Detect removed or content-modified files
      for (const [p, mtime] of this.snapshot) {
        if (!next.has(p)) { treeChanged = true; break }
        if (next.get(p) !== mtime) changedFile = p
      }
      // Detect added files
      if (!treeChanged) {
        for (const p of next.keys()) {
          if (!this.snapshot.has(p)) { treeChanged = true; break }
        }
      }

      this.snapshot = next

      if (treeChanged) this.treeCb?.()
      else if (changedFile) this.fileCb?.(changedFile)
    } catch (err) {
      console.error('[BrowserWatcher] poll error, stopping', err)
      this.stop()
    }
  }
}
