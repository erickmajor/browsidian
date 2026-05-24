import * as obsidianShim from './shim'
import { installDomAugmentations } from './shim/dom'
import { Vault } from './shim/Vault'
import { Workspace } from './shim/Workspace'
import { MetadataCache } from './shim/index'
import { usePluginStore, type LoadedPlugin } from './store'
import { useVaultStore } from '@/stores/vault'
import type { PluginManifest } from './shim/types'

// Install DOM augmentations once when this module loads
installDomAugmentations()

// ─── Singleton app object passed to every plugin ───────────────────────────

const vault     = new Vault()
const workspace = new Workspace()
const metadataCache = new MetadataCache()

const commandRegistry = {
  _cmds: new Map<string, any>(),
  register(cmd: any)    { this._cmds.set(cmd.id, cmd) },
  unregister(id: string) { this._cmds.delete(id) },
  listCommands()         { return Array.from(this._cmds.values()) },
  executeCommandById(id: string) {
    const cmd = this._cmds.get(id)
    if (cmd?.callback) cmd.callback()
    return !!cmd
  },
}

const settingTabs = new Map<string, any>()

export const obsidianApp = {
  vault,
  workspace,
  metadataCache,
  commands: commandRegistry,
  plugins: {
    getPlugin: (id: string) => usePluginStore.getState().loaded.get(id)?.instance ?? null,
    _registerSettingTab: (id: string, tab: any) => settingTabs.set(id, tab),
    _getSettingTab:      (id: string) => settingTabs.get(id),
    _getAllTabs:          () => Array.from(settingTabs.entries()),
  },
  keymap: { pushScope: () => {}, popScope: () => {} },
  scope:  { register: () => {}, unregister: () => {} },
}

// ─── require() factory ────────────────────────────────────────────────────

const NODE_MODULES = ['fs', 'fs/promises', 'path', 'os', 'child_process', 'net', 'http', 'https', 'crypto', 'stream', 'buffer', 'util', 'events', 'readline']

function makeRequire(pluginId: string) {
  return function fakeRequire(mod: string): any {
    if (mod === 'obsidian') return obsidianShim
    if (mod === 'electron') return { remote: null, ipcRenderer: null, shell: null }
    if (NODE_MODULES.includes(mod)) {
      throw new Error(
        `[plugin:${pluginId}] require('${mod}') not available in web mode. ` +
        `This plugin requires Electron.`
      )
    }
    // Some plugins bundle their own deps — attempt to return an empty module
    console.warn(`[plugin:${pluginId}] Unknown require('${mod}') — returning empty module`)
    return {}
  }
}

// ─── Detection ───────────────────────────────────────────────────────────

export function detectRequiresElectron(code: string): boolean {
  return /require\(\s*['"](?:fs|fs\/promises|path|os|electron|child_process|net|readline)['"]\s*\)/.test(code)
}

// ─── Core loader ─────────────────────────────────────────────────────────

export async function loadPlugin(
  pluginDir: string,
  manifest: PluginManifest
): Promise<LoadedPlugin> {
  const id = manifest.id
  const adapter = useVaultStore.getState().adapter
  if (!adapter) throw new Error('No vault adapter')

  const mainFile = `${pluginDir}/${manifest.main ?? 'main.js'}`
  const code = await adapter.readFile(mainFile)

  const requiresElectron = detectRequiresElectron(code)

  const mod = { exports: {} as any }
  const fakeRequire = makeRequire(id)

  try {
    const fn = new Function('module', 'exports', 'require', code)
    fn(mod, mod.exports, fakeRequire)
  } catch (err) {
    throw new Error(`[plugin:${id}] Execution failed: ${(err as Error).message}`)
  }

  const PluginClass = mod.exports?.default ?? mod.exports
  if (typeof PluginClass !== 'function') {
    throw new Error(`[plugin:${id}] No valid plugin class exported`)
  }

  const instance = new PluginClass(obsidianApp, manifest)
  await instance.load()

  return { id, manifest, instance, requiresElectron }
}

// ─── Discovery ───────────────────────────────────────────────────────────

export async function discoverPlugins(): Promise<Array<{ dir: string; manifest: PluginManifest }>> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) return []
  try {
    const entries = await adapter.listFiles('.obsidian/plugins')
    const results: Array<{ dir: string; manifest: PluginManifest }> = []
    for (const entry of entries) {
      if (!entry.isDir) continue
      try {
        const raw = await adapter.readFile(`${entry.path}/manifest.json`)
        results.push({ dir: entry.path, manifest: JSON.parse(raw) as PluginManifest })
      } catch {}
    }
    return results
  } catch {
    return []
  }
}

async function getEnabledIds(): Promise<string[]> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) return []
  try {
    return JSON.parse(await adapter.readFile('.obsidian/community-plugins.json'))
  } catch {
    return []
  }
}

async function saveEnabledIds(ids: string[]): Promise<void> {
  const adapter = useVaultStore.getState().adapter
  if (!adapter) return
  await adapter.writeFile('.obsidian/community-plugins.json', JSON.stringify(ids, null, 2))
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

export async function loadEnabledPlugins(): Promise<void> {
  const enabledIds = await getEnabledIds()
  const discovered = await discoverPlugins()
  const { setLoaded, setEnabled } = usePluginStore.getState()

  for (const { dir, manifest } of discovered) {
    if (!enabledIds.includes(manifest.id)) continue
    try {
      const loaded = await loadPlugin(dir, manifest)
      setLoaded(manifest.id, loaded)
      setEnabled(manifest.id, true)
    } catch (err) {
      setLoaded(manifest.id, {
        id: manifest.id, manifest, instance: null,
        error: (err as Error).message,
      })
    }
  }
}

export async function unloadPlugin(id: string): Promise<void> {
  const { loaded, removeLoaded, setEnabled } = usePluginStore.getState()
  const plugin = loaded.get(id)
  if (plugin?.instance) {
    try { plugin.instance.unload() } catch {}
  }
  // Unregister all commands from this plugin
  commandRegistry._cmds.forEach((_, cmdId) => {
    if (cmdId.startsWith(`${id}:`)) commandRegistry.unregister(cmdId)
  })
  settingTabs.delete(id)
  removeLoaded(id)
  setEnabled(id, false)
}

export async function togglePlugin(id: string, enable: boolean): Promise<void> {
  const enabledIds = await getEnabledIds()
  const next = enable
    ? [...new Set([...enabledIds, id])]
    : enabledIds.filter(e => e !== id)
  await saveEnabledIds(next)

  if (enable) {
    const discovered = await discoverPlugins()
    const found = discovered.find(p => p.manifest.id === id)
    if (!found) throw new Error(`Plugin '${id}' not found in .obsidian/plugins/`)
    const loaded = await loadPlugin(found.dir, found.manifest)
    usePluginStore.getState().setLoaded(id, loaded)
    usePluginStore.getState().setEnabled(id, true)
  } else {
    await unloadPlugin(id)
  }
}
