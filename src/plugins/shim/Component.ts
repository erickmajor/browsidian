export class Events {
  private _evtHandlers: Map<string, Set<(...args: any[]) => any>> = new Map()

  on(event: string, cb: (...args: any[]) => any): { unsubscribe: () => void } {
    if (!this._evtHandlers.has(event)) this._evtHandlers.set(event, new Set())
    this._evtHandlers.get(event)!.add(cb)
    return { unsubscribe: () => this.off(event, cb) }
  }
  once(event: string, cb: (...args: any[]) => any): { unsubscribe: () => void } {
    const wrapper = (...args: any[]) => { this.off(event, wrapper); cb(...args) }
    return this.on(event, wrapper)
  }
  off(event: string, cb: (...args: any[]) => any): void { this._evtHandlers.get(event)?.delete(cb) }
  offref(_ref: any): void {}
  trigger(event: string, ...args: any[]): void { this._evtHandlers.get(event)?.forEach(cb => { try { cb(...args) } catch {} }) }

  addEventListener(event: string, cb: (...args: any[]) => any): this {
    if (!this._evtHandlers.has(event)) this._evtHandlers.set(event, new Set())
    this._evtHandlers.get(event)!.add(cb)
    return this
  }
  removeEventListener(event: string, cb: (...args: any[]) => any): void { this.off(event, cb) }
}

export class Component extends Events {
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

  register(cb: () => void): void {
    this._cleanups.push(cb)
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

export class MarkdownRenderChild extends Component {
  containerEl: HTMLElement
  constructor(containerEl: HTMLElement) {
    super()
    this.containerEl = containerEl
  }
}
