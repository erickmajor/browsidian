export { Component, Events } from './Component'
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
export { ItemView, FileView, MarkdownView, AbstractInputSuggest } from './views'

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
    locale: (_l?: string) => _l !== undefined ? moment : 'en',
    isMoment: (obj: any) => !!(obj && typeof obj.format === 'function' && typeof obj.isValid === 'function'),
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
  on(_event: string, _cb: (...args: any[]) => any): { unsubscribe: () => void } { return { unsubscribe: () => {} } }
  off(_event: string, _cb: (...args: any[]) => any): void {}
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

// ─── Icon registry ────────────────────────────────────────────────────────────

const _iconRegistry = new Map<string, string>()

export function addIcon(iconId: string, svgContent: string): void {
  _iconRegistry.set(iconId, svgContent)
}

export function getIcon(iconId: string): SVGSVGElement | null {
  const svg = _iconRegistry.get(iconId)
  if (!svg) return null
  const wrap = document.createElement('div')
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${svg}</svg>`
  return wrap.firstChild as SVGSVGElement
}

// ─── requestUrl ───────────────────────────────────────────────────────────────

export interface RequestUrlParam {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | ArrayBuffer
  contentType?: string
  throw?: boolean
}

export interface RequestUrlResponse {
  status: number
  headers: Record<string, string>
  arrayBuffer: ArrayBuffer
  text: string
  json: any
}

export async function requestUrl(options: string | RequestUrlParam): Promise<RequestUrlResponse> {
  const url        = typeof options === 'string' ? options : options.url
  const method     = typeof options === 'string' ? 'GET'   : (options.method ?? 'GET')
  const headers    = typeof options === 'string' ? {}      : (options.headers ?? {})
  const body       = typeof options === 'string' ? undefined : options.body
  const throwErr   = typeof options === 'string' ? true    : (options.throw !== false)

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined
      ? (typeof body === 'string' ? body : body)
      : undefined,
  })

  if (throwErr && !res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  const text = new TextDecoder().decode(arrayBuffer)
  let json: any = null
  try { json = JSON.parse(text) } catch {}

  return {
    status:      res.status,
    headers:     Object.fromEntries(res.headers.entries()),
    arrayBuffer,
    text,
    json,
  }
}
