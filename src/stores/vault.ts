import { create } from 'zustand'
import type { VaultAdapter, FileEntry } from '@/adapters'
import { ServerAdapter } from '@/adapters/server'
import { DemoAdapter } from '@/adapters/demo'
import { DropboxAdapter } from '@/adapters/dropbox'
import type { DropboxAuth } from '@/adapters/dropbox'
import { createWatcher } from '@/watchers'
import type { VaultWatcher } from '@/watchers'
import { useUIStore } from '@/stores/ui'
import { loadUserIgnorePatterns, isIgnoredByUser } from '@/lib/obsidianConfig'

export type VaultMode = 'server' | 'browser' | 'demo' | 'dropbox' | 'electron'

export interface VaultFile extends FileEntry {
  children?: VaultFile[]
}

const AUTOSAVE_MS = 1200
const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

// ─── IndexedDB store for browser-mode FileSystemDirectoryHandle ───────────────

const idbStore = (() => {
  const DB = 'browsidian', STORE = 'vault', KEY = 'rootHandle'
  function open(): Promise<IDBDatabase> {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => res(req.result)
      req.onerror  = () => rej(req.error)
    })
  }
  async function get(): Promise<FileSystemDirectoryHandle | null> {
    const db = await open()
    try {
      return await new Promise((res, rej) => {
        const tx  = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(KEY)
        req.onsuccess = () => res(req.result ?? null)
        req.onerror   = () => rej(req.error)
      })
    } finally { db.close() }
  }
  async function set(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await open()
    try {
      await new Promise<void>((res, rej) => {
        const tx  = db.transaction(STORE, 'readwrite')
        const req = tx.objectStore(STORE).put(handle, KEY)
        req.onsuccess = () => res()
        req.onerror   = () => rej(req.error)
      })
    } finally { db.close() }
  }
  async function clear(): Promise<void> {
    const db = await open()
    try {
      await new Promise<void>((res, rej) => {
        const tx  = db.transaction(STORE, 'readwrite')
        const req = tx.objectStore(STORE).delete(KEY)
        req.onsuccess = () => res()
        req.onerror   = () => rej(req.error)
      })
    } finally { db.close() }
  }
  return { get, set, clear }
})()

// ─── File index for wikilink resolution ────────────────────────────────────────

async function buildFileIndex(
  adapter: VaultAdapter,
  rootPath: string,
  ignoredPatterns: string[]
): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>()
  const normRoot = rootPath.replace(/[/\\]+$/, '')
  const walk = async (dir: string) => {
    const entries = await adapter.listFiles(dir)
    for (const e of entries) {
      if (e.isDir) { await walk(e.path); continue }
      if (!e.name.toLowerCase().endsWith('.md')) continue
      const rel = e.path.replace(normRoot, '').replace(/^[/\\]+/, '').replace(/\\/g, '/')
      if (isIgnoredByUser(rel, ignoredPatterns)) continue
      const key = e.name.toLowerCase().replace(/\.md$/, '')
      const existing = index.get(key)
      if (existing) existing.push(e.path)
      else index.set(key, [e.path])
    }
  }
  await walk(rootPath)
  return index
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface VaultStore {
  mode:       VaultMode
  adapter:    VaultAdapter | null
  vaultPath:  string | null
  tree:       VaultFile[]
  activeFile: VaultFile | null
  content:    string
  isDirty:    boolean
  isLoading:  boolean
  showPreview: boolean
  selectedDir: string | null
  fileIndex:        Map<string, string[]> | null
  ignoredPatterns:  string[]
  _autosaveTimer: ReturnType<typeof setTimeout> | null
  _watcher: VaultWatcher | null

  // Vault init
  initServerMode(): Promise<void>
  initBrowserMode(): Promise<void>
  restoreBrowserMode(): Promise<boolean>
  initDemoMode(): Promise<void>
  initDropboxMode(auth: DropboxAuth): Promise<void>
  initElectronMode(): Promise<void>
  restoreElectronMode(): Promise<boolean>
  restoreLastFile(): Promise<void>
  disconnect(): Promise<void>

  // File ops
  refreshTree(): Promise<void>
  openFile(file: VaultFile): Promise<void>
  saveFile(): Promise<void>
  setContent(content: string): void
  newFile(name: string, parentPath?: string): Promise<void>
  newFolder(name: string, parentPath?: string): Promise<void>
  deleteFile(file: VaultFile): Promise<void>
  moveFile(fromPath: string, toPath: string): Promise<void>

  // UI helpers
  setShowPreview(v: boolean): void
  setSelectedDir(dir: string | null): void
  resolveWikilink(target: string): Promise<string | null>
  invalidateIndex(): void
  _scheduleAutosave(): void
  _cancelAutosave(): void
}

