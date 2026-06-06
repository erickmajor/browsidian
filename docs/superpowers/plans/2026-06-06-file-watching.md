# File Watching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect external vault changes and reflect them automatically — refresh the file tree silently, and show a toast when the active file is modified externally while the user has unsaved edits.

**Architecture:** A `VaultWatcher` interface with three implementations: `ElectronWatcher` (native `fs.watch` via IPC push), `ServerWatcher` (SSE via `EventSource`), `BrowserWatcher` (15 s polling via FSAA). All converge on two callbacks — `onTreeChanged` and `onFileChanged` — registered in `VaultStore` after each vault init. A persistent `ExternalChangeToast` component (bottom-left) surfaces the conflict to the user.

**Tech Stack:** Node.js `fs.watch`, Browser `EventSource` / SSE, FSAA `FileSystemFileHandle.lastModified`, React, Zustand.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/watchers/index.ts` | Create | `VaultWatcher` interface + `createWatcher` factory |
| `src/watchers/electron.ts` | Create | IPC-based watcher (Electron mode) |
| `src/watchers/server.ts` | Create | SSE-based watcher (Server mode) |
| `src/watchers/browser.ts` | Create | Polling watcher (Browser mode) |
| `src/components/ExternalChangeToast.tsx` | Create | Persistent toast for external-change conflicts |
| `src/stores/ui.ts` | Modify | Add `externalChangeFile` + `externalChangeDeleted` state |
| `src/stores/vault.ts` | Modify | Wire watcher into every `initXxxMode`, `disconnect`, `saveFile` |
| `src/adapters/index.ts` | Modify | Add optional `getLastModified` to `VaultAdapter` + `WebAdapter` |
| `src/global.d.ts` | Modify | Add watch methods to `ElectronAPI` interface |
| `electron/main.ts` | Modify | Add `vault:watch:start` / `vault:watch:stop` IPC handlers |
| `electron/preload.ts` | Modify | Expose `watchVault`, `stopWatchVault`, `onVaultChanged`, `offVaultChanged` |
| `server.js` | Modify | Add `GET /api/watch` SSE endpoint |
| `src/App.tsx` | Modify | Render `<ExternalChangeToast />` |
| `src/styles/global.css` | Modify | Add `.ext-change-toast` styles |
| `README.md` | Modify | Document file watching feature |
| `package.json` | Modify | Bump version |

---

## Task 1: VaultWatcher interface + skeleton factory

**Files:**
- Create: `src/watchers/index.ts`

- [ ] **Step 1: Create `src/watchers/index.ts`**

```ts
import type { VaultMode } from '@/stores/vault'
import type { VaultAdapter } from '@/adapters'

export interface VaultWatcher {
  start(): void
  stop(): void
  onTreeChanged(cb: () => void): void
  onFileChanged(cb: (path: string) => void): void
}

