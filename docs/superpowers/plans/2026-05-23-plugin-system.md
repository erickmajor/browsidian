# Plugin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run real Obsidian community plugins in Browsidian (Electron + Web) via an `obsidian` module shim, with plugin discovery from `.obsidian/plugins/` and a community browser UI.

**Architecture:** Plugin `main.js` bundles are executed via `new Function(...)` with a synthetic `require('obsidian')` that returns our shim. The shim implements the Obsidian API surface incrementally, delegating to existing Zustand stores (vault, ui). The community browser fetches `obsidian-releases` from GitHub and downloads plugins directly to the vault.

**Tech Stack:** TypeScript, React 18, Zustand, custom DOM augmentations, GitHub API (no new npm deps required)

**Natural milestone:** Tasks 1–11 deliver a working local plugin loader. Tasks 12–16 add the community browser.

---

## File Map

**Create:**
- `src/plugins/shim/types.ts` — TFile, TFolder, TAbstractFile, PluginManifest
- `src/plugins/shim/Component.ts` — Component base class (lifecycle, event tracking)
- `src/plugins/shim/Plugin.ts` — Plugin extends Component
- `src/plugins/shim/Vault.ts` — Vault shim delegating to VaultAdapter
- `src/plugins/shim/Workspace.ts` — Workspace shim delegating to VaultStore
- `src/plugins/shim/components.ts` — Notice, Modal, SuggestModal, FuzzySuggestModal
- `src/plugins/shim/Setting.ts` — Setting, PluginSettingTab, and all input components
- `src/plugins/shim/dom.ts` — HTMLElement augmentations (createEl, createDiv, empty, etc.)
- `src/plugins/shim/index.ts` — shim barrel: all exports + utilities (Platform, normalizePath, moment, Menu, etc.)
- `src/plugins/store.ts` — Zustand store: loaded, enabled, installing, communityList
- `src/plugins/loader.ts` — discoverPlugins, loadPlugin, unloadPlugin, togglePlugin, loadEnabledPlugins
- `src/plugins/registry.ts` — fetchCommunityList, installPlugin, uninstallPlugin, detectRequiresElectron
- `src/components/PluginManager/PluginCard.tsx` — reusable plugin card
- `src/components/PluginManager/InstalledTab.tsx` — list installed plugins
- `src/components/PluginManager/CommunityTab.tsx` — browse and install community plugins
- `src/components/PluginManager/index.tsx` — full-screen modal + tabs

**Modify:**
- `src/components/StatusBar.tsx` — add plugin manager button
- `src/App.tsx` — mount PluginManager, init plugins after vault ready

---

## Task 1: Shim types + Component base class

**Files:**
- Create: `src/plugins/shim/types.ts`
- Create: `src/plugins/shim/Component.ts`

- [ ] **Step 1: Create `src/plugins/shim/types.ts`**

```typescript
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

export abstract class TAbstractFile {
  path: string
  name: string
  parent: TFolder | null = null

  constructor(path: string) {
    this.path = path
    this.name = path.split('/').pop() ?? path
  }
}

export class TFile extends TAbstractFile {
  extension: string
  basename: string
  stat: { ctime: number; mtime: number; size: number }

  constructor(path: string, stat?: { ctime: number; mtime: number; size: number }) {
    super(path)
    this.extension = path.includes('.') ? path.split('.').pop()! : ''
    this.basename = this.name.replace(/\.[^/.]+$/, '')
    this.stat = stat ?? { ctime: 0, mtime: 0, size: 0 }
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = []
  isRoot(): boolean { return this.path === '' || this.path === '/' }
}
```

- [ ] **Step 2: Create `src/plugins/shim/Component.ts`**

```typescript
export class Component {
  private _loaded = false
  private _cleanups: Array<() => void> = []
  private _children: Component[] = []

  load(): void {
    if (this._loaded) return
    this._loaded = true
    this.onload()
  }

  unload(): void {
    if (!this._loaded) return
    this._loaded = false
    this.onunload()
    this._cleanups.forEach(fn => { try { fn() } catch {} })
    this._cleanups = []
    this._children.forEach(c => c.unload())
    this._children = []
  }

  onload(): void {}
  onunload(): void {}

  addChild<T extends Component>(child: T): T {
    this._children.push(child)
    if (this._loaded) child.load()
    return child
  }

  registerEvent(ref: { unsubscribe: () => void } | (() => void)): void {
    this._cleanups.push(typeof ref === 'function' ? ref : () => ref.unsubscribe())
  }

  registerInterval(id: ReturnType<typeof setInterval>): typeof id {
    this._cleanups.push(() => clearInterval(id))
    return id
  }

  registerDomEvent<K extends keyof WindowEventMap>(
    el: HTMLElement | Window | Document,
    type: K,
    callback: (e: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    el.addEventListener(type as string, callback as EventListener, options)
    this._cleanups.push(() =>
      el.removeEventListener(type as string, callback as EventListener, options)
    )
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git add src/plugins/shim/types.ts src/plugins/shim/Component.ts
git commit -m "feat(plugins): shim types and Component base class"
```

---

## Task 2: Plugin class

**Files:**
- Create: `src/plugins/shim/Plugin.ts`

- [ ] **Step 1: Create `src/plugins/shim/Plugin.ts`**

```typescript
import { Component } from './Component'
import type { PluginManifest } from './types'

export interface Command {
  id: string
  name: string
  callback?: () => void | Promise<void>
  checkCallback?: (checking: boolean) => boolean | void
  editorCallback?: (editor: any, view: any) => void | Promise<void>
  hotkeys?: Array<{ modifiers: string[]; key: string }>
  icon?: string
}

export class Plugin extends Component {
  app: any
  manifest: PluginManifest

  constructor(app: any, manifest: PluginManifest) {
    super()
    this.app = app
    this.manifest = manifest
  }

  addCommand(command: Command): Command {
    this.app.commands.register({ ...command, id: `${this.manifest.id}:${command.id}` })
    return command
  }

  addSettingTab(tab: any): void {
    this.app.plugins._registerSettingTab(this.manifest.id, tab)
  }

  addRibbonIcon(_icon: string, _title: string, _cb: (evt: MouseEvent) => void): HTMLElement {
    return document.createElement('div')
  }

  addStatusBarItem(): HTMLElement {
    const el = document.createElement('div')
    el.style.display = 'none'
    return el
  }

  async loadData(): Promise<any> {
    try {
      const { useVaultStore } = await import('@/stores/vault')
      const { adapter } = useVaultStore.getState()
      if (!adapter) return {}
      const content = await adapter.readFile(
        `.obsidian/plugins/${this.manifest.id}/data.json`
      )
      return JSON.parse(content)
    } catch {
      return {}
    }
  }

  async saveData(data: any): Promise<void> {
    const { useVaultStore } = await import('@/stores/vault')
    const { adapter } = useVaultStore.getState()
    if (!adapter) return
    const json = JSON.stringify(data, null, 2)
    const path = `.obsidian/plugins/${this.manifest.id}/data.json`
    try {
      await adapter.writeFile(path, json)
    } catch {
      if (adapter.mkdir) {
        await adapter.mkdir(`.obsidian/plugins/${this.manifest.id}`)
        await adapter.writeFile(path, json)
      }
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/plugins/shim/Plugin.ts
git commit -m "feat(plugins): Plugin class with addCommand, loadData, saveData"
```

---

## Task 3: Vault shim

**Files:**
- Create: `src/plugins/shim/Vault.ts`

- [ ] **Step 1: Create `src/plugins/shim/Vault.ts`**

