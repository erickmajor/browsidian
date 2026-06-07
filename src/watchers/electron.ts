import type { VaultWatcher } from './index'

const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

export class ElectronWatcher implements VaultWatcher {
  private vaultPath: string
  private treeCb: (() => void) | null = null
  private fileCb: ((path: string) => void) | null = null
  private _listener: ((event: unknown, data: { eventType: string; filename: string | null }) => void) | null = null

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath
  }

  onTreeChanged(cb: () => void)          { this.treeCb = cb }
  onFileChanged(cb: (p: string) => void) { this.fileCb = cb }

  start() {
    this._listener = (_event, { eventType, filename }) => {
      if (!filename) return
      // Filter ignored directories anywhere in the path
      const parts = filename.replace(/\\/g, '/').split('/')
      if (parts.some((p) => IGNORED.has(p))) return

      if (eventType === 'rename') {
        // rename = file/dir added or deleted → tree changed
        this.treeCb?.()
      } else {
        // change = file content updated
        // Build absolute path matching activeFile.path (which uses native OS separators)
        const sep = this.vaultPath.includes('\\') ? '\\' : '/'
        const absPath = this.vaultPath.replace(/[/\\]+$/, '') + sep + filename
        this.fileCb?.(absPath)
      }
    }
    window.electronAPI.onVaultChanged(this._listener)
    window.electronAPI.watchVault(this.vaultPath)
  }

  stop() {
    window.electronAPI.stopWatchVault()
    window.electronAPI.offVaultChanged()
    this._listener = null
  }
}
