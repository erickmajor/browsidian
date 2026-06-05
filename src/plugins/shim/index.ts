import { parseFileCache, type CachedMetadata } from './metadata-parser'
export { Component, Events, MarkdownRenderChild } from './Component'
export { Plugin }            from './Plugin'
export type { Command }      from './Plugin'
export { Vault, VaultAdapterShim } from './Vault'
export { Workspace, WorkspaceLeaf, Scope, WorkspaceSplit } from './Workspace'
export { Notice, Modal, SuggestModal, FuzzySuggestModal } from './components'
export {
  Setting, PluginSettingTab,
  TextComponent, TextAreaComponent, ToggleComponent, ButtonComponent, DropdownComponent,
} from './Setting'
export { TFile, TFolder, TAbstractFile } from './types'
export type { PluginManifest } from './types'
export { installDomAugmentations } from './dom'
export { ItemView, FileView, MarkdownView, EditableFileView, TextFileView, EditorSuggest, AbstractInputSuggest } from './views'

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

// Prototype-based moment shim — moment-timezone can extend moment.fn
class MomentDate {
  _d: Date
  _z?: any

  constructor(value?: any) {
    if (value instanceof MomentDate) {
      this._d = new Date(value._d.getTime())
    } else if (value instanceof Date) {
      this._d = new Date(value.getTime())
    } else if (value !== undefined && value !== null) {
      this._d = new Date(value as any)
    } else {
      this._d = new Date()
    }
  }