The `VaultFile` tree in the store uses `{ name, path, isDir, children? }`. The shim flattens it into `TAbstractFile` instances. Paths in the store are relative to the vault root (e.g., `Notes/Daily.md`).

```typescript
import { useVaultStore } from '@/stores/vault'
import { TFile, TFolder, TAbstractFile } from './types'
import type { VaultFile } from '@/stores/vault'

function getAdapter() {
  const { adapter } = useVaultStore.getState()
  if (!adapter) throw new Error('No vault adapter')
  return adapter
}

function flattenTree(entries: VaultFile[], prefix = ''): TAbstractFile[] {
  const result: TAbstractFile[] = []
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDir) {
      const folder = new TFolder(path)
      folder.children = flattenTree(e.children ?? [], path)
      result.push(folder, ...folder.children)
    } else {
      result.push(new TFile(path))
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
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/plugins/shim/Vault.ts
git commit -m "feat(plugins): Vault shim delegating to VaultAdapter"
```

---

## Task 4: Workspace shim

**Files:**
- Create: `src/plugins/shim/Workspace.ts`

- [ ] **Step 1: Create `src/plugins/shim/Workspace.ts`**

The store field for the open file is `activeFile: VaultFile | null` (not `currentFile`).

```typescript
import { useVaultStore } from '@/stores/vault'
import { TFile } from './types'

export class WorkspaceLeaf {
  view: any = null
  open(_view: any): Promise<void> { return Promise.resolve() }
  setViewState(_state: any): Promise<void> { return Promise.resolve() }
  getViewState(): any { return { type: 'markdown', state: {} } }
  getDisplayText(): string { return '' }
  getRoot(): this { return this }
}

type WorkspaceListener = (...args: any[]) => void

export class Workspace {
  activeLeaf: WorkspaceLeaf | null = new WorkspaceLeaf()
  private _listeners = new Map<string, Set<WorkspaceListener>>()

  getActiveFile(): TFile | null {
    const { activeFile } = useVaultStore.getState()
    if (!activeFile || activeFile.isDir) return null
    return new TFile(activeFile.path)
  }

  getActiveViewOfType<T>(_type: { new(...args: any[]): T }): T | null { return null }

  getLeaf(_newLeaf?: boolean | 'split' | 'window' | 'tab'): WorkspaceLeaf {
    return this.activeLeaf ?? new WorkspaceLeaf()
  }

  getLeavesOfType(_type: string): WorkspaceLeaf[] {
    return this.activeLeaf ? [this.activeLeaf] : []
  }

  getMostRecentLeaf(): WorkspaceLeaf | null { return this.activeLeaf }

  on(event: string, callback: WorkspaceListener): { unsubscribe: () => void } {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event)!.add(callback)
    return { unsubscribe: () => this._listeners.get(event)?.delete(callback) }
  }

  off(event: string, callback: WorkspaceListener): void {
    this._listeners.get(event)?.delete(callback)
  }

  _emit(event: string, ...args: any[]): void {
    this._listeners.get(event)?.forEach(cb => { try { cb(...args) } catch {} })
  }

  openLinkText(_text: string, _source: string, _newLeaf?: boolean): Promise<void> {
    return Promise.resolve()
  }

  getLastOpenFiles(): string[] { return [] }
  iterateAllLeaves(_cb: (leaf: WorkspaceLeaf) => void): void {}
  revealLeaf(_leaf: WorkspaceLeaf): void {}
  requestSaveActiveFile(): void {}
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/plugins/shim/Workspace.ts
git commit -m "feat(plugins): Workspace shim delegating to VaultStore.activeFile"
```

---

## Task 5: Notice, Modal, SuggestModal

**Files:**
- Create: `src/plugins/shim/components.ts`

- [ ] **Step 1: Create `src/plugins/shim/components.ts`**

Notice dispatches `browsidian:notice` CustomEvent — the same event `Toasts.tsx` listens to.

```typescript
export class Notice {
  constructor(message: string | DocumentFragment, duration = 4000) {
    const msg = message instanceof DocumentFragment
      ? (message.textContent ?? '')
      : String(message)
    window.dispatchEvent(
      new CustomEvent('browsidian:notice', { detail: { message: msg, timeout: duration } })
    )
  }

  setMessage(message: string | DocumentFragment): this {
    const msg = message instanceof DocumentFragment ? (message.textContent ?? '') : String(message)
    window.dispatchEvent(
      new CustomEvent('browsidian:notice', { detail: { message: msg, timeout: 4000 } })
    )
    return this
  }

  hide(): void {}
}

export class Modal {
  app: any
  containerEl: HTMLElement
  contentEl: HTMLElement
  private _dialog: HTMLDialogElement | null = null

  constructor(app: any) {
    this.app = app
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'modal-container'
    this.contentEl = document.createElement('div')
    this.contentEl.className = 'modal-content'
    this.containerEl.appendChild(this.contentEl)
  }

  open(): void {
    const dialog = document.createElement('dialog')
    dialog.className = 'obsidian-plugin-modal'
    dialog.appendChild(this.containerEl)
    document.body.appendChild(dialog)
    this._dialog = dialog
    dialog.showModal()
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); this.close() })
    this.onOpen()
  }

  close(): void {
    this.onClose()
    this._dialog?.close()
    this._dialog?.remove()
    this._dialog = null
  }

  onOpen(): void {}
  onClose(): void {}
}

export class SuggestModal<T> extends Modal {
  inputEl: HTMLInputElement
  resultContainerEl: HTMLElement
  limit = 100

  constructor(app: any) {
    super(app)
    this.inputEl = document.createElement('input')
    this.inputEl.type = 'text'
    this.inputEl.className = 'prompt-input'
    this.resultContainerEl = document.createElement('div')
    this.resultContainerEl.className = 'prompt-results'
    this.contentEl.appendChild(this.inputEl)
    this.contentEl.appendChild(this.resultContainerEl)
  }

  onOpen(): void {
    this.inputEl.addEventListener('input', () => this._render())
    this.inputEl.focus()
    this._render()
  }

  private async _render(): Promise<void> {
    const suggestions = await Promise.resolve(this.getSuggestions(this.inputEl.value))
    this.resultContainerEl.innerHTML = ''
    for (const s of suggestions.slice(0, this.limit)) {
      const el = document.createElement('div')
      el.className = 'suggestion-item'
      this.renderSuggestion(s, el)
      el.addEventListener('click', () => { this.onChooseSuggestion(s, new MouseEvent('click')); this.close() })
      this.resultContainerEl.appendChild(el)
    }
  }

  getSuggestions(_query: string): T[] | Promise<T[]> { return [] }
  renderSuggestion(_item: T, _el: HTMLElement): void {}
  onChooseSuggestion(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
}

export class FuzzySuggestModal<T> extends SuggestModal<T> {
  getItems(): T[] { return [] }
  getItemText(_item: T): string { return '' }

  getSuggestions(query: string): T[] {
    const q = query.toLowerCase()
    return this.getItems().filter(item =>
      this.getItemText(item).toLowerCase().includes(q)
    )
  }

  renderSuggestion(item: T, el: HTMLElement): void {
    el.textContent = this.getItemText(item)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/plugins/shim/components.ts
git commit -m "feat(plugins): Notice (CustomEvent), Modal, SuggestModal shims"
```

---

## Task 6: Setting + PluginSettingTab

**Files:**
- Create: `src/plugins/shim/Setting.ts`

- [ ] **Step 1: Create `src/plugins/shim/Setting.ts`**