export function createWatcher(
  _mode: VaultMode,
  _adapter: VaultAdapter,
  _vaultPath: string,
): VaultWatcher | null {
  return null  // implementations added per task
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/watchers/index.ts
git commit -m "feat(watching): add VaultWatcher interface and skeleton factory"
```

---

## Task 2: UIStore — external change state

**Files:**
- Modify: `src/stores/ui.ts`

- [ ] **Step 1: Add fields to `UIStore` interface**

In `src/stores/ui.ts`, add to the `UIStore` interface (after `graphOpen: boolean`):

```ts
externalChangeFile: string | null
externalChangeDeleted: boolean
setExternalChangeFile(path: string | null): void
setExternalChangeDeleted(deleted: boolean): void
```

- [ ] **Step 2: Add initial state and setters**

In the store's returned object, add (after `graphOpen: false,`):

```ts
externalChangeFile: null,
externalChangeDeleted: false,
```

Add setters (after `setGraphOpen(v) { set({ graphOpen: v }) },`):

```ts
setExternalChangeFile(path) { set({ externalChangeFile: path }) },
setExternalChangeDeleted(deleted) { set({ externalChangeDeleted: deleted }) },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/stores/ui.ts
git commit -m "feat(watching): add external-change state to UIStore"
```

---

## Task 3: ExternalChangeToast component + CSS + App.tsx

**Files:**
- Create: `src/components/ExternalChangeToast.tsx`
- Modify: `src/styles/global.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/ExternalChangeToast.tsx`**

```tsx
import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'

export function ExternalChangeToast() {
  const {
    externalChangeFile,
    externalChangeDeleted,
    setExternalChangeFile,
    setExternalChangeDeleted,
  } = useUIStore()
  const { activeFile, openFile } = useVaultStore()

  // Auto-dismiss deleted variant after 4 s and close the editor
  useEffect(() => {
    if (!externalChangeFile || !externalChangeDeleted) return
    const timer = setTimeout(() => {
      useVaultStore.setState({ activeFile: null, content: '', isDirty: false, showPreview: true })
      setExternalChangeFile(null)
      setExternalChangeDeleted(false)
    }, 4000)
    return () => clearTimeout(timer)
  }, [externalChangeFile, externalChangeDeleted])

  if (!externalChangeFile) return null

  // Show last two path segments to keep the toast compact
  const shortPath = externalChangeFile.replace(/\\/g, '/').split('/').slice(-2).join('/')

  if (externalChangeDeleted) {
    return (
      <div className="ext-change-toast ext-change-toast--deleted">
        <span className="ext-change-icon">✕</span>
        <div className="ext-change-body">
          <div className="ext-change-title">Arquivo removido externamente</div>
          <div className="ext-change-path">{shortPath}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="ext-change-toast">
      <span className="ext-change-icon">⚠</span>
      <div className="ext-change-body">
        <div className="ext-change-title">Arquivo modificado externamente</div>
        <div className="ext-change-path">{shortPath}</div>
      </div>
      <button
        className="btn btn-secondary ext-change-reload"
        onClick={() => {
          if (activeFile) void openFile(activeFile)
          setExternalChangeFile(null)
          setExternalChangeDeleted(false)
        }}
      >
        Recarregar
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add CSS to `src/styles/global.css`**

Append at the end of the file (before the final newline):

```css
/* ─── External change toast ──────────────────────────────────────────────── */
.ext-change-toast {
  position: fixed;
  bottom: 18px; left: 18px;
  z-index: 9998;
  display: flex; align-items: center; gap: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  padding: 10px 14px;
  font-size: 12px;
  box-shadow: 0 4px 20px var(--shadow);
  animation: toastIn 0.2s ease;
  max-width: 340px;
  pointer-events: auto;
}
.ext-change-toast--deleted { border-color: var(--danger); }
.ext-change-icon { font-size: 14px; flex-shrink: 0; }
.ext-change-body { flex: 1; min-width: 0; }
.ext-change-title { color: var(--text); font-weight: 500; }
.ext-change-path {
  color: var(--text-muted); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ext-change-reload { margin-left: 8px; flex-shrink: 0; }
```

- [ ] **Step 3: Wire into `src/App.tsx`**

Add import at the top (with the other component imports):

```tsx
import { ExternalChangeToast } from '@/components/ExternalChangeToast'
```

Add `<ExternalChangeToast />` right after `{graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}`:

```tsx
{graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}
<ExternalChangeToast />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExternalChangeToast.tsx src/styles/global.css src/App.tsx
git commit -m "feat(watching): add ExternalChangeToast component"
```

---

## Task 4: Electron IPC — main.ts + preload.ts + global.d.ts

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/global.d.ts`

- [ ] **Step 1: Add `fs` (sync) import to `electron/main.ts`**

`electron/main.ts` currently has `import * as fs from 'fs/promises'`. Add a separate sync import right after it:

```ts
import * as fsSync from 'fs'
```

- [ ] **Step 2: Add module-level watcher variable**

After the `const DEV = ...` line, add:

```ts
let _vaultFsWatcher: fsSync.FSWatcher | null = null
```

- [ ] **Step 3: Add IPC handlers at the bottom of `electron/main.ts`**

After the `ipcMain.handle('plugin:load', ...)` block, append:

```ts
// ─── IPC: File watching ───────────────────────────────────────────────────────

ipcMain.on('vault:watch:start', (e, vaultPath: string) => {
  _vaultFsWatcher?.close()
  _vaultFsWatcher = null
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  try {
    _vaultFsWatcher = fsSync.watch(vaultPath, { recursive: true }, (eventType, filename) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        win.webContents.send('vault:changed', { eventType, filename })
      }, 500)
    })
    _vaultFsWatcher.on('error', (err) => console.error('[watcher]', err))
  } catch (err) {
    console.error('[watcher] failed to start', err)
  }
})

ipcMain.on('vault:watch:stop', () => {
  _vaultFsWatcher?.close()
  _vaultFsWatcher = null
})
```

- [ ] **Step 4: Update `electron/preload.ts`**

Replace the entire file with:

```ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Vault
  selectVault: ()                              => ipcRenderer.invoke('vault:select'),
  listFiles:   (dirPath: string)               => ipcRenderer.invoke('vault:list',   dirPath),
  readFile:    (filePath: string)              => ipcRenderer.invoke('vault:read',   filePath),
  writeFile:   (filePath: string, content: string) => ipcRenderer.invoke('vault:write',  filePath, content),
  deleteFile:  (filePath: string)              => ipcRenderer.invoke('vault:delete', filePath),
  renameFile:  (oldPath: string, newPath: string)  => ipcRenderer.invoke('vault:rename', oldPath, newPath),
  mkdir:       (dirPath: string)                    => ipcRenderer.invoke('vault:mkdir',  dirPath),
  // App
  getVersion:    ()                              => ipcRenderer.invoke('app:version'),
  toggleDevTools: ()                             => ipcRenderer.invoke('devtools:toggle'),
  // Plugins
  loadPlugin:  (pluginDir: string)             => ipcRenderer.invoke('plugin:load',  pluginDir),
  // File watching
  watchVault:      (vaultPath: string)         => ipcRenderer.send('vault:watch:start', vaultPath),
  stopWatchVault:  ()                          => ipcRenderer.send('vault:watch:stop'),
  onVaultChanged:  (cb: (event: unknown, data: { eventType: string; filename: string | null }) => void) =>
    ipcRenderer.on('vault:changed', cb),
  offVaultChanged: ()                          => ipcRenderer.removeAllListeners('vault:changed'),
})
```

- [ ] **Step 5: Update `ElectronAPI` type in `src/global.d.ts`**

In the `ElectronAPI` interface, add after `toggleDevTools(): Promise<void>`:

```ts
watchVault(vaultPath: string): void
stopWatchVault(): void
onVaultChanged(cb: (event: unknown, data: { eventType: string; filename: string | null }) => void): void
offVaultChanged(): void
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts electron/preload.ts src/global.d.ts
git commit -m "feat(watching): add Electron IPC for vault file watching"
```

---

## Task 5: ElectronWatcher + update factory

**Files:**
- Create: `src/watchers/electron.ts`
- Modify: `src/watchers/index.ts`

- [ ] **Step 1: Create `src/watchers/electron.ts`**

```ts
import type { VaultWatcher } from './index'

