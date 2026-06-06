# File Watching Design

## Goal

Detect external changes to vault files and directories in real time (or near-real time), refresh the file tree automatically, and notify the user when the currently open file was modified externally while they have unsaved edits.

## Scope

All four operating modes that have real or simulated vaults:

| Mode | Strategy |
|---|---|
| Electron | Native `fs.watch` in main process → IPC push |
| Server | `fs.watch` in `server.js` → SSE (`EventSource`) |
| Browser | FSAA polling every 15 seconds |
| Demo | No-op (all changes are in-app; no external source) |
| Dropbox | No-op (out of scope; would require Dropbox webhook/longpoll) |

## Architecture

### VaultWatcher interface

```ts
interface VaultWatcher {
  start(): void
  stop(): void
  onTreeChanged(cb: () => void): void
  onFileChanged(cb: (path: string) => void): void
}
```

`createWatcher(mode, adapter, vaultPath): VaultWatcher | null` — factory in `src/watchers/index.ts`. Returns `null` for Demo and Dropbox modes.

All watchers debounce file-system events by **500 ms** to handle atomic saves (editors that write a temp file then rename it produce two rapid events).

### New files

| File | Responsibility |
|---|---|
| `src/watchers/index.ts` | `VaultWatcher` interface + `createWatcher` factory |
| `src/watchers/electron.ts` | IPC-based watcher for Electron mode |
| `src/watchers/server.ts` | SSE-based watcher for Server mode |
| `src/watchers/browser.ts` | Polling watcher for Browser mode |

### Modified files

| File | Change |
|---|---|
| `electron/main.ts` | `ipcMain` handlers for `vault:watch:start` / `vault:watch:stop` → `fs.watch` → `webContents.send` |
| `electron/preload.ts` | Exposes `watchVault`, `stopWatchVault`, `onVaultChanged`, `offVaultChanged` |
| `server.js` | SSE endpoint `GET /api/watch` |
| `src/stores/vault.ts` | `_watcher` field; each `initXxxMode` starts watcher; `disconnect` stops it |
| `src/stores/ui.ts` | `externalChangeFile: string \| null` + `setExternalChangeFile` |
| `src/App.tsx` | Renders `<ExternalChangeToast />` |
| `src/components/ExternalChangeToast.tsx` | New toast component |
| `src/styles/global.css` | Toast styles using existing CSS variables |

## Per-mode Implementation

### Electron

**Main process (`electron/main.ts`):**

```ts
ipcMain.on('vault:watch:start', (e, vaultPath: string) => {
  // Close any previous watcher
  currentWatcher?.close()
  const win = BrowserWindow.fromWebContents(e.sender)!
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  currentWatcher = fs.watch(vaultPath, { recursive: true }, (eventType, filename) => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      win.webContents.send('vault:changed', { eventType, filename })
    }, 500)
  })
})

ipcMain.on('vault:watch:stop', () => {
  currentWatcher?.close()
  currentWatcher = null
})
```

**Preload (`electron/preload.ts`):**

```ts
watchVault:     (path: string) => ipcRenderer.send('vault:watch:start', path),
stopWatchVault: ()             => ipcRenderer.send('vault:watch:stop'),
onVaultChanged: (cb: (event: Electron.IpcRendererEvent, data: { eventType: string; filename: string | null }) => void) =>
  ipcRenderer.on('vault:changed', cb),
offVaultChanged: () => ipcRenderer.removeAllListeners('vault:changed'),
```

**Renderer (`src/watchers/electron.ts`):**

Calls `window.electronAPI.watchVault(vaultPath)` in `start()`, registers the `onVaultChanged` listener, categorises events as `tree-changed` (rename = add/delete) or `file-changed` (change = content update), fires the appropriate callback. Calls `offVaultChanged()` in `stop()`.

### Server

**`server.js` — new endpoint `GET /api/watch`:**

- Responds with `Content-Type: text/event-stream; charset=utf-8`
- Opens `fs.watch(vaultRoot, { recursive: true })` with 500 ms debounce → sends `data: {"type":"change"|"rename","path":"…"}\n\n`
- Sends `data: {"type":"ping"}\n\n` every 30 s (keeps connection alive through proxies)
- On `res.on('close')` → closes the `fs.watch` watcher and clears heartbeat interval
- Returns 503 if no vault is configured