```typescript
class BaseInputComponent<T> {
  protected _cbs: Array<(v: T) => void> = []
  onChange(cb: (v: T) => void): this { this._cbs.push(cb); return this }
  protected _fire(v: T): void { this._cbs.forEach(cb => { try { cb(v) } catch {} }) }
}

export class TextComponent extends BaseInputComponent<string> {
  inputEl: HTMLInputElement
  constructor(container: HTMLElement) {
    super()
    this.inputEl = container.createEl('input', { type: 'text', cls: 'setting-input' })
    this.inputEl.addEventListener('input', () => this._fire(this.inputEl.value))
  }
  getValue(): string { return this.inputEl.value }
  setValue(v: string): this { this.inputEl.value = v; return this }
  setPlaceholder(p: string): this { this.inputEl.placeholder = p; return this }
  setDisabled(d: boolean): this { this.inputEl.disabled = d; return this }
}

export class TextAreaComponent extends BaseInputComponent<string> {
  inputEl: HTMLTextAreaElement
  constructor(container: HTMLElement) {
    super()
    this.inputEl = container.createEl('textarea', { cls: 'setting-textarea' })
    this.inputEl.addEventListener('input', () => this._fire(this.inputEl.value))
  }
  getValue(): string { return this.inputEl.value }
  setValue(v: string): this { this.inputEl.value = v; return this }
  setPlaceholder(p: string): this { this.inputEl.placeholder = p; return this }
  setDisabled(d: boolean): this { this.inputEl.disabled = d; return this }
}

export class ToggleComponent extends BaseInputComponent<boolean> {
  toggleEl: HTMLInputElement
  constructor(container: HTMLElement) {
    super()
    const label = container.createEl('label', { cls: 'setting-toggle-label' })
    this.toggleEl = label.createEl('input', { type: 'checkbox' })
    this.toggleEl.addEventListener('change', () => this._fire(this.toggleEl.checked))
  }
  getValue(): boolean { return this.toggleEl.checked }
  setValue(v: boolean): this { this.toggleEl.checked = v; return this }
  setDisabled(d: boolean): this { this.toggleEl.disabled = d; return this }
}

export class ButtonComponent extends BaseInputComponent<MouseEvent> {
  buttonEl: HTMLButtonElement
  constructor(container: HTMLElement) {
    super()
    this.buttonEl = container.createEl('button', { cls: 'btn btn-secondary setting-btn' })
    this.buttonEl.addEventListener('click', (e) => this._fire(e))
  }
  setButtonText(t: string): this { this.buttonEl.textContent = t; return this }
  setCta(): this { this.buttonEl.className = 'btn btn-primary setting-btn'; return this }
  setWarning(): this { this.buttonEl.style.color = 'var(--danger, #e55)'; return this }
  setDisabled(d: boolean): this { this.buttonEl.disabled = d; return this }
  setIcon(_icon: string): this { return this }
  onClick(cb: (e: MouseEvent) => void): this { this.buttonEl.addEventListener('click', cb); return this }
}

export class DropdownComponent extends BaseInputComponent<string> {
  selectEl: HTMLSelectElement
  constructor(container: HTMLElement) {
    super()
    this.selectEl = container.createEl('select', { cls: 'setting-dropdown' })
    this.selectEl.addEventListener('change', () => this._fire(this.selectEl.value))
  }
  getValue(): string { return this.selectEl.value }
  setValue(v: string): this { this.selectEl.value = v; return this }
  addOption(value: string, display: string): this {
    const opt = this.selectEl.createEl('option')
    opt.value = value
    opt.textContent = display
    return this
  }
  addOptions(opts: Record<string, string>): this {
    Object.entries(opts).forEach(([v, d]) => this.addOption(v, d))
    return this
  }
  setDisabled(d: boolean): this { this.selectEl.disabled = d; return this }
}

export class Setting {
  settingEl: HTMLElement
  nameEl: HTMLElement
  descEl: HTMLElement
  controlEl: HTMLElement
  infoEl: HTMLElement

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createEl('div', { cls: 'setting-item' })
    this.infoEl    = this.settingEl.createEl('div', { cls: 'setting-item-info' })
    this.nameEl    = this.infoEl.createEl('div', { cls: 'setting-item-name' })
    this.descEl    = this.infoEl.createEl('div', { cls: 'setting-item-description' })
    this.controlEl = this.settingEl.createEl('div', { cls: 'setting-item-control' })
  }

  setName(name: string | DocumentFragment): this {
    if (name instanceof DocumentFragment) this.nameEl.appendChild(name)
    else this.nameEl.textContent = name
    return this
  }

  setDesc(desc: string | DocumentFragment): this {
    if (desc instanceof DocumentFragment) this.descEl.appendChild(desc)
    else this.descEl.textContent = desc
    return this
  }

  setHeading(): this { this.settingEl.classList.add('setting-item-heading'); return this }
  setClass(cls: string): this { this.settingEl.classList.add(cls); return this }
  setDisabled(d: boolean): this { this.settingEl.classList.toggle('is-disabled', d); return this }

  addText(cb: (t: TextComponent) => void): this       { cb(new TextComponent(this.controlEl)); return this }
  addTextArea(cb: (t: TextAreaComponent) => void): this { cb(new TextAreaComponent(this.controlEl)); return this }
  addToggle(cb: (t: ToggleComponent) => void): this   { cb(new ToggleComponent(this.controlEl)); return this }
  addButton(cb: (t: ButtonComponent) => void): this   { cb(new ButtonComponent(this.controlEl)); return this }
  addDropdown(cb: (t: DropdownComponent) => void): this { cb(new DropdownComponent(this.controlEl)); return this }
  addExtraButton(cb: (t: ButtonComponent) => void): this { cb(new ButtonComponent(this.controlEl)); return this }

  then(cb: (s: this) => void): this { cb(this); return this }
}

export class PluginSettingTab {
  app: any
  plugin: any
  containerEl: HTMLElement

  constructor(app: any, plugin: any) {
    this.app = app
    this.plugin = plugin
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'plugin-settings-tab'
  }

  display(): void {}
  hide(): void { this.containerEl.innerHTML = '' }
}
```

Note: `Setting.ts` uses `createEl` from the DOM augmentations (Task 7). Task 7 must run before plugins can use Setting in practice, but TypeScript will compile without error because the `HTMLElement` prototype extension is declared in `dom.ts`.

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors (or only errors related to missing `createEl` on HTMLElement — resolved in Task 7).

- [ ] **Step 3: Commit**

```
git add src/plugins/shim/Setting.ts
git commit -m "feat(plugins): Setting, PluginSettingTab, and input components"
```

---

## Task 7: DOM augmentations + shim barrel

**Files:**
- Create: `src/plugins/shim/dom.ts`
- Create: `src/plugins/shim/index.ts`

- [ ] **Step 1: Create `src/plugins/shim/dom.ts`**

This extends `HTMLElement.prototype` once at startup. Guard with `__browsidianPatched` to prevent double-patching in strict mode.