const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

export class ElectronWatcher implements VaultWatcher {
  private vaultPath: string
  private treeCb: (() => void) | null = null
  private fileCb: ((path: string) => void) | null = null
  private _listener: ((event: unknown, data: { eventType: string; filename: string | null }) => void) | null = null

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath
  }

  onTreeChanged(cb: () => void)          { this.treeCb = cb }
  onFileChanged(cb: (p: string) => void) { this.fileCb = cb }

  start() {
    this._listener = (_event, { eventType, filename }) => {
      if (!filename) return
      // Filter ignored directories anywhere in the path
      const parts = filename.replace(/\\/g, '/').split('/')
      if (parts.some((p) => IGNORED.has(p))) return

      if (eventType === 'rename') {
        // rename = file/dir added or deleted → tree changed
        this.treeCb?.()
      } else {
        // change = file content updated
        // Build absolute path matching activeFile.path (which uses native OS separators)
        const sep = this.vaultPath.includes('\\') ? '\\' : '/'
        const absPath = this.vaultPath.replace(/[/\\]+$/, '') + sep + filename
        this.fileCb?.(absPath)
      }
    }
    window.electronAPI.onVaultChanged(this._listener)
    window.electronAPI.watchVault(this.vaultPath)
  }

  stop() {
    window.electronAPI.stopWatchVault()
    window.electronAPI.offVaultChanged()
    this._listener = null
  }
}
```

- [ ] **Step 2: Update `createWatcher` in `src/watchers/index.ts`**

Replace the file with:

```ts
import type { VaultMode } from '@/stores/vault'
import type { VaultAdapter } from '@/adapters'
import { ElectronWatcher } from './electron'