**Renderer (`src/watchers/server.ts`):**

```ts
const es = new EventSource('/api/watch')
es.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.type === 'ping') return
  if (msg.type === 'rename') onTreeChanged()
  else onFileChanged(msg.path)
}
```

Closes `es` in `stop()`.

### Browser (polling)

**`src/watchers/browser.ts`:**

- `start()`: takes snapshot of full FSAA tree as `Map<relativePath, lastModified>`
- `setInterval(15_000, poll)`
- `poll()`: walks the FSAA directory tree again, builds new snapshot
  - New paths → `onTreeChanged()`
  - Removed paths → `onTreeChanged()`
  - `lastModified` changed → `onFileChanged(path)`
- `stop()`: `clearInterval`

`lastModified` comes from `FileSystemFileHandle.getFile().lastModified` (ms timestamp).

## VaultStore Integration

Add `_watcher: VaultWatcher | null` to the store interface and state.

Each `initXxxMode()` after setting `adapter`/`vaultPath`:

```ts
const watcher = createWatcher(mode, adapter, vaultPath)
if (watcher) {
  watcher.onTreeChanged(async () => {
    await get().refreshTree()
    // After tree refresh, check if the active file still exists
    const { activeFile, tree } = get()
    if (activeFile && !fileExistsInTree(activeFile.path, tree)) {
      useUIStore.getState().setExternalChangeFile(activeFile.path)
      // Mark as deleted so toast shows the right variant
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
      get().openFile(activeFile)  // silent reload
    }
  })
  watcher.start()
}
set({ _watcher: watcher })
```

`fileExistsInTree(path, tree): boolean` — recursive helper that walks `VaultFile[]` looking for a matching `path`.

`disconnect()` adds:

```ts
get()._watcher?.stop()
set({ _watcher: null })
useUIStore.getState().setExternalChangeFile(null)
useUIStore.getState().setExternalChangeDeleted(false)
```

`saveFile()` clears the toast on successful save:

```ts
useUIStore.getState().setExternalChangeFile(null)
useUIStore.getState().setExternalChangeDeleted(false)
```

## UI — ExternalChangeToast

**Component (`src/components/ExternalChangeToast.tsx`):**

Fixed position, bottom-right, above the status bar. Two variants:

1. **File modified** (when `externalChangeFile` is a path that still exists):

```
┌─────────────────────────────────────────────────┐
│ ⚠ Arquivo modificado externamente               │
│ notes/daily.md                      [Recarregar] │
└─────────────────────────────────────────────────┘
```

"Recarregar" → calls `openFile(activeFile)` (re-reads from disk) → clears toast.

2. **File deleted** (when `externalChangeFile` is set and the file no longer exists):

```
┌─────────────────────────────────────────────────┐
│ ✕ Arquivo removido externamente                 │
│ notes/daily.md                                  │
└─────────────────────────────────────────────────┘
```

Auto-dismisses after 4 s. Closes editor (`activeFile: null`).

**CSS:** uses `--color-surface`, `--color-surface-2`, `--color-accent`, `--color-text`, `--radius`, `--shadow`. No new tokens.

**`src/stores/ui.ts` additions:**

```ts
externalChangeFile: string | null       // path of conflicting file
externalChangeDeleted: boolean          // true = file was deleted, false = file was modified
setExternalChangeFile(path: string | null): void
setExternalChangeDeleted(deleted: boolean): void
```

## Error Handling

- `fs.watch` errors (e.g., vault directory removed): catch, log to console, do not crash.
- SSE connection drops: `EventSource` auto-reconnects natively. No additional logic needed.
- Browser poll errors (FSAA permission revoked): catch, log, stop polling.
- Watcher events for paths inside `.obsidian`, `.git`, `node_modules`, `.trash`: ignored (same `IGNORED` set as the tree builder).

## Ignored Paths

Watcher events for entries matching the `IGNORED` set (`.obsidian`, `.git`, `node_modules`, `.trash`, `.DS_Store`) are filtered out before firing any callback.
