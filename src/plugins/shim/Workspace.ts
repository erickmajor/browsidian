import { useVaultStore } from '@/stores/vault'
import { TFile } from './types'

export class WorkspaceLeaf {
  view: any = null
  open(_view: any): Promise<void> { return Promise.resolve() }
  setViewState(_state: any): Promise<void> { return Promise.resolve() }
  getViewState(): any { return { type: 'markdown', state: {} } }
  getDisplayText(): string { return '' }
  getRoot(): this { return this }
}

type WorkspaceListener = (...args: any[]) => void

export class Workspace {
  activeLeaf: WorkspaceLeaf | null = new WorkspaceLeaf()
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
    return { unsubscribe: () => this._listeners.get(event)?.delete(callback) }
  }

  off(event: string, callback: WorkspaceListener): void {
    this._listeners.get(event)?.delete(callback)
  }

  _emit(event: string, ...args: any[]): void {
    this._listeners.get(event)?.forEach(cb => {
      try { cb(...args) } catch (err) {
        console.warn(`[workspace:${event}] listener error:`, err)
      }
    })
  }

  // Called by many plugins after their setup — invoke immediately since there's no loading phase
  onLayoutReady(cb: () => void): void { cb() }

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
  trigger(_event: string, ..._args: any[]): void {}
}
