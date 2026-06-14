import { useVaultStore } from '@/stores/vault'
import { TFile } from './types'

export class Scope {
  register(_modifiers: string[] | null, _key: string | null, _func: (evt: KeyboardEvent) => boolean): any { return {} }
  unregister(_handler: any): void {}
}

export class WorkspaceSplit {
  children: any[] = []
  type = ''
}

export class WorkspaceLeaf {
  view: any = null
  containerEl: HTMLElement = document.createElement('div')
  open(_view: any): Promise<void> { return Promise.resolve() }
  setViewState(_state: any): Promise<void> { return Promise.resolve() }
  getViewState(): any { return { type: 'markdown', state: {} } }
  getDisplayText(): string { return '' }
  getRoot(): this { return this }
}

type WorkspaceListener = (...args: any[]) => void

export class Workspace {
  activeLeaf: WorkspaceLeaf | null = new WorkspaceLeaf()
  containerEl: HTMLElement = document.createElement('div')
  leftSplit  = new WorkspaceSplit()
  rightSplit = new WorkspaceSplit()
  rootSplit  = new WorkspaceSplit()
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
    console.debug(`[workspace] registered listener for '${event}' (total: ${this._listeners.get(event)!.size})`)
    return { unsubscribe: () => this._listeners.get(event)?.delete(callback) }
  }

  off(event: string, callback: WorkspaceListener): void {
    this._listeners.get(event)?.delete(callback)
  }

  _emit(event: string, ...args: any[]): void {
    const listeners = this._listeners.get(event)
    console.debug(`[workspace] _emit '${event}' → ${listeners?.size ?? 0} listener(s)`)
    listeners?.forEach(cb => {
      try { cb(...args) } catch (err) {
        console.warn(`[workspace:${event}] listener error:`, err)
      }
    })
  }

  // Defer to next macrotask so React has committed pending renders before plugins query the DOM
  onLayoutReady(cb: () => void): void {
    console.debug('[workspace] onLayoutReady — scheduling callback')
    setTimeout(cb, 0)
  }

  getRightLeaf(_create: boolean): WorkspaceLeaf { return new WorkspaceLeaf() }
  getLeftLeaf(_create: boolean): WorkspaceLeaf  { return new WorkspaceLeaf() }
  createLeafBySplit(_leaf: WorkspaceLeaf, _direction?: string, _before?: boolean): WorkspaceLeaf { return new WorkspaceLeaf() }
  detachLeavesOfType(_type: string): void {}

  openLinkText(_text: string, _source: string, _newLeaf?: boolean): Promise<void> {
    return Promise.resolve()
  }

  getLastOpenFiles(): string[] { return [] }
  iterateAllLeaves(_cb: (leaf: WorkspaceLeaf) => void): void {}
  revealLeaf(_leaf: WorkspaceLeaf): void {}
  requestSaveActiveFile(): void {}
  trigger(event: string, ...args: any[]): void { this._emit(event, ...args) }
  updateOptions(): void {}
  registerHoverLinkSource(_id: string, _info: any): void {}
  unregisterHoverLinkSource(_id: string): void {}
  getLayout(): any { return {} }
  changeLayout(_layout: any): void {}
  registerEditorMenuItems?: any
}