export const useVaultStore = create<VaultStore>((set, get) => ({
  mode:        'server',
  adapter:     null,
  vaultPath:   null,
  tree:        [],
  activeFile:  null,
  content:     '',
  isDirty:     false,
  isLoading:   false,
  showPreview: true,
  selectedDir: null,
  fileIndex:        null,
  ignoredPatterns:  [],
  _autosaveTimer: null,
  _watcher: null,

  // ─── Init modes ─────────────────────────────────────────────────────────────

  async initServerMode() {
    set({ isLoading: true, mode: 'server' })
    const res = await fetch('/api/config').catch(() => null)
    const cfg = res ? await res.json().catch(() => null) : null
    if (!cfg?.vault) {
      set({ adapter: null, vaultPath: null, isLoading: false })
      return
    }
    const adapter = new ServerAdapter(cfg.vault)
    const ignoredPatterns = await loadUserIgnorePatterns(adapter, cfg.vault)
    set({ adapter, vaultPath: cfg.vault, isLoading: false, ignoredPatterns })
    await get().refreshTree()
    _attachWatcher('server', adapter, cfg.vault, get, set)
    void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
  },

  async initBrowserMode() {
    if (!('showDirectoryPicker' in window)) {
      throw new Error('Browser does not support folder selection (use Chrome/Edge/Brave)')
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await idbStore.set(handle).catch(() => {})

    // Use WebAdapter from adapters/index
    const { createVaultAdapter } = await import('@/adapters')
    const adapter = createVaultAdapter()
    // selectVault on WebAdapter triggers picker — instead we use the handle directly
    // We need to call selectVault to initialize the root handle inside WebAdapter
    // Since we already have the handle, we set it via a workaround: use the adapter's
    // internal selectVault flow by re-triggering (user already selected)
    // Actually: WebAdapter.selectVault() calls showDirectoryPicker again. Let's just
    // use selectVault and capture the name, then set it manually.
    // Better: call the method which re-opens the picker. We have the handle from above.
    // The cleanest solution is to call adapter.selectVault() and ignore the re-pick,
    // but that opens the dialog twice. Instead, set the vaultPath from the handle name.
    const vaultPath = handle.name
    // Re-initialize adapter with a proper selectVault that uses the cached handle
    const browserAdapter = createVaultAdapter() as unknown as {
      root: FileSystemDirectoryHandle | null
      rootName: string
    } & VaultAdapter
    browserAdapter.root = handle
    browserAdapter.rootName = handle.name

    const ignoredPatterns = await loadUserIgnorePatterns(browserAdapter as unknown as VaultAdapter, vaultPath)
    set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath, mode: 'browser', ignoredPatterns })
    await get().refreshTree()
    _attachWatcher('browser', browserAdapter as unknown as VaultAdapter, vaultPath, get, set)
    void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
  },

  async restoreBrowserMode(): Promise<boolean> {
    if (!('showDirectoryPicker' in window)) return false
    const handle = await idbStore.get().catch(() => null)
    if (!handle) return false

    const opts = { mode: 'readwrite' as FileSystemPermissionMode }
    let perm: PermissionState = 'prompt'
    if ('queryPermission' in handle) perm = await (handle as FileSystemDirectoryHandle).queryPermission(opts)
    if (perm !== 'granted' && 'requestPermission' in handle) {
      perm = await (handle as FileSystemDirectoryHandle).requestPermission(opts)
    }
    if (perm !== 'granted') return false

    const { createVaultAdapter } = await import('@/adapters')
    const browserAdapter = createVaultAdapter() as unknown as {
      root: FileSystemDirectoryHandle | null
      rootName: string
    } & VaultAdapter
    browserAdapter.root = handle
    browserAdapter.rootName = handle.name

    const ignoredPatterns = await loadUserIgnorePatterns(browserAdapter as unknown as VaultAdapter, handle.name)
    set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath: handle.name, mode: 'browser', ignoredPatterns })
    await get().refreshTree()
    _attachWatcher('browser', browserAdapter as unknown as VaultAdapter, handle.name, get, set)
    void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
    return true
  },

  async initDemoMode() {
    const adapter = new DemoAdapter()
    const vaultPath = DemoAdapter.VAULT_NAME
    set({ adapter, vaultPath, mode: 'demo', ignoredPatterns: [] })
    await get().refreshTree()
    _attachWatcher('demo', adapter, vaultPath, get, set)
    void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
    const welcomeFile: VaultFile = { name: 'Welcome.md', path: 'Welcome.md', isDir: false }
    await get().openFile(welcomeFile).catch(() => {})
  },

  async initDropboxMode(auth) {
    const adapter = new DropboxAdapter(auth)
    const vaultPath = adapter.vaultLabel
    const ignoredPatterns = await loadUserIgnorePatterns(adapter, vaultPath)
    set({ adapter, vaultPath, mode: 'dropbox', ignoredPatterns })
    await get().refreshTree()
    _attachWatcher('dropbox', adapter, vaultPath, get, set)
    void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
  },

  async initElectronMode() {
    const { createVaultAdapter, setElectronVaultRoot } = await import('@/adapters')
    const adapter = createVaultAdapter()
    const vaultPath = await adapter.selectVault()
    if (!vaultPath) return
    localStorage.setItem('electronVaultV1', vaultPath)
    setElectronVaultRoot(vaultPath)
    const ignoredPatterns = await loadUserIgnorePatterns(adapter, vaultPath)
    set({ adapter, vaultPath, mode: 'electron', ignoredPatterns })
    await get().refreshTree()
    _attachWatcher('electron', adapter, vaultPath, get, set)
    void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
  },

  async restoreElectronMode(): Promise<boolean> {
    const saved = localStorage.getItem('electronVaultV1')
    if (!saved) return false
    try {
      const { createVaultAdapter, setElectronVaultRoot } = await import('@/adapters')
      const adapter = createVaultAdapter()
      setElectronVaultRoot(saved)
      const ignoredPatterns = await loadUserIgnorePatterns(adapter, saved)
      set({ adapter, vaultPath: saved, mode: 'electron', ignoredPatterns })
      await get().refreshTree()
      _attachWatcher('electron', adapter, saved, get, set)
      void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
      return true
    } catch {
      localStorage.removeItem('electronVaultV1')
      return false
    }
  },

  async restoreLastFile() {
    const savedPath = localStorage.getItem('lastActiveFileV1')
    if (!savedPath || !get().vaultPath) return
    const name = savedPath.split(/[\\/]/).pop() ?? savedPath
    await get().openFile({ name, path: savedPath, isDir: false })
  },

  async disconnect() {
    get()._cancelAutosave()
    await idbStore.clear().catch(() => {})
    localStorage.removeItem('electronVaultV1')
    localStorage.removeItem('lastActiveFileV1')
    get()._watcher?.stop()
    useUIStore.getState().setExternalChangeFile(null)
    useUIStore.getState().setExternalChangeDeleted(false)
    set({
      mode: 'server', adapter: null, vaultPath: null,
      tree: [], activeFile: null, content: '',
      isDirty: false, showPreview: true, selectedDir: null, fileIndex: null,
      _watcher: null,
      ignoredPatterns: [],
    })
    await get().initServerMode()
  },

  // ─── File ops ───────────────────────────────────────────────────────────────

  async refreshTree() {
    const { adapter, vaultPath } = get()
    if (!adapter || !vaultPath) return
    const tree = await buildVaultTree(adapter, vaultPath, IGNORED)
    set({ tree, fileIndex: null })
  },

  async openFile(file) {
    if (file.isDir) return
    get()._cancelAutosave()
    const { adapter } = get()
    if (!adapter) return
    const content = await adapter.readFile(file.path)
    set({
      activeFile: file,
      content,
      isDirty: false,
      showPreview: true,
      selectedDir: parentOf(file.path),
    })
    localStorage.setItem('lastActiveFileV1', file.path)
  },

  async saveFile() {
    const { adapter, activeFile, content } = get()
    if (!adapter || !activeFile) return
    await adapter.writeFile(activeFile.path, content)
    set({ isDirty: false, showPreview: true })
    useUIStore.getState().setExternalChangeFile(null)
    useUIStore.getState().setExternalChangeDeleted(false)
    if (activeFile.name.toLowerCase().endsWith('.md')) {
      const { vaultPath, ignoredPatterns } = get()
      const normRoot = vaultPath ? vaultPath.replace(/[/\\]+$/, '') : ''
      const rel = normRoot
        ? activeFile.path.replace(normRoot, '').replace(/^[/\\]+/, '').replace(/\\/g, '/')
        : activeFile.path
      if (!isIgnoredByUser(rel, ignoredPatterns)) {
        void import('@/plugins/loader').then(m => m.metadataCache.updateFile(activeFile, content)).catch(() => {})
      }
    }
  },

  setContent(content) {
    set({ content, isDirty: true })
    get()._scheduleAutosave()
  },

  async newFile(name, parentPath) {
    const { adapter, vaultPath, selectedDir } = get()
    if (!adapter || !vaultPath) return
    const base = parentPath ?? selectedDir ?? vaultPath
    const filename = name.trim().toLowerCase().endsWith('.md')
      ? name.trim()
      : `${name.trim()}.md`
    const filePath = base ? `${base}/${filename}` : filename
    await adapter.writeFile(filePath, '')
    const { vaultPath: vp, ignoredPatterns: ip } = get()
    const normRoot2 = vp ? vp.replace(/[/\\]+$/, '') : ''
    const relPath = normRoot2
      ? filePath.replace(normRoot2, '').replace(/^[/\\]+/, '').replace(/\\/g, '/')
      : filePath
    if (!isIgnoredByUser(relPath, ip)) {
      void import('@/plugins/loader').then(m => m.metadataCache.updateFile({ path: filePath }, '')).catch(() => {})
    }
    get().invalidateIndex()
    await get().refreshTree()
    const file: VaultFile = { name: filename, path: filePath, isDir: false }
    await get().openFile(file)
  },

  async newFolder(name, parentPath) {
    const { adapter, vaultPath, selectedDir } = get()
    if (!adapter || !vaultPath) return
    const base = parentPath ?? selectedDir ?? vaultPath
    const dirPath = base ? `${base}/${name.trim()}` : name.trim()
    if (adapter.mkdir) await adapter.mkdir(dirPath)
    await get().refreshTree()
    set({ selectedDir: dirPath })
  },

  async deleteFile(file) {
    const { adapter, activeFile } = get()
    if (!adapter) return
    await adapter.deleteFile(file.path)
    void import('@/plugins/loader').then(m => m.metadataCache.deleteFile(file)).catch(() => {})
    get().invalidateIndex()
    if (activeFile?.path === file.path) {
      set({ activeFile: null, content: '', isDirty: false, showPreview: true })
    }
    await get().refreshTree()
  },

  async moveFile(fromPath, toPath) {
    const { adapter, activeFile } = get()
    if (!adapter || fromPath === toPath) return
    await adapter.renameFile(fromPath, toPath)
    void import('@/plugins/loader').then(async m => {
      if (fromPath.toLowerCase().endsWith('.md')) {
        m.metadataCache.deleteFile({ path: fromPath })
      }
      if (toPath.toLowerCase().endsWith('.md')) {
        const { vaultPath, ignoredPatterns } = get()
        const normRoot = vaultPath ? vaultPath.replace(/[/\\]+$/, '') : ''
        const rel = normRoot
          ? toPath.replace(normRoot, '').replace(/^[/\\]+/, '').replace(/\\/g, '/')
          : toPath
        if (!isIgnoredByUser(rel, ignoredPatterns)) {
          const content = await adapter.readFile(toPath).catch(() => '')
          m.metadataCache.updateFile({ path: toPath }, content)
        }
      }
    }).catch(() => {})
    get().invalidateIndex()
    if (activeFile?.path === fromPath) {
      const filename = toPath.split('/').pop() ?? toPath
      set({ activeFile: { ...activeFile, path: toPath, name: filename } })
    }
    await get().refreshTree()
  },

  // ─── UI helpers ─────────────────────────────────────────────────────────────

  setShowPreview(v) { set({ showPreview: v }) },

  setSelectedDir(dir) { set({ selectedDir: dir }) },

  async resolveWikilink(target) {
    const { adapter, vaultPath, activeFile } = get()
    if (!adapter || !vaultPath) return null
    let t = target.replaceAll('\\', '/').replace(/^\/+/, '').split('#')[0].trim()
    if (!t) return null
    if (!t.includes('.')) t += '.md'

    const currentDir = activeFile ? parentOf(activeFile.path) : ''

    if (!t.includes('/')) {
      const sameDirCandidate = currentDir ? `${currentDir}/${t}` : t
      try {
        await adapter.readFile(sameDirCandidate)
        return sameDirCandidate
      } catch {}

      let { fileIndex } = get()
      if (!fileIndex) {
        fileIndex = await buildFileIndex(adapter, vaultPath, get().ignoredPatterns)
        set({ fileIndex })
      }
      const key = t.toLowerCase().replace(/\.md$/, '')
      const matches = fileIndex.get(key)
      return matches?.[0] ?? null
    }

    return t
  },

  invalidateIndex() { set({ fileIndex: null }) },

  _scheduleAutosave() {
    get()._cancelAutosave()
    const timer = setTimeout(async () => {
      const { isDirty, activeFile } = get()
      if (!isDirty || !activeFile) return
      await get().saveFile().catch(() => {})
    }, AUTOSAVE_MS)
    set({ _autosaveTimer: timer })
  },

  _cancelAutosave() {
    const { _autosaveTimer } = get()
    if (_autosaveTimer) clearTimeout(_autosaveTimer)
    set({ _autosaveTimer: null })
  },
}))

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parentOf(p: string): string {
  const s = (p ?? '').replace(/\/+$/, '')
  const idx = s.lastIndexOf('/')
  return idx === -1 ? '' : s.slice(0, idx)
}

