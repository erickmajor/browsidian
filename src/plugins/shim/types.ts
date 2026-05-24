export interface PluginManifest {
  id: string
  name: string
  version: string
  minAppVersion: string
  description?: string
  author?: string
  authorUrl?: string
  main?: string
}

export abstract class TAbstractFile {
  path: string
  name: string
  parent: TFolder | null = null

  constructor(path: string) {
    this.path = path
    this.name = path.split('/').pop() ?? path
  }
}

export class TFile extends TAbstractFile {
  extension: string
  basename: string
  stat: { ctime: number; mtime: number; size: number }

  constructor(path: string, stat?: { ctime: number; mtime: number; size: number }) {
    super(path)
    this.extension = path.includes('.') ? path.split('.').pop()! : ''
    this.basename = this.name.replace(/\.[^/.]+$/, '')
    this.stat = stat ?? { ctime: 0, mtime: 0, size: 0 }
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = []
  isRoot(): boolean { return this.path === '' || this.path === '/' }
}