```typescript
declare global {
  interface HTMLElement {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      opts?: {
        cls?: string | string[]
        text?: string
        type?: string
        href?: string
        placeholder?: string
        value?: string
        title?: string
        attr?: Record<string, string | number | boolean>
      }
    ): HTMLElementTagNameMap[K]
    createDiv(opts?: string | { cls?: string | string[]; text?: string }): HTMLDivElement
    createSpan(opts?: string | { cls?: string | string[]; text?: string }): HTMLSpanElement
    empty(): void
    setText(text: string): void
    setAttr(key: string, value: string | number | boolean): void
    getAttr(key: string): string | null
    addClass(...classes: string[]): void
    removeClass(...classes: string[]): void
    toggleClass(cls: string | string[], value?: boolean): void
    hasClass(cls: string): boolean
    insertAfter(other: Node): void
  }
}

export function installDomAugmentations(): void {
  if ((HTMLElement.prototype as any).__browsidianPatched) return
  ;(HTMLElement.prototype as any).__browsidianPatched = true

  HTMLElement.prototype.createEl = function(tag, opts: any = {}) {
    const el = document.createElement(tag)
    const cls = typeof opts === 'string' ? opts : opts?.cls
    if (cls) el.className = Array.isArray(cls) ? cls.join(' ') : cls
    if (opts?.text)        el.textContent = opts.text
    if (opts?.href)        (el as any).href = opts.href
    if (opts?.type)        (el as any).type = opts.type
    if (opts?.placeholder) (el as any).placeholder = opts.placeholder
    if (opts?.value)       (el as any).value = opts.value
    if (opts?.title)       el.title = opts.title
    if (opts?.attr) {
      Object.entries(opts.attr as Record<string, any>).forEach(([k, v]) =>
        el.setAttribute(k, String(v))
      )
    }
    this.appendChild(el)
    return el
  }

  HTMLElement.prototype.createDiv = function(opts?: any) {
    return this.createEl('div', typeof opts === 'string' ? { cls: opts } : opts)
  }

  HTMLElement.prototype.createSpan = function(opts?: any) {
    return this.createEl('span', typeof opts === 'string' ? { cls: opts } : opts)
  }

  HTMLElement.prototype.empty = function() {
    while (this.firstChild) this.removeChild(this.firstChild)
  }

  HTMLElement.prototype.setText = function(text: string) {
    this.textContent = text
  }

  HTMLElement.prototype.setAttr = function(key: string, value: string | number | boolean) {
    this.setAttribute(key, String(value))
  }

  HTMLElement.prototype.getAttr = function(key: string) {
    return this.getAttribute(key)
  }

  HTMLElement.prototype.addClass = function(...classes: string[]) {
    classes.forEach(c => c && this.classList.add(c))
  }

  HTMLElement.prototype.removeClass = function(...classes: string[]) {
    classes.forEach(c => this.classList.remove(c))
  }

  HTMLElement.prototype.toggleClass = function(cls: string | string[], value?: boolean) {
    ;(Array.isArray(cls) ? cls : [cls]).forEach(c => {
      if (value === undefined) this.classList.toggle(c)
      else if (value) this.classList.add(c)
      else this.classList.remove(c)
    })
  }

  HTMLElement.prototype.hasClass = function(cls: string) {
    return this.classList.contains(cls)
  }

  HTMLElement.prototype.insertAfter = function(other: Node) {
    other.parentNode?.insertBefore(this, other.nextSibling)
  }
}
```

- [ ] **Step 2: Create `src/plugins/shim/index.ts`**

```typescript
export { Component }         from './Component'
export { Plugin }            from './Plugin'
export type { Command }      from './Plugin'
export { Vault, VaultAdapterShim } from './Vault'
export { Workspace, WorkspaceLeaf } from './Workspace'
export { Notice, Modal, SuggestModal, FuzzySuggestModal } from './components'
export {
  Setting, PluginSettingTab,
  TextComponent, TextAreaComponent, ToggleComponent, ButtonComponent, DropdownComponent,
} from './Setting'
export { TFile, TFolder, TAbstractFile } from './types'
export type { PluginManifest } from './types'
export { installDomAugmentations } from './dom'

declare const __IS_ELECTRON__: boolean

export const Platform = {
  isDesktop:    true,
  isMobile:     false,
  isElectron:   typeof __IS_ELECTRON__ !== 'undefined' && (__IS_ELECTRON__ as boolean),
  isMacOS:      /Mac/i.test(navigator.platform ?? ''),
  isWin:        /Win/i.test(navigator.platform ?? ''),
  isLinux:      /Linux/i.test(navigator.platform ?? ''),
  isIosApp:     false,
  isAndroidApp: false,
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

export function setIcon(el: HTMLElement, icon: string): void {
  el.setAttribute('data-icon', icon)
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T, timeout: number, immediate = false
): T {
  let timer: ReturnType<typeof setTimeout> | undefined
  return function(this: any, ...args: any[]) {
    if (immediate && timer === undefined) fn.apply(this, args)
    clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      if (!immediate) fn.apply(this, args)
    }, timeout)
  } as T
}

// Minimal moment shim — covers date formatting used by most plugins
export const moment: any = Object.assign(
  (value?: any) => {
    const d = value !== undefined ? new Date(value) : new Date()
    const m: any = {
      format: (_fmt?: string) => d.toLocaleDateString(),
      fromNow: () => 'recently',
      diff: () => 0,
      add: function() { return m },
      subtract: function() { return m },
      isBefore: () => false,
      isAfter: () => false,
      isSame: () => false,
      valueOf: () => d.getTime(),
      toDate: () => d,
      unix: () => Math.floor(d.getTime() / 1000),
      clone: () => moment(d),
      isValid: () => !isNaN(d.getTime()),
      toString: () => d.toISOString(),
    }
    return m
  },
  {
    utc: (v?: any) => moment(v),
    unix: (ts: number) => moment(ts * 1000),
    now: () => Date.now(),
    duration: () => ({ as: () => 0, humanize: () => '' }),
  }
)

export function parseFrontMatterEntry(cache: any, key: string): any {
  return cache?.frontmatter?.[key] ?? null
}

export function parseFrontMatterTags(cache: any): string[] {
  const tags = cache?.frontmatter?.tags
  if (!tags) return []
  return (Array.isArray(tags) ? tags : [tags]).map(String)
}

export function parseFrontMatterAliases(cache: any): string[] {
  const aliases = cache?.frontmatter?.aliases
  if (!aliases) return []
  return (Array.isArray(aliases) ? aliases : [aliases]).map(String)
}

export function sanitizeHTMLToDom(html: string): DocumentFragment {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  return tpl.content
}

export function htmlToMarkdown(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}

export const MarkdownRenderer = {
  async render(_app: any, markdown: string, el: HTMLElement, _source: string, _comp: any): Promise<void> {
    el.textContent = markdown
  },
  async renderMarkdown(markdown: string, el: HTMLElement, _source: string, _comp: any): Promise<void> {
    el.textContent = markdown
  },
}

export class MetadataCache {
  getFileCache(_file: any): any { return null }
  getFirstLinkpathDest(_path: string, _from: string): any { return null }
  resolvedLinks: Record<string, Record<string, number>> = {}
  unresolvedLinks: Record<string, Record<string, number>> = {}
  on(_event: string, _cb: Function): { unsubscribe: () => void } { return { unsubscribe: () => {} } }
  off(_event: string, _cb: Function): void {}
}

export class Menu {
  private _items: Array<{ text: string; cb: () => void }> = []
  private _el: HTMLElement | null = null

  addItem(cb: (item: MenuItem) => void): this {
    const item = new MenuItem(); cb(item)
    this._items.push({ text: item._text, cb: item._cb ?? (() => {}) })
    return this
  }

  addSeparator(): this { return this }

  showAtMouseEvent(e: MouseEvent): void { this._show(e.clientX, e.clientY) }
  showAtPosition(pos: { x: number; y: number }): void { this._show(pos.x, pos.y) }

  hide(): void { this._el?.remove(); this._el = null }

  private _show(x: number, y: number): void {
    this.hide()
    const el = document.createElement('div')
    el.className = 'context-menu plugin-menu'
    el.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:9999`
    for (const item of this._items) {
      const div = document.createElement('div')
      div.className = 'context-item'
      div.textContent = item.text
      div.addEventListener('click', () => { item.cb(); this.hide() })
      el.appendChild(div)
    }
    document.body.appendChild(el)
    this._el = el
    setTimeout(() => document.addEventListener('click', () => this.hide(), { once: true }), 0)
  }
}

