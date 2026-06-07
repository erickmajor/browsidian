/**
 * VaultAdapter — abstração de filesystem.
 *
 * A UI nunca chama fs, window.electronAPI ou File System Access API diretamente.
 * Sempre usa esta interface. A factory createVaultAdapter() escolhe a implementação
 * correta com base no ambiente em que está rodando.
 *
 *   Electron  → ElectronAdapter  (IPC → Node.js fs no processo principal)
 *   Web       → WebAdapter       (File System Access API)
 *   CLI       → importado de cli/adapters/node-adapter.ts (Node.js fs direto)
 */

export interface FileEntry {
  name:  string
  path:  string
  isDir: boolean
}

export interface VaultAdapter {
  /** Abre um seletor de diretório e retorna o caminho, ou null se cancelado */
  selectVault(): Promise<string | null>
  listFiles(dirPath: string): Promise<FileEntry[]>
  readFile(filePath: string): Promise<string>
  writeFile(filePath: string, content: string): Promise<void>
  deleteFile(filePath: string): Promise<void>
  renameFile(oldPath: string, newPath: string): Promise<void>
  mkdir?(dirPath: string): Promise<void>
  getLastModified?(filePath: string): Promise<number | null>
}

// ─── Electron ────────────────────────────────────────────────────────────────

// Vault root set after the user picks a folder; lets ElectronAdapter resolve
// relative paths without importing the vault store (avoids circular deps).
let _electronVaultRoot = ''
export function setElectronVaultRoot(path: string): void { _electronVaultRoot = path }

class ElectronAdapter implements VaultAdapter {
  // Resolve relative paths against the vault root; leave absolute paths alone.
  private _abs(p: string): string {
    if (!_electronVaultRoot) return p
    if (/^([A-Za-z]:[/\\]|\/)/.test(p)) return p
    return `${_electronVaultRoot}/${p}`
  }

  selectVault()                              { return window.electronAPI.selectVault() }
  listFiles(dir: string)                     { return window.electronAPI.listFiles(this._abs(dir)) }
  async readFile(p: string): Promise<string> {
    const result = await window.electronAPI.readFile(this._abs(p))
    if (result === null) {
      const err = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    }
    return result
  }
  writeFile(p: string, c: string)            { return window.electronAPI.writeFile(this._abs(p), c) }
  deleteFile(p: string)                      { return window.electronAPI.deleteFile(this._abs(p)) }
  renameFile(o: string, n: string)           { return window.electronAPI.renameFile(this._abs(o), this._abs(n)) }
  mkdir(p: string)                           { return window.electronAPI.mkdir(this._abs(p)) }
}

// ─── Web (File System Access API) ────────────────────────────────────────────

class WebAdapter implements VaultAdapter {
  private root: FileSystemDirectoryHandle | null = null
  private rootName = ''

  async selectVault(): Promise<string | null> {
    try {
      this.root = await window.showDirectoryPicker({ mode: 'readwrite' })
      this.rootName = this.root.name
      return this.root.name
    } catch {
      return null
    }
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const dir = await this._dir(dirPath)
    const out: FileEntry[] = []
    for await (const [name, handle] of dir.entries()) {
      out.push({
        name,
        path: this._join(dirPath, name),
        isDir: handle.kind === 'directory',
      })
    }
    return out.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }

  async readFile(filePath: string): Promise<string> {
    const fh = await this._file(filePath)
    return (await fh.getFile()).text()
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fh  = await this._file(filePath, true)
    const w   = await fh.createWritable()
    await w.write(content)
    await w.close()
  }

  async deleteFile(filePath: string): Promise<void> {
    const parts  = this._parts(filePath)
    const name   = parts.pop()!
    const parent = parts.length ? await this._dir(parts.join('/')) : this.root!
    await parent.removeEntry(name, { recursive: true })
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    // File System Access API não tem rename nativo: copia + deleta
    const content = await this.readFile(oldPath)
    await this.writeFile(newPath, content)
    await this.deleteFile(oldPath)
  }

  async getLastModified(filePath: string): Promise<number | null> {
    try {
      const fh = await this._file(filePath)
      const file = await fh.getFile()
      return file.lastModified
    } catch {
      return null
    }
  }

  // ── internos ──

  private _parts(filePath: string): string[] {
    return filePath
      .replace(this.rootName + '/', '')
      .split('/')
      .filter(Boolean)
  }

  private _join(base: string, name: string): string {
    return base === this.rootName ? name : `${base}/${name}`
  }

  private async _dir(dirPath: string): Promise<FileSystemDirectoryHandle> {
    if (!this.root) throw new Error('Nenhum vault aberto')
    if (dirPath === this.rootName || dirPath === '') return this.root
    let cur = this.root
    for (const part of this._parts(dirPath)) {
      cur = await cur.getDirectoryHandle(part)
    }
    return cur
  }

  private async _file(
    filePath: string,
    create = false
  ): Promise<FileSystemFileHandle> {
    const parts    = this._parts(filePath)
    const fileName = parts.pop()!
    let   dir      = this.root!
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create })
    }
    return dir.getFileHandle(fileName, { create })
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createVaultAdapter(): VaultAdapter {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return new ElectronAdapter()
  }
  return new WebAdapter()
}
