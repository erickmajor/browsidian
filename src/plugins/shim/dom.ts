declare global {
  interface EventTarget {
    on(event: string, callback: (this: EventTarget, ev: Event) => any, options?: boolean | AddEventListenerOptions): void
    on(event: string, selector: string, callback: (this: HTMLElement, ev: Event, delegateTarget: HTMLElement) => any, options?: boolean | AddEventListenerOptions): void
    off(event: string, callback: (this: EventTarget, ev: Event) => any, options?: boolean | EventListenerOptions): void
    off(event: string, selector: string, callback: (this: HTMLElement, ev: Event, delegateTarget: HTMLElement) => any, options?: boolean | EventListenerOptions): void
  }
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

  // Obsidian adds .on()/.off() to EventTarget — covers document, window, HTMLElement
  ;(EventTarget.prototype as any).on = function(
    this: EventTarget,
    event: string,
    selectorOrCallback: string | ((ev: Event) => any),
    callbackOrOptions?: ((ev: Event, delegateTarget: HTMLElement) => any) | boolean | AddEventListenerOptions,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (typeof selectorOrCallback === 'function') {
      this.addEventListener(event, selectorOrCallback, callbackOrOptions as boolean | AddEventListenerOptions)
    } else {
      const selector = selectorOrCallback
      const cb = callbackOrOptions as (ev: Event, delegateTarget: HTMLElement) => any
      const handler = (e: Event) => {
        const target = (e.target as Element)?.closest(selector) as HTMLElement | null
        if (target) cb.call(target, e, target)
      }
      ;(this as any).__obsHandlers ??= new WeakMap()
      ;(this as any).__obsHandlers.set(cb, handler)
      this.addEventListener(event, handler, options)
    }
  }

  ;(EventTarget.prototype as any).off = function(
    this: EventTarget,
    event: string,
    selectorOrCallback: string | ((ev: Event) => any),
    callbackOrOptions?: ((ev: Event) => any) | boolean | EventListenerOptions,
    options?: boolean | EventListenerOptions
  ): void {
    if (typeof selectorOrCallback === 'function') {
      this.removeEventListener(event, selectorOrCallback, callbackOrOptions as boolean | EventListenerOptions)
    } else {
      const cb = callbackOrOptions as (ev: Event) => any
      const handler = (this as any).__obsHandlers?.get(cb)
      if (handler) {
        this.removeEventListener(event, handler, options)
        ;(this as any).__obsHandlers.delete(cb)
      }
    }
  }

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

  ;(HTMLElement.prototype as any).getText = function(): string {
    return this.textContent ?? ''
  }

  ;(HTMLElement.prototype as any).onClickEvent = function(
    cb: (evt: MouseEvent) => any,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.addEventListener('click', cb as EventListener, options)
  }

  ;(HTMLElement.prototype as any).trigger = function(eventType: string): void {
    this.dispatchEvent(new Event(eventType))
  }

  ;(HTMLElement.prototype as any).getCssPropertyValue = function(prop: string): string {
    return getComputedStyle(this).getPropertyValue(prop)
  }

  ;(HTMLElement.prototype as any).find = function(selector: string): Element | null {
    return this.querySelector(selector)
  }

  ;(HTMLElement.prototype as any).findAll = function(selector: string): Element[] {
    return Array.from(this.querySelectorAll(selector))
  }
}