  format(_fmt?: string): string { return this.isValid() ? this._d.toLocaleDateString() : 'Invalid date' }
  fromNow(): string { return 'recently' }
  diff(other?: any, unit?: string): number {
    const ms = this._d.getTime() - (other instanceof MomentDate ? other._d.getTime() : new Date(other ?? 0).getTime())
    if (!unit || unit.startsWith('ms')) return ms
    if (unit.startsWith('s')) return Math.floor(ms / 1000)
    if (unit.startsWith('mi') || unit === 'm') return Math.floor(ms / 60000)
    if (unit.startsWith('h')) return Math.floor(ms / 3600000)
    if (unit.startsWith('d')) return Math.floor(ms / 86400000)
    if (unit.startsWith('w')) return Math.floor(ms / 604800000)
    if (unit.startsWith('M')) return Math.floor(ms / (30 * 86400000))
    if (unit.startsWith('y')) return Math.floor(ms / (365 * 86400000))
    return ms
  }
  add(n: number, unit?: string): this {
    const u = unit ?? ''
    if (u.startsWith('y'))     this._d.setFullYear(this._d.getFullYear() + n)
    else if (u === 'Q' || u.startsWith('quarter')) this._d.setMonth(this._d.getMonth() + n * 3)
    else if (u.startsWith('M')) this._d.setMonth(this._d.getMonth() + n)
    else if (u.startsWith('w')) this._d.setDate(this._d.getDate() + n * 7)
    else if (u.startsWith('d') || u === 'D') this._d.setDate(this._d.getDate() + n)
    else if (u.startsWith('h')) this._d.setHours(this._d.getHours() + n)
    else if (u.startsWith('mi') || u === 'm') this._d.setMinutes(this._d.getMinutes() + n)
    else if (u.startsWith('s')) this._d.setSeconds(this._d.getSeconds() + n)
    else this._d.setMilliseconds(this._d.getMilliseconds() + n)
    return this
  }
  subtract(n: number, unit?: string): this { return this.add(-n, unit) }
  startOf(unit: string): this {
    const d = this._d
    if (unit.startsWith('y'))  { d.setMonth(0, 1); d.setHours(0, 0, 0, 0) }
    else if (unit === 'Q' || unit.startsWith('quarter')) { d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); d.setHours(0, 0, 0, 0) }
    else if (unit.startsWith('M')) { d.setDate(1); d.setHours(0, 0, 0, 0) }
    else if (unit === 'isoWeek') { const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0, 0, 0, 0) }
    else if (unit.startsWith('w')) { d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0) }
    else if (unit.startsWith('d') || unit === 'D') { d.setHours(0, 0, 0, 0) }
    else if (unit.startsWith('h')) { d.setMinutes(0, 0, 0) }
    else if (unit.startsWith('mi') || unit === 'm') { d.setSeconds(0, 0) }
    else if (unit.startsWith('s')) { d.setMilliseconds(0) }
    return this
  }
  endOf(unit: string): this {
    const d = this._d
    if (unit.startsWith('y'))  { d.setMonth(11, 31); d.setHours(23, 59, 59, 999) }
    else if (unit === 'Q' || unit.startsWith('quarter')) { d.setMonth(Math.floor(d.getMonth() / 3) * 3 + 3, 0); d.setHours(23, 59, 59, 999) }
    else if (unit.startsWith('M')) { d.setMonth(d.getMonth() + 1, 0); d.setHours(23, 59, 59, 999) }
    else if (unit === 'isoWeek') { const day = d.getDay() || 7; d.setDate(d.getDate() - day + 7); d.setHours(23, 59, 59, 999) }
    else if (unit.startsWith('w')) { d.setDate(d.getDate() + (6 - d.getDay())); d.setHours(23, 59, 59, 999) }
    else if (unit.startsWith('d') || unit === 'D') { d.setHours(23, 59, 59, 999) }
    else if (unit.startsWith('h')) { d.setMinutes(59, 59, 999) }
    else if (unit.startsWith('mi') || unit === 'm') { d.setSeconds(59, 999) }
    else if (unit.startsWith('s')) { d.setMilliseconds(999) }
    return this
  }
  isBefore(other?: any, _unit?: string): boolean {
    return this._d.getTime() < (other instanceof MomentDate ? other._d.getTime() : new Date(other ?? 0).getTime())
  }
  isAfter(other?: any, _unit?: string): boolean {
    return this._d.getTime() > (other instanceof MomentDate ? other._d.getTime() : new Date(other ?? 0).getTime())
  }
  isSame(other?: any, _unit?: string): boolean {
    return this._d.getTime() === (other instanceof MomentDate ? other._d.getTime() : new Date(other ?? 0).getTime())
  }
  isBetween(a?: any, b?: any, _unit?: string, _incl?: string): boolean {
    const ta = a instanceof MomentDate ? a._d.getTime() : new Date(a ?? 0).getTime()
    const tb = b instanceof MomentDate ? b._d.getTime() : new Date(b ?? 0).getTime()
    const t = this._d.getTime()
    return t >= Math.min(ta, tb) && t <= Math.max(ta, tb)
  }
  isSameOrBefore(other?: any): boolean { return !this.isAfter(other) }
  isSameOrAfter(other?: any): boolean  { return !this.isBefore(other) }
  valueOf(): number   { return this._d.getTime() }
  toDate(): Date      { return new Date(this._d.getTime()) }
  unix(): number      { return Math.floor(this._d.getTime() / 1000) }
  clone(): MomentDate { return new MomentDate(this._d) }
  isValid(): boolean  { return !isNaN(this._d.getTime()) }
  toString(): string  { return this._d.toISOString() }
  toISOString(): string { return this._d.toISOString() }
  toJSON(): string    { return this.toISOString() }
  local(): this { return this }
  utc(): this   { return this }
  locale(_l?: string): this { return this }
  toObject(): any {
    const d = this._d
    return { years: d.getFullYear(), months: d.getMonth(), date: d.getDate(), hours: d.getHours(), minutes: d.getMinutes(), seconds: d.getSeconds(), milliseconds: d.getMilliseconds() }
  }
  toArray(): number[] {
    const d = this._d
    return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]
  }
  year(v?: number): number | this    { if (v !== undefined) { this._d.setFullYear(v); return this } return this._d.getFullYear() }
  month(v?: number): number | this   { if (v !== undefined) { this._d.setMonth(v); return this } return this._d.getMonth() }
  date(v?: number): number | this    { if (v !== undefined) { this._d.setDate(v); return this } return this._d.getDate() }
  hour(v?: number): number | this    { if (v !== undefined) { this._d.setHours(v); return this } return this._d.getHours() }
  hours(v?: number): number | this   { return this.hour(v) as any }
  minute(v?: number): number | this  { if (v !== undefined) { this._d.setMinutes(v); return this } return this._d.getMinutes() }
  minutes(v?: number): number | this { return this.minute(v) as any }
  second(v?: number): number | this  { if (v !== undefined) { this._d.setSeconds(v); return this } return this._d.getSeconds() }
  seconds(v?: number): number | this { return this.second(v) as any }
  millisecond(v?: number): number | this  { if (v !== undefined) { this._d.setMilliseconds(v); return this } return this._d.getMilliseconds() }
  milliseconds(v?: number): number | this { return this.millisecond(v) as any }
  day(v?: number): number | this {
    if (v !== undefined) { this._d.setDate(this._d.getDate() - this._d.getDay() + v); return this }
    return this._d.getDay()
  }
  weekday(v?: number): number | this { return this.day(v) as any }
  isoWeekday(v?: number): number | this {
    const cur = this._d.getDay() || 7
    if (v !== undefined) { this._d.setDate(this._d.getDate() - cur + v); return this }
    return cur
  }
  week(): number { return Math.ceil((this._d.getTime() - new Date(this._d.getFullYear(), 0, 1).getTime()) / (7 * 86400000)) + 1 }
  isoWeek(): number { return this.week() }
  quarter(): number { return Math.ceil((this._d.getMonth() + 1) / 3) }
  get(unit: string): number {
    const u = unit.toLowerCase()
    if (u.startsWith('y')) return this._d.getFullYear()
    if (u === 'month') return this._d.getMonth()
    if (u === 'date' || u === 'day') return this._d.getDate()
    if (u.startsWith('h')) return this._d.getHours()
    if (u.startsWith('mi') || u === 'm') return this._d.getMinutes()
    if (u.startsWith('s')) return this._d.getSeconds()
    return this._d.getMilliseconds()
  }
  set(unitOrObj: string | Record<string, number>, val?: number): this {
    if (typeof unitOrObj === 'object') {
      Object.entries(unitOrObj).forEach(([k, v]) => this.set(k, v))
    } else if (val !== undefined) {
      const u = unitOrObj.toLowerCase()
      if (u.startsWith('y')) this._d.setFullYear(val)
      else if (u === 'month') this._d.setMonth(val)
      else if (u === 'date') this._d.setDate(val)
      else if (u.startsWith('h')) this._d.setHours(val)
      else if (u.startsWith('mi') || u === 'm') this._d.setMinutes(val)
      else if (u.startsWith('s')) this._d.setSeconds(val)
      else this._d.setMilliseconds(val)
    }
    return this
  }
}