function _attachWatcher(
  mode: VaultMode,
  adapter: VaultAdapter,
  vaultPath: string,
  get: () => VaultStore,
  set: (s: Partial<VaultStore>) => void,
): void {
  // Stop previous watcher if running
  get()._watcher?.stop()

  const watcher = createWatcher(mode, adapter, vaultPath)

  if (watcher) {
    watcher.onTreeChanged(async () => {
      await get().refreshTree()
      const { activeFile, tree } = get()
      if (activeFile && !fileExistsInTree(activeFile.path, tree)) {
        useUIStore.getState().setExternalChangeFile(activeFile.path)
        useUIStore.getState().setExternalChangeDeleted(true)
      }
    })

    watcher.onFileChanged((path) => {
      const { activeFile, isDirty } = get()
      if (!activeFile || activeFile.path !== path) return
      if (isDirty) {
        useUIStore.getState().setExternalChangeFile(path)
        useUIStore.getState().setExternalChangeDeleted(false)
      } else {
        void get().openFile(activeFile)  // silent reload
      }
    })

    watcher.start()
  }

  set({ _watcher: watcher ?? null })
}

async function buildVaultTree(
  adapter: VaultAdapter,
  dirPath: string,
  ignored: Set<string>
): Promise<VaultFile[]> {
  const entries = await adapter.listFiles(dirPath)
  const files = await Promise.all(
    entries
      .filter((e) => !ignored.has(e.name) && !e.name.startsWith('.'))
      .map(async (e): Promise<VaultFile> => {
        if (e.isDir) return { ...e, children: await buildVaultTree(adapter, e.path, ignored) }
        return e
      })
  )
  return files.sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)
  )
}

function fileExistsInTree(filePath: string, tree: VaultFile[]): boolean {
  for (const f of tree) {
    if (!f.isDir && f.path === filePath) return true
    if (f.isDir && f.children && fileExistsInTree(filePath, f.children)) return true
  }
  return false
}