export class MenuItem {
  _text = ''; _icon?: string; _cb?: () => void
  setTitle(t: string): this { this._text = t; return this }
  setIcon(i: string): this { this._icon = i; return this }
  onClick(cb: () => void): this { this._cb = cb; return this }
  setSection(_s: string): this { return this }
  setDisabled(_d: boolean): this { return this }
  setChecked(_c: boolean): this { return this }
  setIsLabel(_l: boolean): this { return this }
}

export const Keymap = {
  isModEvent: (_e: MouseEvent | KeyboardEvent) => false,
  isModifier: (_e: KeyboardEvent | MouseEvent, _modifier: string) => false,
}
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git add src/plugins/shim/dom.ts src/plugins/shim/index.ts
git commit -m "feat(plugins): DOM augmentations and shim barrel (obsidian module)"
```

---

## Task 8: Plugin store

**Files:**
- Create: `src/plugins/store.ts`

- [ ] **Step 1: Create `src/plugins/store.ts`**

```typescript
import { create } from 'zustand'
import type { PluginManifest } from './shim/types'

export interface LoadedPlugin {
  id:       string
  manifest: PluginManifest
  instance: any // Plugin instance; null when load failed
  error?:   string
  requiresElectron?: boolean
}

export interface CommunityPlugin {
  id:          string
  name:        string
  author:      string
  description: string
  repo:        string
}

interface PluginStoreState {
  loaded:              Map<string, LoadedPlugin>
  enabled:             Set<string>
  installing:          Set<string>
  communityList:       CommunityPlugin[]
  communityFetched:    boolean
  managerOpen:         boolean

  setLoaded(id: string, plugin: LoadedPlugin): void
  removeLoaded(id: string): void
  setEnabled(id: string, value: boolean): void
  setInstalling(id: string, value: boolean): void
  setCommunityList(list: CommunityPlugin[]): void
  setManagerOpen(open: boolean): void
}

export const usePluginStore = create<PluginStoreState>((set) => ({
  loaded:           new Map(),
  enabled:          new Set(),
  installing:       new Set(),
  communityList:    [],
  communityFetched: false,
  managerOpen:      false,

  setLoaded: (id, plugin) => set(s => {
    const loaded = new Map(s.loaded); loaded.set(id, plugin); return { loaded }
  }),

  removeLoaded: (id) => set(s => {
    const loaded = new Map(s.loaded); loaded.delete(id); return { loaded }
  }),

  setEnabled: (id, value) => set(s => {
    const enabled = new Set(s.enabled)
    if (value) enabled.add(id); else enabled.delete(id)
    return { enabled }
  }),

  setInstalling: (id, value) => set(s => {
    const installing = new Set(s.installing)
    if (value) installing.add(id); else installing.delete(id)
    return { installing }
  }),

  setCommunityList: (list) => set({ communityList: list, communityFetched: true }),
  setManagerOpen:   (open) => set({ managerOpen: open }),
}))
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/plugins/store.ts
git commit -m "feat(plugins): Zustand plugin store"
```

---

## Task 9: Plugin loader

**Files:**
- Create: `src/plugins/loader.ts`

- [ ] **Step 1: Create `src/plugins/loader.ts`**

This is the core of the plugin system. It creates the singleton `app` object and executes plugin `main.js` with the shim injected via `new Function(...)`.

```typescript
import * as obsidianShim from './shim'
import { installDomAugmentations } from './shim/dom'
import { Vault } from './shim/Vault'
import { Workspace } from './shim/Workspace'
import { MetadataCache } from './shim/index'
import { usePluginStore, type LoadedPlugin } from './store'
import { useVaultStore } from '@/stores/vault'
import type { PluginManifest } from './shim/types'

// Install DOM augmentations once when this module loads
installDomAugmentations()

// ─── Singleton app object passed to every plugin ───────────────────────────

const vault     = new Vault()
const workspace = new Workspace()
const metadataCache = new MetadataCache()

const commandRegistry = {
  _cmds: new Map<string, any>(),
  register(cmd: any)    { this._cmds.set(cmd.id, cmd) },
  unregister(id: string) { this._cmds.delete(id) },
  listCommands()         { return Array.from(this._cmds.values()) },
  executeCommandById(id: string) {
    const cmd = this._cmds.get(id)
    if (cmd?.callback) cmd.callback()
    return !!cmd
  },
}

const settingTabs = new Map<string, any>()

export const obsidianApp = {
  vault,
  workspace,
  metadataCache,
  commands: commandRegistry,
  plugins: {
    getPlugin: (id: string) => usePluginStore.getState().loaded.get(id)?.instance ?? null,
    _registerSettingTab: (id: string, tab: any) => settingTabs.set(id, tab),
    _getSettingTab:      (id: string) => settingTabs.get(id),
    _getAllTabs:          () => Array.from(settingTabs.entries()),
  },
  keymap: { pushScope: () => {}, popScope: () => {} },
  scope:  { register: () => {}, unregister: () => {} },
}

// ─── require() factory ────────────────────────────────────────────────────

const NODE_MODULES = ['fs', 'fs/promises', 'path', 'os', 'child_process', 'net', 'http', 'https', 'crypto', 'stream', 'buffer', 'util', 'events', 'readline']

function makeRequire(pluginId: string) {
  return function fakeRequire(mod: string): any {
    if (mod === 'obsidian') return obsidianShim
    if (mod === 'electron') return { remote: null, ipcRenderer: null, shell: null }
    if (NODE_MODULES.includes(mod)) {
      throw new Error(
        `[plugin:${pluginId}] require('${mod}') not available in web mode. ` +
        `This plugin requires Electron.`
      )
    }
    // Some plugins bundle their own deps — attempt to return an empty module
    console.warn(`[plugin:${pluginId}] Unknown require('${mod}') — returning empty module`)
    return {}
  }
}

// ─── Detection ───────────────────────────────────────────────────────────

export function detectRequiresElectron(code: string): boolean {
  return /require\(\s*['"](?:fs|fs\/promises|path|os|electron|child_process|net|readline)['"]\s*\)/.test(code)
}

// ─── Core loader ─────────────────────────────────────────────────────────

export async function loadPlugin(
  pluginDir: string,
  manifest: PluginManifest
): Promise<LoadedPlugin> {
  const id = manifest.id
  const adapter = useVaultStore.getState().adapter
  if (!adapter) throw new Error('No vault adapter')

  const mainFile = `${pluginDir}/${manifest.main ?? 'main.js'}`
  const code = await adapter.readFile(mainFile)

  const requiresElectron = detectRequiresElectron(code)

  const mod = { exports: {} as any }
  const fakeRequire = makeRequire(id)

  try {
    const fn = new Function('module', 'exports', 'require', code)
    fn(mod, mod.exports, fakeRequire)
  } catch (err) {
    throw new Error(`[plugin:${id}] Execution failed: ${(err as Error).message}`)
  }

  const PluginClass = mod.exports?.default ?? mod.exports
  if (typeof PluginClass !== 'function') {
    throw new Error(`[plugin:${id}] No valid plugin class exported`)
  }

  const instance = new PluginClass(obsidianApp, manifest)
  await instance.load()

  return { id, manifest, instance, requiresElectron }
}

// ─── Discovery ───────────────────────────────────────────────────────────

export async function discoverPlugins(): Promise<Array<{ dir: string; manifest: PluginManifest }>> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) return []
  try {
    const entries = await adapter.listFiles('.obsidian/plugins')
    const results: Array<{ dir: string; manifest: PluginManifest }> = []
    for (const entry of entries) {
      if (!entry.isDir) continue
      try {
        const raw = await adapter.readFile(`${entry.path}/manifest.json`)
        results.push({ dir: entry.path, manifest: JSON.parse(raw) as PluginManifest })
      } catch {}
    }
    return results
  } catch {
    return []
  }
}

