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
