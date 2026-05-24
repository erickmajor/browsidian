/**
 * Obsidian API Shim
 *
 * Reimplementa as classes e helpers que plugins importam de 'obsidian'.
 * O Vite redireciona esses imports para cá via alias (somente no build Electron).
 *
 * Adicione métodos conforme novos plugins forem sendo suportados.
 */

// ─── Tipos base ──────────────────────────────────────────────────────────────

export interface PluginManifest {
  id: string
  name: string
  version: string
  minAppVersion: string
  description?: string
  author?: string
  authorUrl?: string
  main?: string
}

export interface Command {
  id: string
  name: string
  callback?: () => void
  checkCallback?: (checking: boolean) => boolean | void
  hotkeys?: { modifiers: string[]; key: string }[]
}

export interface TAbstractFile {
  path: string
  name: string
  vault: Vault
}

export interface TFile extends TAbstractFile {
  basename: string
  extension: string
  stat: { ctime: number; mtime: number; size: number }
}

export interface TFolder extends TAbstractFile {
  children: TAbstractFile[]
}

export interface EventRef {
  id: string
}

// ─── Events ──────────────────────────────────────────────────────────────────

export class Events {
  private _handlers: Map<string, Set<(...args: unknown[]) => unknown>> = new Map()

  on(event: string, cb: (...args: unknown[]) => unknown): EventRef {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set())
    this._handlers.get(event)!.add(cb)
    return { id: event }
  }

  off(event: string, cb: (...args: unknown[]) => unknown) {
    this._handlers.get(event)?.delete(cb)
  }

  trigger(event: string, ...args: unknown[]) {
    this._handlers.get(event)?.forEach((cb) => cb(...args))
  }
}

// ─── Vault ───────────────────────────────────────────────────────────────────

export class Vault extends Events {
  private _basePath: string
  private _files: Map<string, TFile> = new Map()

  constructor(basePath: string) {
    super()
    this._basePath = basePath
  }

  getBasePath() { return this._basePath }

  getFiles(): TFile[] { return [...this._files.values()] }

  getFileByPath(path: string): TFile | null {
    return this._files.get(path) ?? null
  }

  async read(file: TFile): Promise<string> {
    const result = await window.electronAPI.readFile(file.path)
    if (result === null) throw Object.assign(new Error(`ENOENT: ${file.path}`), { code: 'ENOENT' })
    return result
  }

  async modify(file: TFile, content: string): Promise<void> {
    await window.electronAPI.writeFile(file.path, content)
    this.trigger('modify', file)
  }

  async create(filePath: string, content = ''): Promise<TFile> {
    const fullPath = filePath.startsWith(this._basePath)
      ? filePath
      : `${this._basePath}/${filePath}`
    await window.electronAPI.writeFile(fullPath, content)
    const file = pathToTFile(fullPath, this)
    this._files.set(fullPath, file)
    this.trigger('create', file)
    return file
  }

  async delete(file: TFile): Promise<void> {
    await window.electronAPI.deleteFile(file.path)
    this._files.delete(file.path)
    this.trigger('delete', file)
  }

  async rename(file: TFile, newPath: string): Promise<void> {
    await window.electronAPI.renameFile(file.path, newPath)
    this._files.delete(file.path)
    const renamed = pathToTFile(newPath, this)
    this._files.set(newPath, renamed)
    this.trigger('rename', file, newPath)
  }

  // Chamado internamente para popular o cache de arquivos
  _registerFile(file: TFile) {
    this._files.set(file.path, file)
  }
}

function pathToTFile(filePath: string, vault: Vault): TFile {
  const parts = filePath.replace(/\\/g, '/').split('/')
  const name = parts[parts.length - 1]
  const dot = name.lastIndexOf('.')
  return {
    path: filePath,
    name,
    vault,
    basename: dot > -1 ? name.slice(0, dot) : name,
    extension: dot > -1 ? name.slice(dot + 1) : '',
    stat: { ctime: Date.now(), mtime: Date.now(), size: 0 },
  }
}

// ─── MetadataCache ────────────────────────────────────────────────────────────

export interface CachedMetadata {
  frontmatter?: Record<string, unknown>
  headings?: { heading: string; level: number }[]
  links?: { link: string; displayText?: string }[]
  tags?: { tag: string }[]
}

export class MetadataCache extends Events {
  private _cache = new Map<string, CachedMetadata>()

  getFileCache(file: TFile): CachedMetadata | null {
    return this._cache.get(file.path) ?? null
  }

