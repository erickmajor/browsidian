import { Component } from './Component'

// ─── ItemView ─────────────────────────────────────────────────────────────────

export class ItemView extends Component {
  app: any = null
  leaf: any = null
  icon = 'document'
  navigation = false
  containerEl: HTMLElement
  contentEl: HTMLElement

  constructor(leaf?: any) {
    super()
    this.leaf = leaf ?? null
    this.containerEl = document.createElement('div')
    this.containerEl.className = 'view-container'
    this.contentEl = document.createElement('div')
    this.contentEl.className = 'view-content'
    this.containerEl.appendChild(this.contentEl)
  }

  getViewType(): string { return '' }
  getDisplayText(): string { return '' }
  getIcon(): string { return this.icon }

  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}

  getState(): any { return {} }
  setState(_state: any, _result: any): Promise<void> { return Promise.resolve() }
  getEphemeralState(): any { return {} }
  setEphemeralState(_state: any): void {}
}

// ─── FileView ─────────────────────────────────────────────────────────────────

export class FileView extends ItemView {
  file: any = null
  allowNoFile = false

  getDisplayText(): string { return this.file?.basename ?? '' }

  async onLoadFile(_file: any): Promise<void> {}
  async onUnloadFile(_file: any): Promise<void> {}
  async onRename(_file: any): Promise<void> {}
  canAcceptExtension(_extension: string): boolean { return false }
}

// ─── MarkdownView ─────────────────────────────────────────────────────────────

export class MarkdownView extends FileView {
  editor: any = null
  previewMode: any = null

  getViewType(): string { return 'markdown' }
  getMode(): 'source' | 'preview' { return 'source' }
  showSearch(): void {}
}

// ─── AbstractInputSuggest ─────────────────────────────────────────────────────

export abstract class AbstractInputSuggest<T> extends Component {
  protected inputEl: HTMLInputElement
  protected app: any

  constructor(app: any, inputEl: HTMLInputElement) {
    super()
    this.app    = app
    this.inputEl = inputEl
    inputEl.addEventListener('input', () => this._onInput())
    inputEl.addEventListener('keydown', (e) => this._onKeydown(e))
  }

  abstract getSuggestions(query: string): T[] | Promise<T[]>
  abstract renderSuggestion(value: T, el: HTMLElement): void
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void

  private _el: HTMLElement | null = null
  private _items: T[] = []
  private _active = -1

  private async _onInput() {
    const q = this.inputEl.value
    this._items = await Promise.resolve(this.getSuggestions(q))
    this._render()
  }

  private _onKeydown(e: KeyboardEvent) {
    if (!this._el) return
    if (e.key === 'ArrowDown') { e.preventDefault(); this._active = Math.min(this._active + 1, this._items.length - 1); this._render() }
    if (e.key === 'ArrowUp')   { e.preventDefault(); this._active = Math.max(this._active - 1, 0); this._render() }
    if (e.key === 'Enter' && this._active >= 0) { e.preventDefault(); this.selectSuggestion(this._items[this._active], e); this.close() }
    if (e.key === 'Escape') this.close()
  }

  private _render() {
    this.close()
    if (!this._items.length) return
    const el = document.createElement('div')
    el.className = 'suggestion-container plugin-suggest'
    const rect = this.inputEl.getBoundingClientRect()
    el.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom}px;min-width:${rect.width}px;z-index:9999`
    this._items.forEach((item, i) => {
      const row = document.createElement('div')
      row.className = 'suggestion-item' + (i === this._active ? ' is-selected' : '')
      this.renderSuggestion(item, row)
      row.addEventListener('mousedown', (e) => { e.preventDefault(); this.selectSuggestion(item, e); this.close() })
      el.appendChild(row)
    })
    document.body.appendChild(el)
    this._el = el
    setTimeout(() => document.addEventListener('click', () => this.close(), { once: true }), 0)
  }

  open(): void { this._onInput() }

  close(): void {
    this._el?.remove()
    this._el = null
    this._active = -1
  }

  setValue(value: string): this { this.inputEl.value = value; return this }
  getValue(): string { return this.inputEl.value }

  setPlaceholder(placeholder: string): this { this.inputEl.placeholder = placeholder; return this }
}