function momentFn(value?: any, _format?: any, _strict?: boolean): MomentDate {
  return new MomentDate(value)
}

Object.assign(momentFn, {
  fn:      MomentDate.prototype,
  utc:     (v?: any) => new MomentDate(v),
  unix:    (ts: number) => new MomentDate(ts * 1000),
  now:     () => Date.now(),
  duration: (n?: any, _unit?: string) => ({
    as: (_u?: string) => (typeof n === 'number' ? n : 0),
    valueOf: () => (typeof n === 'number' ? n : 0),
    humanize: () => '',
    toISOString: () => 'PT0S',
    get: () => 0, milliseconds: () => 0, seconds: () => 0, minutes: () => 0,
    hours: () => 0, days: () => 0, months: () => 0, years: () => 0,
  }),
  locale:      (_l?: string) => _l !== undefined ? momentFn : 'en',
  localeData:  (_locale?: any) => ({
    _config: {}, _abbr: 'en',
    firstDayOfWeek: () => 0,
    months:        () => ['January','February','March','April','May','June','July','August','September','October','November','December'],
    monthsShort:   () => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    weekdays:      () => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    weekdaysShort: () => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
    weekdaysMin:   () => ['Su','Mo','Tu','We','Th','Fr','Sa'],
    longDateFormat: () => '', relativeTime: () => '', meridiem: () => '',
  }),
  isMoment:         (obj: any) => obj instanceof MomentDate,
  version:          '2.30.1',
  defaultFormat:    'YYYY-MM-DDTHH:mm:ssZ',
  HTML5_FMT:        {},
  normalizeUnits:   (u: string) => u,
  relativeTimeThreshold: () => true,
  updateLocale:     () => null,
  defineLocale:     () => null,
  isDate:           (d: any) => d instanceof Date,
  min: (...args: any[]) => args.reduce((a: MomentDate, b: MomentDate) => a.valueOf() < b.valueOf() ? a : b),
  max: (...args: any[]) => args.reduce((a: MomentDate, b: MomentDate) => a.valueOf() > b.valueOf() ? a : b),
})