export interface VaultWatcher {
  start(): void
  stop(): void
  onTreeChanged(cb: () => void): void
  onFileChanged(cb: (path: string) => void): void
}

export function createWatcher(
  mode: VaultMode,
  adapter: VaultAdapter,
  vaultPath: string,
): VaultWatcher | null {
  if (mode === 'electron') return new ElectronWatcher(vaultPath)
  return null
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/watchers/electron.ts src/watchers/index.ts
git commit -m "feat(watching): add ElectronWatcher"
```

---

## Task 6: Server SSE endpoint + ServerWatcher + update factory

**Files:**
- Modify: `server.js`
- Create: `src/watchers/server.ts`
- Modify: `src/watchers/index.ts`

- [ ] **Step 1: Add SSE endpoint to `server.js`**

In `server.js`, inside the `/api/` block, insert AFTER the `!vaultReal` check and BEFORE the `/api/list` handler (around line 459). Add:

```js
if (req.method === 'GET' && reqUrl.pathname === '/api/watch') {
  const WATCH_IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('\n')

  let debounceTimer = null
  let fsWatcher
  try {
    fsWatcher = fs.watch(vaultReal, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      const parts = filename.replace(/\\/g, '/').split('/')
      if (parts.some((p) => WATCH_IGNORED.has(p))) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const relPath = filename.replace(/\\/g, '/')
        res.write(`data: ${JSON.stringify({ type: eventType, path: relPath })}\n\n`)
      }, 500)
    })
    fsWatcher.on('error', (err) => console.error('[SSE watcher]', err))
  } catch (err) {
    console.error('[SSE watcher] failed to start', err)
  }

  const heartbeat = setInterval(() => res.write('data: {"type":"ping"}\n\n'), 30000)

  res.on('close', () => {
    fsWatcher?.close()
    clearInterval(heartbeat)
    if (debounceTimer) clearTimeout(debounceTimer)
  })
  return
}
```

- [ ] **Step 2: Verify the server endpoint manually**

Start the server with a vault:

```bash
node server.js --vault /path/to/your/vault
```

In another terminal:

```bash
curl -N http://127.0.0.1:5174/api/watch
```

Expected output: a blank initial line, then no output until a file in the vault is changed (e.g., `touch /path/to/your/vault/test.md`), after which:

```
data: {"type":"rename","path":"test.md"}
```

Stop with `Ctrl+C`. Server must not crash.

- [ ] **Step 3: Create `src/watchers/server.ts`**

```ts
import type { VaultWatcher } from './index'

