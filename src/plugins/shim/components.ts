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
    this.inputEl.addEventListener('input', () => this._render())
    this.resultContainerEl = document.createElement('div')
    this.resultContainerEl.className = 'prompt-results'
    this.contentEl.appendChild(this.inputEl)
    this.contentEl.appendChild(this.resultContainerEl)
  }

  onOpen(): void {
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
