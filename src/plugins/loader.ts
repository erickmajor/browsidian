import * as obsidianShim from './shim'
import * as _cmState    from '@codemirror/state'
import * as _cmView     from '@codemirror/view'
import * as _cmCommands from '@codemirror/commands'
import * as _cmLanguage from '@codemirror/language'
import { installDomAugmentations } from './shim/dom'
import { Vault } from './shim/Vault'
import { Workspace } from './shim/Workspace'
import { MetadataCache } from './shim/index'
import { usePluginStore, type LoadedPlugin } from './store'
import { useVaultStore } from '@/stores/vault'
import type { PluginManifest } from './shim/types'

// Install DOM augmentations once when this module loads
installDomAugmentations()

// Polyfill Node.js globals that plugins reference from async callbacks too
// (preamble in new Function only covers synchronous code during fn() execution)
;(globalThis as any).global   ??= globalThis
;(globalThis as any).process  ??= { env: {}, versions: {}, platform: 'browser' }
;(globalThis as any).Buffer   ??= { from: () => new Uint8Array(), isBuffer: () => false }

// Expose moment on window — plugins may call window.moment() or global.moment()
;(globalThis as any).moment = obsidianShim.moment
// app is a global in real Obsidian — set after obsidianApp is defined below


// ─── Singleton app object passed to every plugin ───────────────────────────

const vault     = new Vault()
const workspace = new Workspace()
const metadataCache = new MetadataCache()

const commandRegistry = {
  _cmds: new Map<string, any>(),
  register(cmd: any)       { this._cmds.set(cmd.id, cmd) },
  unregister(id: string)   { this._cmds.delete(id) },
  removeCommand(id: string){ this._cmds.delete(id) },
  listCommands()           { return Array.from(this._cmds.values()) },
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
    getPlugin:     (id: string) => usePluginStore.getState().loaded.get(id)?.instance ?? null,
    getPluginById: (id: string) => usePluginStore.getState().loaded.get(id)?.instance ?? null,
    enabledPlugins: new Set<string>(),
    _registerSettingTab: (id: string, tab: any) => settingTabs.set(id, tab),
    _getSettingTab:      (id: string) => settingTabs.get(id),
    _getAllTabs:          () => Array.from(settingTabs.entries()),
  },
  keymap: { pushScope: () => {}, popScope: () => {} },
  scope:  { register: () => {}, unregister: () => {} },
  loadLocalStorage:  (_key: string) => null,
  saveLocalStorage:  (_key: string, _val: any) => {},
  viewRegistry: {
    typeByExtension: new Map<string, string>([['md', 'markdown'], ['canvas', 'canvas']]),
    getTypeByExtension(ext: string): string { return this.typeByExtension.get(ext) ?? '' },
    isExtensionRegistered(ext: string): boolean { return this.typeByExtension.has(ext) },
    registerExtensions(extensions: string[], viewType: string): void {
      extensions.forEach(ext => this.typeByExtension.set(ext, viewType))
    },
    unregisterExtensions(extensions: string[]): void {
      extensions.forEach(ext => this.typeByExtension.delete(ext))
    },
  },
}

// Obsidian exposes the app instance as a global — many plugins reference it directly
;(globalThis as any).app = obsidianApp

// ─── Node.js module shims ─────────────────────────────────────────────────

