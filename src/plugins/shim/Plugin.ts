import { Component } from './Component'
import type { PluginManifest } from './types'

export interface Command {
  id: string
  name: string
  callback?: () => void | Promise<void>
  checkCallback?: (checking: boolean) => boolean | void
  editorCallback?: (editor: any, view: any) => void | Promise<void>
  hotkeys?: Array<{ modifiers: string[]; key: string }>
  icon?: string
}

export class Plugin extends Component {
  app: any
  manifest: PluginManifest

  constructor(app: any, manifest: PluginManifest) {
    super()
    this.app = app
    this.manifest = manifest
  }

  addCommand(command: Command): Command {
    this.app.commands.register({ ...command, id: `${this.manifest.id}:${command.id}` })
    return command
  }

  addSettingTab(tab: any): void {
    this.app.plugins._registerSettingTab(this.manifest.id, tab)
  }

  addRibbonIcon(_icon: string, _title: string, _cb: (evt: MouseEvent) => void): HTMLElement {
    return document.createElement('div')
  }

  addStatusBarItem(): HTMLElement {
    const el = document.createElement('div')
    el.style.display = 'none'
    return el
  }

  async loadData(): Promise<any> {
    try {
      const { useVaultStore } = await import('@/stores/vault')
      const { adapter } = useVaultStore.getState()
      if (!adapter) return {}
      const content = await adapter.readFile(
        `.obsidian/plugins/${this.manifest.id}/data.json`
      )
      return JSON.parse(content)
    } catch {
      return {}
    }
  }

  async saveData(data: any): Promise<void> {
    const { useVaultStore } = await import('@/stores/vault')
    const { adapter } = useVaultStore.getState()
    if (!adapter) return
    const json = JSON.stringify(data, null, 2)
    const path = `.obsidian/plugins/${this.manifest.id}/data.json`
    try {
      await adapter.writeFile(path, json)
    } catch {
      if (adapter.mkdir) {
        await adapter.mkdir(`.obsidian/plugins/${this.manifest.id}`)
        await adapter.writeFile(path, json)
      }
    }
  }
}
