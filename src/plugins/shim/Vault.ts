import { useVaultStore } from '@/stores/vault'
import { TFile, TFolder, TAbstractFile } from './types'
import type { VaultFile } from '@/stores/vault'

function getAdapter() {
  const { adapter } = useVaultStore.getState()
  if (!adapter) throw new Error('No vault adapter')
  return adapter
}

function flattenTree(entries: VaultFile[], prefix = '', parentFolder: TFolder | null = null): TAbstractFile[] {
  const result: TAbstractFile[] = []
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDir) {
      const folder = new TFolder(path)
      folder.parent = parentFolder
      folder.children = flattenTree(e.children ?? [], path, folder)
      result.push(folder, ...folder.children)
    } else {
      const file = new TFile(path)
      file.parent = parentFolder
      result.push(file)
    }
  }
  return result
}

export class VaultAdapterShim {
  get basePath(): string {
    return useVaultStore.getState().vaultPath ?? ''
  }

  async exists(path: string): Promise<boolean> {
    try { await getAdapter().readFile(path); return true } catch {}
    try { await getAdapter().listFiles(path); return true } catch {}
    return false
  }

  async read(path: string): Promise<string> {
    return getAdapter().readFile(path)
  }

  async write(path: string, content: string): Promise<void> {
    return getAdapter().writeFile(path, content)
  }

  async mkdir(path: string): Promise<void> {
    const a = getAdapter()
    if (a.mkdir) return a.mkdir(path)
    // WebAdapter creates dirs automatically on writeFile — no-op
  }

  async list(path: string): Promise<{ files: string[]; folders: string[] }> {
    try {
      const entries = await getAdapter().listFiles(path)
      return {
        files:   entries.filter(e => !e.isDir).map(e => e.path),
        folders: entries.filter(e => e.isDir).map(e => e.path),
      }
    } catch {
      return { files: [], folders: [] }
    }
  }

  async stat(path: string): Promise<{ ctime: number; mtime: number; size: number } | null> {
    try { await getAdapter().readFile(path); return { ctime: 0, mtime: 0, size: 0 } }
    catch { return null }
  }
}

type VaultEventType = 'create' | 'modify' | 'delete' | 'rename'
type VaultListener = (...args: any[]) => void

export class Vault {
  adapter = new VaultAdapterShim()
  private _listeners = new Map<string, Set<VaultListener>>()

  on(event: VaultEventType, callback: VaultListener): { unsubscribe: () => void } {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event)!.add(callback)
    return { unsubscribe: () => this._listeners.get(event)?.delete(callback) }
  }

  off(event: VaultEventType, callback: VaultListener): void {
    this._listeners.get(event)?.delete(callback)
  }

  _emit(event: VaultEventType, ...args: any[]): void {
    this._listeners.get(event)?.forEach(cb => { try { cb(...args) } catch {} })
  }

  async read(file: TFile): Promise<string> { return this.adapter.read(file.path) }
  async cachedRead(file: TFile): Promise<string> { return this.read(file) }

  async write(file: TFile, content: string): Promise<void> {
    await this.adapter.write(file.path, content)
    this._emit('modify', file)
  }

  async modify(file: TFile, content: string): Promise<void> { return this.write(file, content) }

  async create(path: string, content = ''): Promise<TFile> {
    await this.adapter.write(path, content)
    const file = new TFile(path)
    this._emit('create', file)
    return file
  }

  async delete(file: TAbstractFile, _force?: boolean): Promise<void> {
    await getAdapter().deleteFile(file.path)
    this._emit('delete', file)
  }

  async trash(file: TAbstractFile, _system?: boolean): Promise<void> { return this.delete(file) }

  async rename(file: TAbstractFile, newPath: string): Promise<void> {
    const oldPath = file.path
    await getAdapter().renameFile(oldPath, newPath)
    file.path = newPath
    file.name = newPath.split('/').pop() ?? newPath
    this._emit('rename', file, oldPath)
  }

  async copy(file: TFile, newPath: string): Promise<TFile> {
    return this.create(newPath, await this.read(file))
  }

  getFiles(): TFile[] {
    return this._all().filter((f): f is TFile => f instanceof TFile)
  }

  getMarkdownFiles(): TFile[] { return this.getFiles().filter(f => f.extension === 'md') }
  getAllLoadedFiles(): TAbstractFile[] { return this._all() }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return this._all().find(f => f.path === path) ?? null
  }

  getFileByPath(path: string): TFile | null {
    const f = this.getAbstractFileByPath(path)
    return f instanceof TFile ? f : null
  }

  getFolderByPath(path: string): TFolder | null {
    const f = this.getAbstractFileByPath(path)
    return f instanceof TFolder ? f : null
  }

  private _all(): TAbstractFile[] {
    return flattenTree(useVaultStore.getState().tree)
  }
}