const pathShim = (() => {
  const s = {
    join:      (...p: string[]) => p.filter(Boolean).join('/').replace(/[/\\]+/g, '/').replace(/\/$/, '') || '.',
    resolve:   (...p: string[]) => p.filter(Boolean).join('/').replace(/[/\\]+/g, '/'),
    dirname:   (p: string) => { const n = p.replace(/\\/g, '/'); const i = n.lastIndexOf('/'); return i >= 0 ? n.slice(0, i) || '/' : '.' },
    basename:  (p: string, ext?: string) => { const b = p.replace(/\\/g, '/').split('/').pop() ?? ''; return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b },
    extname:   (p: string) => { const b = p.replace(/\\/g, '/').split('/').pop() ?? ''; const d = b.lastIndexOf('.'); return d > 0 ? b.slice(d) : '' },
    normalize: (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/',
    relative:  (_f: string, t: string) => t,
    isAbsolute:(p: string) => /^([A-Za-z]:[/\\]|\/)/.test(p),
    sep: '/', delimiter: ':',
    posix: null as any, win32: null as any,
  }
  s.posix = s; s.win32 = s
  return s
})()

class _EventEmitter {
  _h: Map<string, Function[]> = new Map()
  on(e: string, cb: Function) { if (!this._h.has(e)) this._h.set(e, []); this._h.get(e)!.push(cb); return this }
  addListener(e: string, cb: Function) { return this.on(e, cb) }
  off(e: string, cb: Function) { this._h.set(e, (this._h.get(e) ?? []).filter(f => f !== cb)); return this }
  removeListener(e: string, cb: Function) { return this.off(e, cb) }
  emit(e: string, ...args: any[]) { (this._h.get(e) ?? []).forEach(cb => { try { cb(...args) } catch {} }); return true }
  once(e: string, cb: Function) { const w = (...args: any[]) => { this.off(e, w); cb(...args) }; return this.on(e, w) }
  removeAllListeners(e?: string) { e ? this._h.delete(e) : this._h.clear(); return this }
  listeners(e: string) { return this._h.get(e) ?? [] }
  listenerCount(e: string) { return (this._h.get(e) ?? []).length }
  setMaxListeners() { return this }
  pipe(dest: any) { return dest }
}
const eventsShim = Object.assign(_EventEmitter, { EventEmitter: _EventEmitter })

const osShim = {
  platform: () => 'win32',
  homedir:  () => (window as any).electronAPI?.vaultPath?.split(/[/\\]/)[0] + '\\Users\\user' ?? '/',
  tmpdir:   () => '/tmp',
  EOL: '\n', arch: () => 'x64', hostname: () => 'localhost',
  userInfo: () => ({ username: 'user', homedir: '/', shell: '' }),
  type: () => 'Windows_NT', release: () => '10.0',
}

function makeElectronFsShim() {
  const api = (window as any).electronAPI
  const cb = (opts: any, fallback?: any) => typeof opts === 'function' ? opts : fallback
  const enoent = (p: string) => { const e: any = new Error(`ENOENT: no such file, open '${p}'`); e.code = 'ENOENT'; return e }

  return {
    readFile: (p: string, opts: any, cbk?: any) => {
      const done = cb(opts, cbk)
      api.readFile(p).then((c: string | null) =>
        c === null ? done?.(enoent(p)) : done?.(null, c)
      ).catch((e: Error) => done?.(e))
    },
    writeFile: (p: string, data: any, opts: any, cbk?: any) => {
      const done = cb(opts, cbk)
      api.writeFile(p, String(data)).then(() => done?.(null)).catch((e: Error) => done?.(e))
    },
    mkdir: (p: string, opts: any, cbk?: any) => {
      const done = cb(opts, cbk)
      api.mkdir?.(p).then(() => done?.(null)).catch(() => done?.(null))
    },
    mkdirSync: (_p: string, _opts?: any) => {},
    existsSync: (_p: string) => false,
    readFileSync: (_p: string, _opts?: any) => { throw new Error('fs.readFileSync not available in renderer') },
    writeFileSync: () => { throw new Error('fs.writeFileSync not available in renderer') },
    unlink: (p: string, cbk: any) => api.deleteFile(p).then(() => cbk?.(null)).catch(cbk),
    rename: (f: string, t: string, cbk: any) => api.renameFile(f, t).then(() => cbk?.(null)).catch(cbk),
    stat: (p: string, cbk: any) => {
      api.readFile(p).then((c: string | null) =>
        c === null ? cbk(enoent(p)) : cbk(null, { isFile: () => true, isDirectory: () => false, size: c.length, mtime: new Date(), ctime: new Date() })
      ).catch(cbk)
    },
    lstat(p: string, cbk: any) { return this.stat(p, cbk) },
    access: (p: string, _mode: any, cbk?: any) => {
      const done = cb(_mode, cbk)
      api.readFile(p).then((c: string | null) => c === null ? done?.(enoent(p)) : done?.(null)).catch(done)
    },
    createReadStream: (_p: string) => new _EventEmitter(),
    createWriteStream: (_p: string) => new _EventEmitter(),
    promises: {
      readFile: async (p: string) => { const c = await api.readFile(p); if (c === null) throw enoent(p); return c },
      writeFile: (p: string, data: string) => api.writeFile(p, data),
      mkdir: (p: string, _opts?: any) => api.mkdir?.(p).catch(() => {}),
      unlink: (p: string) => api.deleteFile(p),
      rename: (f: string, t: string) => api.renameFile(f, t),
      stat: async (p: string) => { const c = await api.readFile(p); if (c === null) throw enoent(p); return { isFile: () => true, isDirectory: () => false, size: c.length, mtime: new Date() } },
      access: async (p: string) => { const c = await api.readFile(p); if (c === null) throw enoent(p) },
      readdir: async (_p: string) => [] as string[],
    }
  }
}

const childProcessStub = {
  exec: (_cmd: string, _opts: any, cbk?: any) => {
    const done = typeof _opts === 'function' ? _opts : cbk
    const err: any = new Error('child_process.exec: process spawning not available in renderer')
    err.code = 127
    setTimeout(() => done?.(err, '', ''), 0)
    return { kill() {}, on() { return this }, stdout: new _EventEmitter(), stderr: new _EventEmitter() }
  },
  execSync: (_cmd: string) => { throw new Error('child_process.execSync not available in renderer') },
  spawn: (_cmd: string, _args?: string[], _opts?: any) => {
    const p = { stdout: new _EventEmitter(), stderr: new _EventEmitter(), stdin: new _EventEmitter(), on(_e: string, _cb: any) { return this }, kill() {}, pid: 0 }
    return p
  },
  spawnSync: (_cmd: string, _args?: string[]) => ({ status: 127, stdout: '', stderr: 'not available', output: [], error: new Error('not available') }),
  execFile: (_cmd: string, _args: any, _opts: any, cbk?: any) => {
    const done = typeof _opts === 'function' ? _opts : cbk
    setTimeout(() => done?.(new Error('execFile not available'), '', ''), 0)
    return { kill() {}, on() { return this } }
  },
  fork: (_module: string) => ({ on() { return this }, send() {}, kill() {}, pid: 0 }),
}

// ─── ES5 class-call compatibility ────────────────────────────────────────
// TypeScript ES5 plugins inherit via `_super.apply(this, args)`.
// Native ES6 classes cannot be invoked without `new`, so we wrap every
// class export with a Proxy whose apply trap calls Reflect.construct,
// preserving the derived class's prototype chain.

function makeCallable<T extends new (...args: any[]) => any>(Cls: T): T {
  return new Proxy(Cls, {
    apply(target: any, thisArg: any, args: any[]) {
      const derivedCtor = (thisArg as any)?.constructor ?? target
      return Reflect.construct(target, args, derivedCtor)
    }
  }) as T
}

const obsidianShimCallable = (() => {
  const out: any = {}
  for (const [k, v] of Object.entries(obsidianShim as any)) {
    out[k] = (typeof v === 'function' && /^[A-Z]/.test(k)) ? makeCallable(v as any) : v
  }
  return out
})()

// ─── require() factory ────────────────────────────────────────────────────

const NODE_MODULES = ['net', 'http', 'https', 'crypto', 'stream', 'buffer', 'readline']

function makeRequire(pluginId: string) {
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

  return function fakeRequire(mod: string): any {
    if (mod === 'obsidian') return obsidianShimCallable
    if (mod === '@codemirror/state')    return _cmState
    if (mod === '@codemirror/view')     return _cmView
    if (mod === '@codemirror/commands') return _cmCommands
    if (mod === '@codemirror/language') return _cmLanguage
    if (mod === 'electron') return { remote: null, ipcRenderer: null, shell: { openExternal: () => {}, openPath: () => {} } }
    if (mod === 'path')           return pathShim
    if (mod === 'os')             return osShim
    if (mod === 'events')         return eventsShim
    if (mod === 'fs' || mod === 'fs/promises') {
      if (isElectron) return makeElectronFsShim()
      throw new Error(`[plugin:${pluginId}] require('${mod}') not available in web mode. This plugin requires Electron.`)
    }
    if (mod === 'child_process') {
      if (isElectron) return childProcessStub
      throw new Error(`[plugin:${pluginId}] require('child_process') not available in web mode. This plugin requires Electron.`)
    }
    if (NODE_MODULES.includes(mod)) {
      if (isElectron) {
        console.warn(`[plugin:${pluginId}] require('${mod}') returning stub in Electron mode`)
        return {}
      }
      throw new Error(`[plugin:${pluginId}] require('${mod}') not available in web mode. This plugin requires Electron.`)
    }
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
    const preamble = 'var global=globalThis;var process={env:{},versions:{},platform:"browser"};'
    const fn = new Function('module', 'exports', 'require', preamble + code)
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
  // Unregister all commands from this plugin (collect first to avoid mutating Map during iteration)
  const toRemove = Array.from(commandRegistry._cmds.keys()).filter(k => k.startsWith(`${id}:`))
  for (const k of toRemove) commandRegistry.unregister(k)
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