export const moment: any = momentFn

export function requireApiVersion(_version: string): boolean { return true }

export async function loadMermaid(): Promise<any> { return null }

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
  private _handlers = new Map<string, Set<(...args: any[]) => any>>()
  private _cache    = new Map<string, CachedMetadata>()
  private _resolvedCallbacks: Array<() => void> = []
  private _resolvedFired = false

  // Non-empty so plugins that check Object.keys(resolvedLinks).length > 0 treat cache as ready
  resolvedLinks: Record<string, Record<string, number>> = {}
  unresolvedLinks: Record<string, Record<string, number>> = {}

  getFileCache(file: any): CachedMetadata | null {
    return this._cache.get(file?.path ?? '') ?? null
  }

  getFirstLinkpathDest(_path: string, _from: string): any { return null }

  getCache(path: string): CachedMetadata | null {
    return this._cache.get(path) ?? null
  }

  fileToLinktext(_file: any, _sourcePath: string, _omitMdExtension?: boolean): string { return '' }

  on(event: string, cb: (...args: any[]) => any): { unsubscribe: () => void } {
    if (event === 'resolved') {
      if (this._resolvedFired) {
        let cancelled = false
        Promise.resolve().then(() => { if (!cancelled) { try { cb() } catch {} } })
        return { unsubscribe: () => { cancelled = true } }
      }
      this._resolvedCallbacks.push(cb)
      return { unsubscribe: () => {
        this._resolvedCallbacks = this._resolvedCallbacks.filter(f => f !== cb)
      }}
    }
    if (!this._handlers.has(event)) this._handlers.set(event, new Set())
    this._handlers.get(event)!.add(cb)
    return { unsubscribe: () => this._handlers.get(event)?.delete(cb) }
  }

  off(event: string, cb: (...args: any[]) => any): void {
    this._handlers.get(event)?.delete(cb)
    if (event === 'resolved') {
      this._resolvedCallbacks = this._resolvedCallbacks.filter(f => f !== cb)
    }
  }

  trigger(event: string, ...args: any[]): void {
    this._handlers.get(event)?.forEach(cb => { try { cb(...args) } catch {} })
  }

  _fireResolved(): void {
    if (this._resolvedFired) return
    this._resolvedFired = true
    this._resolvedCallbacks.forEach(cb => { try { cb() } catch {} })
    this._resolvedCallbacks = []
  }

  async populate(files: any[], read: (path: string) => Promise<string>): Promise<void> {
    const BATCH = 20
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH)
      await Promise.all(batch.map(async (file: any) => {
        try {
          const content = await read(file.path)
          const data = parseFileCache(content, file.path)
          this._cache.set(file.path, data)
          this.trigger('changed', file, data)
        } catch {
          // skip unreadable files silently
        }
      }))
    }
    this._fireResolved()
  }

  updateFile(file: { path: string }, content: string): void {
    const data = parseFileCache(content, file.path)
    this._cache.set(file.path, data)
    this.trigger('changed', file, data)
  }

  deleteFile(file: { path: string }): void {
    this._cache.delete(file.path)
    this.trigger('delete', file)
  }

  reset(): void {
    this._cache.clear()
    this._resolvedFired = false
  }
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
