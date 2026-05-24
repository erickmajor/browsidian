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