export class ServerWatcher implements VaultWatcher {
  private treeCb: (() => void) | null = null
  private fileCb: ((path: string) => void) | null = null
  private es: EventSource | null = null

  onTreeChanged(cb: () => void)          { this.treeCb = cb }
  onFileChanged(cb: (p: string) => void) { this.fileCb = cb }

  start() {
    this.es = new EventSource('/api/watch')
    this.es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; path?: string }
        if (msg.type === 'ping') return
        if (msg.type === 'rename') this.treeCb?.()
        else if (msg.type === 'change' && msg.path) this.fileCb?.(msg.path)
      } catch {}
    }
    this.es.onerror = () => console.error('[ServerWatcher] SSE connection error')
  }

  stop() {
    this.es?.close()
    this.es = null
  }
}
```

- [ ] **Step 4: Update `createWatcher` in `src/watchers/index.ts`**

Replace the file with:

```ts
import type { VaultMode } from '@/stores/vault'
import type { VaultAdapter } from '@/adapters'
import { ElectronWatcher } from './electron'
import { ServerWatcher } from './server'

export interface VaultWatcher {
  start(): void
  stop(): void
  onTreeChanged(cb: () => void): void
  onFileChanged(cb: (path: string) => void): void
}

export function createWatcher(
  mode: VaultMode,
  adapter: VaultAdapter,
  vaultPath: string,
): VaultWatcher | null {
  if (mode === 'electron') return new ElectronWatcher(vaultPath)
  if (mode === 'server') return new ServerWatcher()
  return null
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server.js src/watchers/server.ts src/watchers/index.ts
git commit -m "feat(watching): add SSE endpoint and ServerWatcher"
```

---

## Task 7: BrowserWatcher + VaultAdapter.getLastModified + update factory

**Files:**
- Modify: `src/adapters/index.ts`
- Create: `src/watchers/browser.ts`
- Modify: `src/watchers/index.ts`

- [ ] **Step 1: Add optional `getLastModified` to `VaultAdapter` interface in `src/adapters/index.ts`**

In the `VaultAdapter` interface (after `mkdir?`), add:

```ts
getLastModified?(filePath: string): Promise<number | null>
```

- [ ] **Step 2: Implement `getLastModified` in `WebAdapter`**

In `WebAdapter`, add after the `renameFile` method:

```ts
async getLastModified(filePath: string): Promise<number | null> {
  try {
    const fh = await this._file(filePath)
    const file = await fh.getFile()
    return file.lastModified
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Create `src/watchers/browser.ts`**

```ts
import type { VaultWatcher } from './index'
import type { VaultAdapter } from '@/adapters'

const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

type Snapshot = Map<string, number>  // path → lastModified (0 if unavailable)

export class BrowserWatcher implements VaultWatcher {
  private adapter: VaultAdapter
  private vaultPath: string
  private treeCb: (() => void) | null = null
  private fileCb: ((path: string) => void) | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private snapshot: Snapshot = new Map()

  constructor(adapter: VaultAdapter, vaultPath: string) {
    this.adapter = adapter
    this.vaultPath = vaultPath
  }

  onTreeChanged(cb: () => void)          { this.treeCb = cb }
  onFileChanged(cb: (p: string) => void) { this.fileCb = cb }

  start() {
    void this._buildSnapshot()
      .then((snap) => {
        this.snapshot = snap
        this.intervalId = setInterval(() => void this._poll(), 15_000)
      })
      .catch((err) => console.error('[BrowserWatcher] init error', err))
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private async _buildSnapshot(): Promise<Snapshot> {
    const snap: Snapshot = new Map()
    const walk = async (dir: string) => {
      const entries = await this.adapter.listFiles(dir)
      for (const e of entries) {
        if (IGNORED.has(e.name)) continue
        if (e.isDir) { await walk(e.path); continue }
        const mtime = this.adapter.getLastModified
          ? ((await this.adapter.getLastModified(e.path)) ?? 0)
          : 0
        snap.set(e.path, mtime)
      }
    }
    await walk(this.vaultPath)
    return snap
  }

  private async _poll() {
    try {
      const next = await this._buildSnapshot()
      let treeChanged = false
      let changedFile: string | null = null

      // Detect removed or content-modified files
      for (const [p, mtime] of this.snapshot) {
        if (!next.has(p)) { treeChanged = true; break }
        if (next.get(p) !== mtime) changedFile = p
      }
      // Detect added files
      if (!treeChanged) {
        for (const p of next.keys()) {
          if (!this.snapshot.has(p)) { treeChanged = true; break }
        }
      }

      this.snapshot = next

      if (treeChanged) this.treeCb?.()
      else if (changedFile) this.fileCb?.(changedFile)
    } catch (err) {
      console.error('[BrowserWatcher] poll error, stopping', err)
      this.stop()
    }
  }
}
```

- [ ] **Step 4: Update `createWatcher` in `src/watchers/index.ts`**

Replace the file with the final version:

```ts
import type { VaultMode } from '@/stores/vault'
import type { VaultAdapter } from '@/adapters'
import { ElectronWatcher } from './electron'
import { ServerWatcher } from './server'
import { BrowserWatcher } from './browser'

export interface VaultWatcher {
  start(): void
  stop(): void
  onTreeChanged(cb: () => void): void
  onFileChanged(cb: (path: string) => void): void
}

export function createWatcher(
  mode: VaultMode,
  adapter: VaultAdapter,
  vaultPath: string,
): VaultWatcher | null {
  if (mode === 'electron') return new ElectronWatcher(vaultPath)
  if (mode === 'server') return new ServerWatcher()
  if (mode === 'browser') return new BrowserWatcher(adapter, vaultPath)
  return null  // demo and dropbox: no-op
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/index.ts src/watchers/browser.ts src/watchers/index.ts
git commit -m "feat(watching): add BrowserWatcher with FSAA polling"
```

---

## Task 8: VaultStore integration

**Files:**
- Modify: `src/stores/vault.ts`

This is the largest task. It wires the watcher into all seven vault-init paths, `disconnect`, and `saveFile`.

- [ ] **Step 1: Add imports at the top of `src/stores/vault.ts`**

After the existing imports, add:

```ts
import { createWatcher } from '@/watchers'
import type { VaultWatcher } from '@/watchers'
import { useUIStore } from '@/stores/ui'
```

- [ ] **Step 2: Add `_watcher` to the `VaultStore` interface**

In the `VaultStore` interface, add after `_autosaveTimer`:

```ts
_watcher: VaultWatcher | null
```

- [ ] **Step 3: Add `_watcher: null` to the initial store state**

In the store's initial state object (the object returned by `create`), add after `_autosaveTimer: null,`:

```ts
_watcher: null,
```

- [ ] **Step 4: Add `fileExistsInTree` helper at the bottom of the file**

After the `buildVaultTree` function (around line 470), append:

```ts
function fileExistsInTree(filePath: string, tree: VaultFile[]): boolean {
  for (const f of tree) {
    if (!f.isDir && f.path === filePath) return true
    if (f.isDir && f.children && fileExistsInTree(filePath, f.children)) return true
  }
  return false
}
```

- [ ] **Step 5: Add `_attachWatcher` helper above `buildVaultTree`**

This helper is called from every `initXxxMode` to avoid repeating the setup. Add before the `buildVaultTree` function:

```ts
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
```

- [ ] **Step 6: Wire `initServerMode`**

In `initServerMode`, after `await get().refreshTree()`, add:

```ts
_attachWatcher('server', adapter, cfg.vault, get, set)
```

- [ ] **Step 7: Wire `initBrowserMode`**

In `initBrowserMode`, after `await get().refreshTree()`, add:

```ts
_attachWatcher('browser', browserAdapter as unknown as import('@/adapters').VaultAdapter, vaultPath, get, set)
```

- [ ] **Step 8: Wire `restoreBrowserMode`**

In `restoreBrowserMode`, after `await get().refreshTree()`, add:

```ts
_attachWatcher('browser', browserAdapter as unknown as import('@/adapters').VaultAdapter, handle.name, get, set)
```

- [ ] **Step 9: Wire `initDemoMode`**

In `initDemoMode`, after `await get().refreshTree()`, add:

```ts
_attachWatcher('demo', adapter, vaultPath, get, set)
```

(Returns `null` from factory — no-op.)

- [ ] **Step 10: Wire `initDropboxMode`**

In `initDropboxMode`, after `await get().refreshTree()`, add:

```ts
_attachWatcher('dropbox', adapter, vaultPath, get, set)
```

(Returns `null` from factory — no-op.)

- [ ] **Step 11: Wire `initElectronMode`**

In `initElectronMode`, after `await get().refreshTree()`, add:

```ts
_attachWatcher('electron', adapter, vaultPath, get, set)
```

- [ ] **Step 12: Wire `restoreElectronMode`**

In `restoreElectronMode`, after `await get().refreshTree()`, add:

```ts
_attachWatcher('electron', adapter, saved, get, set)
```

- [ ] **Step 13: Update `disconnect`**

Inside the `disconnect` function, add these two lines BEFORE `set({ mode: 'server', ... })`:

```ts
get()._watcher?.stop()
useUIStore.getState().setExternalChangeFile(null)
useUIStore.getState().setExternalChangeDeleted(false)
```

Also add `_watcher: null` to the `set({ ... })` call in `disconnect`:

```ts
set({
  mode: 'server', adapter: null, vaultPath: null,
  tree: [], activeFile: null, content: '',
  isDirty: false, showPreview: true, selectedDir: null, fileIndex: null,
  _watcher: null,
})
```

- [ ] **Step 14: Update `saveFile`**

Inside `saveFile`, after `set({ isDirty: false, showPreview: true })`, add:

```ts
useUIStore.getState().setExternalChangeFile(null)
useUIStore.getState().setExternalChangeDeleted(false)
```

- [ ] **Step 15: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 16: Manual verification (Electron)**

1. Start Electron dev: `npm run dev:electron`
2. Open a vault
3. In File Explorer / Terminal, create a new `.md` file inside the vault
4. Verify the sidebar tree updates within ~1 s without restarting
5. Open a `.md` file in the app, make edits (do NOT save)
6. In another editor (e.g., Notepad / VS Code), modify the same file and save
7. Verify the yellow toast appears bottom-left: "⚠ Arquivo modificado externamente"
8. Click "Recarregar" — verify the app loads the external version and toast disappears
9. Repeat step 5-6, but this time save in the app first (Ctrl+S)
10. Verify NO toast appears (save dismissed the conflict)

- [ ] **Step 17: Commit**

```bash
git add src/stores/vault.ts
git commit -m "feat(watching): wire VaultWatcher into VaultStore"
```

---

## Task 9: README + version bump

**Files:**
- Modify: `README.md`
- Modify: `package.json`

- [ ] **Step 1: Add file watching to the Features section in `README.md`**

In the `## Features` section, add after the Graph view bullet:

```markdown
- **File watching:** The app detects external changes to vault files without requiring a restart. In Electron mode, native `fs.watch` pushes events instantly. In Server mode, the server pushes changes via SSE. In Browser mode, the app polls every 15 s using the File System Access API. The file tree refreshes automatically. If the active file is modified externally while you have unsaved edits, a toast prompts you to reload or keep your version.
```

- [ ] **Step 2: Bump version in `package.json`**

Increment the patch version (e.g., `1.2.73` → `1.2.74`).

- [ ] **Step 3: Commit**

```bash
git add README.md package.json
git commit -m "feat(watching): file system watching — Electron, Server, Browser"
```