async function getEnabledIds(): Promise<string[]> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) return []
  try {
    return JSON.parse(await adapter.readFile('.obsidian/community-plugins.json'))
  } catch {
    return []
  }
}

async function saveEnabledIds(ids: string[]): Promise<void> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) return
  await adapter.writeFile('.obsidian/community-plugins.json', JSON.stringify(ids, null, 2))
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

export async function loadEnabledPlugins(): Promise<void> {
  const enabledIds = await getEnabledIds()
  const discovered = await discoverPlugins()
  const { setLoaded, setEnabled } = usePluginStore.getState()

  for (const { dir, manifest } of discovered) {
    if (!enabledIds.includes(manifest.id)) continue
    try {
      const loaded = await loadPlugin(dir, manifest)
      setLoaded(manifest.id, loaded)
      setEnabled(manifest.id, true)
    } catch (err) {
      setLoaded(manifest.id, {
        id: manifest.id, manifest, instance: null,
        error: (err as Error).message,
      })
    }
  }
}

export async function unloadPlugin(id: string): Promise<void> {
  const { loaded, removeLoaded, setEnabled } = usePluginStore.getState()
  const plugin = loaded.get(id)
  if (plugin?.instance) {
    try { plugin.instance.unload() } catch {}
  }
  // Unregister all commands from this plugin
  commandRegistry._cmds.forEach((_, cmdId) => {
    if (cmdId.startsWith(`${id}:`)) commandRegistry.unregister(cmdId)
  })
  settingTabs.delete(id)
  removeLoaded(id)
  setEnabled(id, false)
}

