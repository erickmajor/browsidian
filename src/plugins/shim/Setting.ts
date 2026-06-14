// Forward declaration for DOM augmentations installed by dom.ts
declare global {
  interface HTMLElement {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      opts?: { cls?: string | string[]; text?: string; type?: string; href?: string; placeholder?: string; value?: string; title?: string; attr?: Record<string, string | number | boolean> }
    ): HTMLElementTagNameMap[K]
    createDiv(opts?: string | { cls?: string | string[]; text?: string }): HTMLDivElement
    createSpan(opts?: string | { cls?: string | string[]; text?: string }): HTMLSpanElement
  }
}

class BaseInputComponent<T> {
  protected _cbs: Array<(v: T) => void> = []
  onChange(cb: (v: T) => void): this { this._cbs.push(cb); return this }
  protected _fire(v: T): void {
    this._cbs.forEach(cb => {
      try { cb(v) } catch (err) { console.warn('[Setting] onChange callback error:', err) }
    })
  }
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
    this.inputEl = container.createEl('textarea', { cls: 'setting-textarea' }) as HTMLTextAreaElement
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
    this.buttonEl = container.createEl('button', { cls: 'btn btn-secondary setting-btn' }) as HTMLButtonElement
    this.buttonEl.addEventListener('click', (e) => this._fire(e))
  }
  setButtonText(t: string): this { this.buttonEl.textContent = t; return this }
  setCta(): this {
    this.buttonEl.classList.remove('btn-secondary')
    this.buttonEl.classList.add('btn-primary')
    return this
  }
  setWarning(): this { this.buttonEl.style.color = 'var(--danger, #e55)'; return this }
  setDisabled(d: boolean): this { this.buttonEl.disabled = d; return this }
  setIcon(_icon: string): this { return this }
  setTooltip(tooltip: string): this { this.buttonEl.title = tooltip; return this }
  onClick(cb: (e: MouseEvent) => void): this { this.buttonEl.addEventListener('click', cb); return this }
}

export class DropdownComponent extends BaseInputComponent<string> {
  selectEl: HTMLSelectElement
  constructor(container: HTMLElement) {
    super()
    this.selectEl = container.createEl('select', { cls: 'setting-dropdown' }) as HTMLSelectElement
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