  getFirstLinkpathDest(_linkpath: string, _sourcePath: string): TFile | null {
    return null
  }

  _set(filePath: string, meta: CachedMetadata) {
    this._cache.set(filePath, meta)
  }
}

// ─── Editor ──────────────────────────────────────────────────────────────────

export class Editor {
  private _value = ''

  getValue()                                   { return this._value }
  setValue(content: string)                    { this._value = content }
  getLine(n: number)                           { return this._value.split('\n')[n] ?? '' }
  lineCount()                                  { return this._value.split('\n').length }
  getCursor()                                  { return { line: 0, ch: 0 } }
  setCursor(_pos: { line: number; ch: number }){ /* no-op */ }
  replaceSelection(text: string)               { this._value = text }
  replaceRange(text: string)                   { this._value = text }
}

// ─── Views ───────────────────────────────────────────────────────────────────

export class WorkspaceLeaf {
  view: MarkdownView | null = null
}

export class MarkdownView {
  file: TFile | null = null
  editor = new Editor()
  getViewType() { return 'markdown' }
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export class Workspace extends Events {
  activeLeaf: WorkspaceLeaf | null = null

  getActiveFile(): TFile | null {
    return this.activeLeaf?.view?.file ?? null
  }

  getLeavesOfType(_type: string): WorkspaceLeaf[] {
    return this.activeLeaf ? [this.activeLeaf] : []
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────

export class App {
  vault: Vault
  workspace: Workspace
  metadataCache: MetadataCache

  constructor(vaultPath: string) {
    this.vault = new Vault(vaultPath)
    this.workspace = new Workspace()
    this.metadataCache = new MetadataCache()
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export class Plugin {
  app: App
  manifest: PluginManifest
  private _commands: Command[] = []

  constructor(app: App, manifest: PluginManifest) {
    this.app = app
    this.manifest = manifest
  }

  // Ciclo de vida
  async onload(): Promise<void>   { /* override */ }
  async onunload(): Promise<void> { /* override */ }

  addCommand(cmd: Command): Command {
    this._commands.push(cmd)
    return cmd
  }

  registerEvent(ref: EventRef): void { /* rastreamento opcional */ }

  addSettingTab(_tab: PluginSettingTab): void { /* implementar UI se necessário */ }

  async loadData(): Promise<unknown> {
    try {
      const p = `${this.app.vault.getBasePath()}/.browsidian/plugins/${this.manifest.id}/data.json`
      const raw = await window.electronAPI.readFile(p)
      return raw === null ? {} : JSON.parse(raw)
    } catch {
      return {}
    }
  }

  async saveData(data: unknown): Promise<void> {
    const p = `${this.app.vault.getBasePath()}/.browsidian/plugins/${this.manifest.id}/data.json`
    await window.electronAPI.writeFile(p, JSON.stringify(data, null, 2))
  }
}

// ─── PluginSettingTab ─────────────────────────────────────────────────────────

export class PluginSettingTab {
  app: App
  plugin: Plugin
  containerEl: HTMLElement

  constructor(app: App, plugin: Plugin) {
    this.app = app
    this.plugin = plugin
    this.containerEl = document.createElement('div')
  }

  display(): void { /* override */ }
  hide():    void { /* override */ }
}

// ─── Notice ───────────────────────────────────────────────────────────────────

export class Notice {
  constructor(message: string, timeout = 4000) {
    window.dispatchEvent(
      new CustomEvent('browsidian:notice', { detail: { message, timeout } })
    )
  }
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export class Modal {
  app: App
  contentEl = document.createElement('div')
  titleEl   = document.createElement('div')

  constructor(app: App) { this.app = app }

  open()  { window.dispatchEvent(new CustomEvent('browsidian:modal:open',  { detail: this })) }
  close() { window.dispatchEvent(new CustomEvent('browsidian:modal:close', { detail: this })) }
  onOpen():  void { /* override */ }
  onClose(): void { /* override */ }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

export function moment(date?: Date) {
  const d = date ?? new Date()
  return {
    format: (fmt: string) =>
      fmt
        .replace('YYYY', String(d.getFullYear()))
        .replace('MM',   String(d.getMonth() + 1).padStart(2, '0'))
        .replace('DD',   String(d.getDate()).padStart(2, '0'))
        .replace('HH',   String(d.getHours()).padStart(2, '0'))
        .replace('mm',   String(d.getMinutes()).padStart(2, '0')),
  }
}