export async function togglePlugin(id: string, enable: boolean): Promise<void> {
  const enabledIds = await getEnabledIds()
  const next = enable
    ? [...new Set([...enabledIds, id])]
    : enabledIds.filter(e => e !== id)
  await saveEnabledIds(next)

  if (enable) {
    const discovered = await discoverPlugins()
    const found = discovered.find(p => p.manifest.id === id)
    if (!found) throw new Error(`Plugin '${id}' not found in .obsidian/plugins/`)
    const loaded = await loadPlugin(found.dir, found.manifest)
    usePluginStore.getState().setLoaded(id, loaded)
    usePluginStore.getState().setEnabled(id, true)
  } else {
    await unloadPlugin(id)
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/plugins/loader.ts
git commit -m "feat(plugins): plugin loader — discovery, execution, lifecycle"
```

---

## Task 10: Plugin registry (community browser backend)

**Files:**
- Create: `src/plugins/registry.ts`

- [ ] **Step 1: Create `src/plugins/registry.ts`**

```typescript
import { useVaultStore } from '@/stores/vault'
import { usePluginStore } from './store'
import type { CommunityPlugin } from './store'

const COMMUNITY_LIST_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json'

export async function fetchCommunityList(): Promise<CommunityPlugin[]> {
  const { communityFetched, communityList } = usePluginStore.getState()
  if (communityFetched) return communityList

  const res = await fetch(COMMUNITY_LIST_URL)
  if (!res.ok) throw new Error(`Failed to fetch plugin list: ${res.status}`)
  const list = await res.json() as CommunityPlugin[]
  usePluginStore.getState().setCommunityList(list)
  return list
}

export async function installPlugin(plugin: CommunityPlugin): Promise<void> {
  const { setInstalling } = usePluginStore.getState()
  const adapter = useVaultStore.getState().adapter
  if (!adapter) throw new Error('No vault adapter')

  setInstalling(plugin.id, true)
  try {
    // Resolve latest release tag
    const releaseRes = await fetch(
      `https://api.github.com/repos/${plugin.repo}/releases/latest`
    )
    if (!releaseRes.ok) {
      throw new Error(`GitHub API error ${releaseRes.status} for ${plugin.repo}`)
    }
    const release = await releaseRes.json() as { tag_name: string }
    const base = `https://github.com/${plugin.repo}/releases/download/${release.tag_name}`

    const pluginDir = `.obsidian/plugins/${plugin.id}`
    if (adapter.mkdir) await adapter.mkdir(pluginDir)

    // Download required files (main.js + manifest.json)
    for (const file of ['main.js', 'manifest.json']) {
      const fileRes = await fetch(`${base}/${file}`)
      if (!fileRes.ok) throw new Error(`Failed to download ${file}: ${fileRes.status}`)
      await adapter.writeFile(`${pluginDir}/${file}`, await fileRes.text())
    }

    // styles.css is optional — ignore errors
    try {
      const stylesRes = await fetch(`${base}/styles.css`)
      if (stylesRes.ok) {
        await adapter.writeFile(`${pluginDir}/styles.css`, await stylesRes.text())
      }
    } catch {}
  } finally {
    setInstalling(plugin.id, false)
  }
}

export async function uninstallPlugin(id: string): Promise<void> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) throw new Error('No vault adapter')
  await adapter.deleteFile(`.obsidian/plugins/${id}`)
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/plugins/registry.ts
git commit -m "feat(plugins): registry — GitHub API download and install"
```

---

## Task 11: PluginCard + InstalledTab

**Files:**
- Create: `src/components/PluginManager/PluginCard.tsx`
- Create: `src/components/PluginManager/InstalledTab.tsx`

- [ ] **Step 1: Create `src/components/PluginManager/PluginCard.tsx`**

```tsx
import type { LoadedPlugin, CommunityPlugin } from '@/plugins/store'

interface InstalledCardProps {
  plugin: LoadedPlugin
  enabled: boolean
  onToggle: (enable: boolean) => void
  onUninstall: () => void
}

export function InstalledPluginCard({ plugin, enabled, onToggle, onUninstall }: InstalledCardProps) {
  return (
    <div className="plugin-card">
      <div className="plugin-card-info">
        <div className="plugin-card-title">
          {plugin.manifest.name}
          {plugin.requiresElectron && (
            <span className="plugin-badge plugin-badge-warn">⚠ Requires Electron</span>
          )}
          {plugin.error && (
            <span className="plugin-badge plugin-badge-error" title={plugin.error}>Error</span>
          )}
        </div>
        <div className="plugin-card-meta">
          by {plugin.manifest.author ?? 'Unknown'} · v{plugin.manifest.version}
        </div>
        {plugin.error && (
          <div className="plugin-card-error">{plugin.error}</div>
        )}
        {plugin.manifest.description && (
          <div className="plugin-card-desc">{plugin.manifest.description}</div>
        )}
      </div>
      <div className="plugin-card-actions">
        <label className="toggle" title={enabled ? 'Disable plugin' : 'Enable plugin'}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="toggle-track" />
        </label>
        {!enabled && (
          <button className="btn btn-ghost plugin-uninstall" onClick={onUninstall}>
            Uninstall
          </button>
        )}
      </div>
    </div>
  )
}

interface CommunityCardProps {
  plugin: CommunityPlugin
  installed: boolean
  installing: boolean
  onInstall: () => void
}

export function CommunityPluginCard({ plugin, installed, installing, onInstall }: CommunityCardProps) {
  return (
    <div className="plugin-card">
      <div className="plugin-card-info">
        <div className="plugin-card-title">{plugin.name}</div>
        <div className="plugin-card-meta">by {plugin.author}</div>
        <div className="plugin-card-desc">{plugin.description}</div>
      </div>
      <div className="plugin-card-actions">
        {installed ? (
          <span className="plugin-badge plugin-badge-ok">Installed</span>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/PluginManager/InstalledTab.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { usePluginStore } from '@/plugins/store'
import { discoverPlugins } from '@/plugins/loader'
import { togglePlugin, unloadPlugin } from '@/plugins/loader'
import { uninstallPlugin } from '@/plugins/registry'
import { useUIStore } from '@/stores/ui'
import { InstalledPluginCard } from './PluginCard'
import type { PluginManifest } from '@/plugins/shim/types'

export function InstalledTab() {
  const { loaded, enabled, setLoaded, removeLoaded } = usePluginStore()
  const { setStatus } = useUIStore()
  const [discovered, setDiscovered] = useState<Array<{ id: string; manifest: PluginManifest }>>([])

  useEffect(() => {
    discoverPlugins().then(list =>
      setDiscovered(list.map(p => ({ id: p.manifest.id, manifest: p.manifest })))
    )
  }, [loaded.size])

  if (discovered.length === 0) {
    return (
      <div className="plugin-tab-empty">
        No plugins found in <code>.obsidian/plugins/</code>. Install one from the Community tab.
      </div>
    )
  }

  return (
    <div className="plugin-list">
      {discovered.map(({ id, manifest }) => {
        const loadedPlugin = loaded.get(id) ?? { id, manifest, instance: null }
        const isEnabled = enabled.has(id)
        return (
          <InstalledPluginCard
            key={id}
            plugin={loadedPlugin}
            enabled={isEnabled}
            onToggle={async (enable) => {
              try {
                await togglePlugin(id, enable)
              } catch (err) {
                setStatus(`Plugin error: ${(err as Error).message}`)
              }
            }}
            onUninstall={async () => {
              if (!confirm(`Uninstall "${manifest.name}"?`)) return
              try {
                await uninstallPlugin(id)
                removeLoaded(id)
                setDiscovered(d => d.filter(p => p.id !== id))
              } catch (err) {
                setStatus(`Uninstall failed: ${(err as Error).message}`)
              }
            }}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```
git add src/components/PluginManager/PluginCard.tsx src/components/PluginManager/InstalledTab.tsx
git commit -m "feat(plugins): InstalledTab and PluginCard components"
```

---

## Task 12: CommunityTab

**Files:**
- Create: `src/components/PluginManager/CommunityTab.tsx`

- [ ] **Step 1: Create `src/components/PluginManager/CommunityTab.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { usePluginStore } from '@/plugins/store'
import { fetchCommunityList, installPlugin } from '@/plugins/registry'
import { useUIStore } from '@/stores/ui'
import { CommunityPluginCard } from './PluginCard'

const PAGE_SIZE = 30

export function CommunityTab() {
  const { communityList, communityFetched, installing, loaded } = usePluginStore()
  const { setStatus } = useUIStore()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (communityFetched) return
    setLoading(true)
    fetchCommunityList()
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [communityFetched])

  // Reset page when search query changes
  useEffect(() => { setPage(1) }, [query])

  const filtered = useMemo(() => {
    if (!query.trim()) return communityList
    const q = query.toLowerCase()
    return communityList.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q)
    )
  }, [communityList, query])

  const visible = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < filtered.length

  if (loading) return <div className="plugin-tab-empty">Loading community plugins…</div>
  if (error)   return <div className="plugin-tab-empty plugin-tab-error">Error: {error}</div>

  return (
    <div className="plugin-community">
      <input
        className="plugin-search"
        type="search"
        placeholder="Search plugins…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoFocus
      />
      <div className="plugin-list">
        {visible.map(plugin => (
          <CommunityPluginCard
            key={plugin.id}
            plugin={plugin}
            installed={loaded.has(plugin.id) || /* installed but not loaded */ false}
            installing={installing.has(plugin.id)}
            onInstall={async () => {
              try {
                await installPlugin(plugin)
                setStatus(`${plugin.name} installed. Enable it in the Installed tab.`)
              } catch (err) {
                setStatus(`Install failed: ${(err as Error).message}`)
              }
            }}
          />
        ))}
        {filtered.length === 0 && (
          <div className="plugin-tab-empty">No plugins match "{query}".</div>
        )}
      </div>
      {hasMore && (
        <button className="btn btn-secondary plugin-load-more" onClick={() => setPage(p => p + 1)}>
          Load more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/components/PluginManager/CommunityTab.tsx
git commit -m "feat(plugins): CommunityTab with search, pagination, and install"
```

---

## Task 13: PluginManager modal

**Files:**
- Create: `src/components/PluginManager/index.tsx`

- [ ] **Step 1: Create `src/components/PluginManager/index.tsx`**

Uses native `<dialog>` element — same pattern as `DropboxPathPicker`.

```tsx
import { useEffect, useRef, useState } from 'react'
import { usePluginStore } from '@/plugins/store'
import { InstalledTab } from './InstalledTab'
import { CommunityTab } from './CommunityTab'

type Tab = 'installed' | 'community'

export function PluginManager() {
  const { managerOpen, setManagerOpen } = usePluginStore()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>('installed')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (managerOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [managerOpen])

  return (
    <dialog
      ref={dialogRef}
      className="plugin-manager-dialog"
      onCancel={(e) => { e.preventDefault(); setManagerOpen(false) }}
    >
      <div className="plugin-manager">
        <div className="plugin-manager-header">
          <span className="plugin-manager-title">Plugins</span>
          <button className="btn btn-ghost plugin-manager-close" onClick={() => setManagerOpen(false)}>
            ✕
          </button>
        </div>

        <div className="plugin-manager-tabs">
          <button
            className={`plugin-tab-btn${activeTab === 'installed' ? ' active' : ''}`}
            onClick={() => setActiveTab('installed')}
          >
            Installed
          </button>
          <button
            className={`plugin-tab-btn${activeTab === 'community' ? ' active' : ''}`}
            onClick={() => setActiveTab('community')}
          >
            Community
          </button>
        </div>

        <div className="plugin-manager-body">
          {activeTab === 'installed' ? <InstalledTab /> : <CommunityTab />}
        </div>
      </div>
    </dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/components/PluginManager/index.tsx
git commit -m "feat(plugins): PluginManager modal with Installed/Community tabs"
```

---

## Task 14: Wire up StatusBar + App.tsx + CSS

**Files:**
- Modify: `src/components/StatusBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/global.css` (add plugin manager CSS)

- [ ] **Step 1: Add plugin manager button to `src/components/StatusBar.tsx`**

Add a puzzle-piece button that opens the plugin manager. Import `usePluginStore` and add the button inside `.status-right`, before the theme toggle.

```tsx
import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/ui'
import { usePluginStore } from '@/plugins/store'

export function StatusBar() {
  const { status, theme, toggleTheme } = useUIStore()
  const { setManagerOpen } = usePluginStore()
  const [version, setVersion] = useState('')

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => { if (cfg?.version) setVersion(String(cfg.version)) })
      .catch(() => {})
  }, [])

  return (
    <div className="statusbar">
      <span className="status-msg">{status}</span>
      <div className="status-right">
        <div className="meta">
          {version && <span className="version-badge meta-item">v{version}</span>}
          <span className="meta-sep">·</span>
          <a
            className="meta-item"
            href="https://github.com/blamouche/browsidian"
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub
          </a>
        </div>
        <button
          className="btn btn-ghost plugin-manager-btn"
          title="Plugins"
          onClick={() => setManagerOpen(true)}
        >
          ⬡
        </button>
        <label className="toggle" title="Toggle light/dark theme">
          <input
            type="checkbox"
            checked={theme === 'light'}
            onChange={toggleTheme}
          />
          <span className="toggle-track" />
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount PluginManager and load plugins in `src/App.tsx`**

Add two changes to the existing `App.tsx`:
1. Import and mount `<PluginManager />` inside the vault-open layout (alongside `<ContextMenu />`).
2. Call `loadEnabledPlugins()` in the boot function after the vault is ready.

```tsx
// Add to existing imports at the top of src/App.tsx:
import { PluginManager } from '@/components/PluginManager'
import { loadEnabledPlugins } from '@/plugins/loader'
```

In the `boot()` function, after `setReady(true)`, add the plugin load call. The full `boot` function becomes:

```typescript
async function boot() {
  try {
    if (typeof __IS_ELECTRON__ !== 'undefined' && __IS_ELECTRON__) {
      await initElectronMode().catch(() => {})
    } else {
      await initServerMode().catch(() => {})
      if (!useVaultStore.getState().vaultPath) {
        await restoreBrowserMode().catch(() => {})
      }
    }
  } finally {
    setReady(true)
    // Load plugins after vault is ready (non-blocking — errors are caught per-plugin)
    if (useVaultStore.getState().vaultPath) {
      loadEnabledPlugins().catch(() => {})
    }
  }
}
```

In the vault-open layout JSX, add `<PluginManager />` after `<ContextMenu />`:

```tsx
<ContextMenu />
<PluginManager />
```

- [ ] **Step 3: Add plugin manager CSS to `src/styles/global.css`**

Append to the end of the file:

```css
/* ─── Plugin Manager ────────────────────────────────────────────── */

.plugin-manager-btn {
  padding: 2px 6px;
  font-size: 14px;
  color: var(--text-muted);
  cursor: pointer;
  border: none;
  background: none;
}
.plugin-manager-btn:hover { color: var(--text); }

.plugin-manager-dialog {
  width: min(720px, 96vw);
  max-height: 80vh;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  padding: 0;
  overflow: hidden;
}
.plugin-manager-dialog::backdrop { background: rgba(0,0,0,.5); }

.plugin-manager { display: flex; flex-direction: column; height: 100%; }

.plugin-manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.plugin-manager-title { font-weight: 600; font-size: 15px; }
.plugin-manager-close { font-size: 16px; }

.plugin-manager-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  padding: 0 16px;
}
.plugin-tab-btn {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  margin-bottom: -1px;
}
.plugin-tab-btn.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}

.plugin-manager-body { flex: 1; overflow-y: auto; padding: 12px 16px; }

.plugin-search {
  width: 100%;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 13px;
  margin-bottom: 12px;
  box-sizing: border-box;
}

.plugin-list { display: flex; flex-direction: column; gap: 8px; }

.plugin-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
}
.plugin-card-info { flex: 1; min-width: 0; }
.plugin-card-title { font-weight: 500; font-size: 13px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.plugin-card-meta  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.plugin-card-desc  { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.plugin-card-error { font-size: 11px; color: var(--danger, #e55); margin-top: 4px; white-space: pre-wrap; }
.plugin-card-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }

.plugin-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}
.plugin-badge-warn  { background: rgba(255,180,0,.15); color: #f0a000; }
.plugin-badge-error { background: rgba(220,50,50,.15);  color: #e55; }
.plugin-badge-ok    { background: rgba(80,200,100,.15); color: #4c8; }

.plugin-uninstall { font-size: 11px; color: var(--danger, #e55); }
.plugin-tab-empty  { color: var(--text-muted); text-align: center; padding: 32px 0; font-size: 13px; }
.plugin-tab-error  { color: var(--danger, #e55); }
.plugin-load-more  { width: 100%; margin-top: 8px; }
.plugin-community  { display: flex; flex-direction: column; }

/* Setting items rendered by plugins */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}
.setting-item-info    { flex: 1; min-width: 0; }
.setting-item-name    { font-weight: 500; font-size: 13px; }
.setting-item-description { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.setting-item-control { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.setting-item-heading .setting-item-name { font-size: 14px; font-weight: 600; }

.setting-input,
.setting-textarea,
.setting-dropdown {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  padding: 4px 8px;
  font-size: 13px;
}
.setting-btn { font-size: 12px; }

/* Obsidian plugin modals */
.obsidian-plugin-modal {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  color: var(--text);
  padding: 0;
  max-width: 600px;
  width: 90vw;
}
.obsidian-plugin-modal::backdrop { background: rgba(0,0,0,.5); }
.modal-container { padding: 16px; }
.prompt-input {
  width: 100%;
  padding: 6px 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-size: 13px;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.prompt-results { max-height: 300px; overflow-y: auto; }
.suggestion-item {
  padding: 6px 10px;
  cursor: pointer;
  border-radius: var(--radius);
  font-size: 13px;
}
.suggestion-item:hover { background: var(--hover); }
```

- [ ] **Step 4: Verify TypeScript and run app**

```
npx tsc --noEmit
```

Expected: 0 errors.

```
npm run dev:web
```

Open `http://localhost:5173`. Open a vault. Click the ⬡ button in the status bar. Verify:
- Plugin Manager modal opens
- Installed tab shows plugins if `.obsidian/plugins/` has any
- Community tab fetches the list from GitHub
- Toggling an enabled plugin calls `plugin.onload()` / `plugin.onunload()`
- Toasts appear for install/error events

- [ ] **Step 5: Bump version and commit**

In `package.json`, increment `Z` in `"version"` (e.g., `1.2.0` → `1.2.1`). Update `README.md` to mention plugin support.

```
git add src/components/StatusBar.tsx src/App.tsx src/styles/global.css package.json README.md
git commit -m "feat(plugins): wire PluginManager into StatusBar and App, add CSS"
```

---

## Self-Review Checklist

- [x] **Spec: Shim types (TFile, TFolder, TAbstractFile)** → Task 1
- [x] **Spec: Component + Plugin lifecycle** → Tasks 1, 2
- [x] **Spec: Vault shim (delegates to VaultAdapter)** → Task 3
- [x] **Spec: Workspace shim (delegates to VaultStore.activeFile)** → Task 4
- [x] **Spec: Notice → browsidian:notice CustomEvent** → Task 5
- [x] **Spec: Modal** → Task 5
- [x] **Spec: SuggestModal, FuzzySuggestModal** → Task 5
- [x] **Spec: Setting, PluginSettingTab, input components** → Task 6
- [x] **Spec: DOM augmentations (createEl, createDiv, empty, etc.)** → Task 7
- [x] **Spec: Platform, normalizePath, debounce, moment, Menu, MetadataCache** → Task 7
- [x] **Spec: Plugin store** → Task 8
- [x] **Spec: Plugin loader (discovery, execution, lifecycle)** → Task 9
- [x] **Spec: detectRequiresElectron** → Task 9
- [x] **Spec: Community registry (GitHub API, install, uninstall)** → Task 10
- [x] **Spec: PluginCard** → Task 11
- [x] **Spec: InstalledTab** → Task 11
- [x] **Spec: CommunityTab with search + pagination** → Task 12
- [x] **Spec: PluginManager modal** → Task 13
- [x] **Spec: StatusBar plugin button** → Task 14
- [x] **Spec: App init loadEnabledPlugins after vault ready** → Task 14
- [x] **Spec: CSS for all new components** → Task 14
- [x] **Spec: ⚠ Requires Electron badge** → Task 11 (InstalledPluginCard shows `requiresElectron`)
- [x] **No TBDs or placeholders found**
- [x] **Type consistency**: `LoadedPlugin.instance`, `PluginManifest`, `activeFile` (not `currentFile`), `browsidian:notice` CustomEvent — all consistent across tasks
