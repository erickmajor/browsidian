# OA-File-Hider Plugin Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OA-file-hider community plugin (Oliver Akins) work in Browsidian by implementing the two DOM/API surfaces it depends on.

**Architecture:** The plugin hides sidebar items via `document.querySelector('[data-path="…"]').parentElement.style.display = 'none'` — so we add `data-path` to inner `.tree-item` divs and wrap each TreeNode in a plain outer `<div>` whose `parentElement.style.display` the plugin can set. For the context menu, the plugin registers `app.workspace.on('file-menu', (menu, file) => menu.addItem(…))` — so we add a `Menu` class to the obsidian shim and emit `file-menu` from `ContextMenu` before rendering, collecting plugin-contributed items. React tolerates the direct DOM style manipulation on the wrapper divs because it never sets `style` on them in JSX.

**Tech Stack:** TypeScript, React, Zustand. No test suite — verify via `npx tsc --noEmit` + manual testing in Electron.

---

## Plugin Behavior (reference)

From `.obsidian/plugins/OA-file-hider/main.js`:

```js
// Hides/shows by querying data-path, hiding the parentElement
function changePathVisibility(path, hide) {
  let n = document.querySelector(`[data-path="${path}"]`);
  if (!n) return;
  let p = n.parentElement;
  p.style.display = hide ? 'none' : '';
}

// On load: apply hidden state to all saved paths
this.app.workspace.onLayoutReady(() => {
  setTimeout(() => {
    for (const path of this.settings.hiddenList) {
      changePathVisibility(path, this.settings.hidden);
    }
  }, 200);
});

// Context menu: add Hide/Unhide items for files and folders
this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
  menu.addItem((i) => {
    i.setTitle('Hide Folder').setIcon('eye-off').onClick(() => {
      changePathVisibility(file.path, this.settings.hidden);
      this.settings.hiddenList.push(file.path);
      this.saveSettings();
    });
  });
}));
```

`data.json` for the vault: `{ "hidden": true, "hiddenList": ["logseq"] }`

## Root Causes

| # | Symptom | Root cause |
|---|---------|------------|
| 1 | `logseq` folder not hidden on load | `querySelector('[data-path="logseq"]')` returns `null` — Sidebar has no `data-path` attributes |
| 2 | No "Hide Folder/File" in context menu | `file-menu` event is never emitted; `Menu` class missing from shim; folder items have no `onContextMenu` handler |

## File Map

| File | Change |
|------|--------|
| `src/plugins/shim/components.ts` | Append `MenuItem` + `Menu` classes |
| `src/plugins/shim/index.ts` | Export `Menu` and `MenuItemData` type |
| `src/stores/ui.ts` | Add `contextMenuIsDir: boolean`; update `showContextMenu` signature |
| `src/components/Sidebar/index.tsx` | Wrapper div + `data-path`; folder `onContextMenu`; pass `isDir` |
| `src/components/ContextMenu.tsx` | Emit `file-menu`, render plugin items |
| `package.json` | Bump Z version |
| `README.md` | Document plugin compatibility improvement |

---

### Task 1: Add `Menu` and `MenuItem` to the obsidian shim

**Files:**
- Modify: `src/plugins/shim/components.ts` (append to end)
- Modify: `src/plugins/shim/index.ts` (update export line)

`Menu` collects items via `addItem(fn)` (the callback pattern the plugin uses). `ContextMenu.tsx` calls `menu.getItems()` to render them. `MenuItem` exposes the fluent builder API the plugin calls (`setTitle`, `setIcon`, `onClick`, etc.).

- [ ] **Step 1: Append `MenuItem` and `Menu` to `src/plugins/shim/components.ts`**

Add this block at the very end of the file (after the last existing class):

```typescript
class MenuItem {
  private _title    = ''
  private _icon     = ''
  private _disabled = false
  private _warning  = false
  private _cb: (e: MouseEvent) => void = () => {}
  dom: HTMLElement = document.createElement('div')

  setTitle(title: string): this             { this._title = title; return this }
  setIcon(icon: string): this               { this._icon = icon; return this }
  setSection(_section: string): this        { return this }
  setDisabled(v: boolean): this             { this._disabled = v; return this }
  setChecked(_v: boolean): this             { return this }
  setWarning(v: boolean): this              { this._warning = v; return this }
  setIsLabel(_v: boolean): this             { return this }
  onClick(cb: (e: MouseEvent) => void): this { this._cb = cb; return this }

  _data() {
    return {
      title:    this._title,
      icon:     this._icon,
      disabled: this._disabled,
      warning:  this._warning,
      onClick:  this._cb,
    }
  }
}

export type MenuItemData = ReturnType<MenuItem['_data']>

export class Menu {
  private _items: MenuItemData[] = []

  addItem(fn: (item: MenuItem) => void): this {
    const item = new MenuItem()
    fn(item)
    this._items.push(item._data())
    return this
  }

  getItems(): MenuItemData[]                          { return this._items }
  addSeparator(): this                                { return this }
  setNoIcon(): this                                   { return this }
  hide(): void                                        {}
  close(): void                                       {}
  showAtMouseEvent(_e: MouseEvent): this              { return this }
  showAtPosition(_pos: { x: number; y: number }): this { return this }
}
```

- [ ] **Step 2: Export `Menu` and `MenuItemData` from `src/plugins/shim/index.ts`**

Find this line in `src/plugins/shim/index.ts`:
```typescript
export { Notice, Modal, SuggestModal, FuzzySuggestModal } from './components'
```

Replace with:
```typescript
export { Notice, Modal, SuggestModal, FuzzySuggestModal, Menu } from './components'
export type { MenuItemData } from './components'
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors in shim files.

- [ ] **Step 4: Commit**

```bash
git add src/plugins/shim/components.ts src/plugins/shim/index.ts
git commit -m "feat(shim): add Menu and MenuItem classes for plugin context menu support"
```

---

### Task 2: Add `contextMenuIsDir` to UIStore

**Files:**
- Modify: `src/stores/ui.ts`

`ContextMenu` needs to know if the right-clicked item is a directory to create `TFolder` vs `TFile` for the `file-menu` event. Add `contextMenuIsDir: boolean` to the state and update `showContextMenu` to accept an `isDir` parameter.

- [ ] **Step 1: Replace `src/stores/ui.ts` with the following**

```typescript
import { create } from 'zustand'

type Theme = 'dark' | 'light'

function loadTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try { localStorage.setItem('theme', theme) } catch {}
}

interface UIStore {
  status: string
  theme: Theme
  draggingPath: string | null
  contextMenuPath: string | null
  contextMenuPos: { x: number; y: number } | null
  contextMenuIsDir: boolean
  graphOpen: boolean
  externalChangeFile: string | null
  externalChangeDeleted: boolean

  setStatus(msg: string): void
  setTheme(theme: Theme): void
  toggleTheme(): void
  setDragging(path: string | null): void
  showContextMenu(path: string, x: number, y: number, isDir: boolean): void
  hideContextMenu(): void
  setGraphOpen(v: boolean): void
  setExternalChangeFile(path: string | null): void
  setExternalChangeDeleted(deleted: boolean): void
}

export const useUIStore = create<UIStore>((set, get) => {
  const initialTheme = loadTheme()
  applyTheme(initialTheme)

  return {
    status: 'Ready.',
    theme: initialTheme,
    draggingPath: null,
    contextMenuPath: null,
    contextMenuPos: null,
    contextMenuIsDir: false,
    graphOpen: false,
    externalChangeFile: null,
    externalChangeDeleted: false,

    setStatus(msg) { set({ status: msg }) },

    setTheme(theme) {
      applyTheme(theme)
      set({ theme })
    },

    toggleTheme() {
      get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
    },

    setDragging(path) { set({ draggingPath: path }) },

    showContextMenu(path, x, y, isDir) {
      set({ contextMenuPath: path, contextMenuPos: { x, y }, contextMenuIsDir: isDir })
    },

    hideContextMenu() {
      set({ contextMenuPath: null, contextMenuPos: null, contextMenuIsDir: false })
    },

    setGraphOpen(v) { set({ graphOpen: v }) },

    setExternalChangeFile(path) { set({ externalChangeFile: path }) },
    setExternalChangeDeleted(deleted) { set({ externalChangeDeleted: deleted }) },
  }
})
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: TypeScript will report errors on `Sidebar/index.tsx` and `ContextMenu.tsx` because `showContextMenu` now requires 4 arguments. These are fixed in Tasks 3 and 4.

---

### Task 3: Sidebar — wrapper div, `data-path`, folder context menu, `isDir`

**Files:**
- Modify: `src/components/Sidebar/index.tsx`

Four changes in one file:
1. Wrap each `TreeNode` return in an outer `<div>` — this is the `parentElement` the plugin hides
2. Add `data-path={item.path}` to the inner `.tree-item` div — this is what `querySelector` finds
3. Add `onContextMenu` handler to folder items (currently missing — only files have it)
4. Update `onContextMenu` prop signature to `(path, x, y, isDir)` and wire `showContextMenu` accordingly

The DOM structure the plugin expects:
```
<div>                              ← parentElement (hidden by plugin via style.display)
  <div data-path="logseq" …>      ← querySelector('[data-path="logseq"]') finds this
    …folder title…
  </div>
  <div class="tree-children">…</div>
</div>
```

- [ ] **Step 1: Replace `src/components/Sidebar/index.tsx` with the following**

```typescript
import { useState } from 'react'
import { useVaultStore } from '@/stores/vault'
import { useUIStore } from '@/stores/ui'
import type { VaultFile } from '@/stores/vault'

interface SidebarProps {
  onNewFile: () => void
  onNewFolder: () => void
  onDisconnect: () => void
}

export function Sidebar({ onNewFile, onNewFolder, onDisconnect }: SidebarProps) {
  const { vaultPath, tree, activeFile, selectedDir, openFile, moveFile, setSelectedDir } = useVaultStore()
  const { setDragging, draggingPath, showContextMenu, setStatus } = useUIStore()
  const [filter, setFilter] = useState('')

  if (!vaultPath) return null

  const vaultName = vaultPath.split('/').pop() ?? vaultPath

  const handleDrop = async (targetDir: string, e: React.DragEvent) => {
    e.preventDefault()
    const from = draggingPath
    if (!from) return
    const filename = from.split('/').pop()!
    const to = targetDir ? `${targetDir}/${filename}` : filename
    if (to === from) return
    const ok = window.confirm(`Move\n\n${from}\n\n→ ${to}\n\nConfirm?`)
    if (!ok) return
    try {
      setStatus('Moving…')
      await moveFile(from, to)
      setStatus('Moved.')
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    } finally {
      setDragging(null)
    }
  }

  const passesFilter = (entry: VaultFile): boolean => {
    if (!filter) return true
    return entry.path.toLowerCase().includes(filter.toLowerCase())
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-title">
            <img className="brand-logo" src="/img/browsidian.png" alt="" aria-hidden />
            <span>Browsidian</span>
          </div>
          <div className="vault-header">
            <span className="vault-name" title={vaultPath}>{vaultName}</span>
            <div className="vault-actions">
              <button className="icon-btn" onClick={onDisconnect} title="Disconnect">
                ✕ <span style={{ fontSize: 11 }}>Disconnect</span>
              </button>
            </div>
          </div>
        </div>
        <input
          className="search"
          placeholder="Search files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoComplete="off"
        />
        <div className="actions">
          <button className="btn btn-primary" onClick={onNewFile}>＋ New file</button>
          <button className="btn btn-secondary" onClick={onNewFolder}>⊕ New folder</button>
        </div>
      </div>

      <div
        className="tree"
        onDragOver={(e) => { if (draggingPath) e.preventDefault() }}
        onDrop={(e) => handleDrop(selectedDir ?? '', e)}
      >
        {tree.map((item) => (
          <TreeNode
            key={item.path}
            item={item}
            depth={0}
            activeFile={activeFile}
            selectedDir={selectedDir}
            filter={filter}
            passesFilter={passesFilter}
            onOpen={openFile}
            onSelectDir={setSelectedDir}
            onDragStart={(path) => setDragging(path)}
            onDrop={handleDrop}
            onContextMenu={(path, x, y, isDir) => showContextMenu(path, x, y, isDir)}
          />
        ))}
      </div>
    </aside>
  )
}

interface TreeNodeProps {
  item:         VaultFile
  depth:        number
  activeFile:   VaultFile | null
  selectedDir:  string | null
  filter:       string
  passesFilter: (e: VaultFile) => boolean
  onOpen:       (f: VaultFile) => Promise<void>
  onSelectDir:  (dir: string) => void
  onDragStart:  (path: string) => void
  onDrop:       (targetDir: string, e: React.DragEvent) => Promise<void>
  onContextMenu:(path: string, x: number, y: number, isDir: boolean) => void
}

function hasMatch(item: VaultFile, passesFilter: (e: VaultFile) => boolean): boolean {
  if (passesFilter(item)) return true
  if (item.isDir && item.children) return item.children.some((c) => hasMatch(c, passesFilter))
  return false
}

function TreeNode({
  item, depth, activeFile, selectedDir, filter, passesFilter,
  onOpen, onSelectDir, onDragStart, onDrop, onContextMenu,
}: TreeNodeProps) {
  const [open, setOpen] = useState(depth === 0)
  const [dropTarget, setDropTarget] = useState(false)
  const indent = depth * 18

  if (filter && !hasMatch(item, passesFilter)) return null

  if (item.isDir) {
    const isSelected = item.path === (selectedDir ?? '')
    return (
      <div>
        <div
          className={`tree-item${isSelected ? ' selected' : ''}${dropTarget ? ' drop-target' : ''}`}
          data-path={item.path}
          style={{ paddingLeft: 8 + indent }}
          onClick={() => { onSelectDir(item.path) }}
          onDragOver={(e) => { e.preventDefault(); setDropTarget(true) }}
          onDragLeave={() => setDropTarget(false)}
          onDrop={async (e) => { setDropTarget(false); await onDrop(item.path, e) }}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(item.path, e.clientX, e.clientY, true) }}
        >
          <span
            className="icon"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          >
            {open ? '▾' : '▸'}
          </span>
          <span className="name">{item.name}</span>
        </div>
        {open && item.children && (
          <div className="tree-children">
            {item.children.map((child) => (
              <TreeNode
                key={child.path}
                item={child}
                depth={depth + 1}
                activeFile={activeFile}
                selectedDir={selectedDir}
                filter={filter}
                passesFilter={passesFilter}
                onOpen={onOpen}
                onSelectDir={onSelectDir}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (filter && !passesFilter(item)) return null

  const isActive = item.path === activeFile?.path

  return (
    <div>
      <div
        className={`tree-item${isActive ? ' active' : ''}`}
        data-path={item.path}
        style={{ paddingLeft: 8 + indent }}
        draggable
        onClick={() => void onOpen(item)}
        onDragStart={() => onDragStart(item.path)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(item.path, e.clientX, e.clientY, false) }}
        title={item.name}
      >
        <span className="icon" style={{ fontSize: 9 }}>◆</span>
        <span className="name">{item.name.replace(/\.md$/, '')}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: errors only on `ContextMenu.tsx` (old `showContextMenu` call without `isDir`) — fixed in Task 4.

- [ ] **Step 3: Commit Tasks 2 + 3 together**

```bash
git add src/stores/ui.ts src/components/Sidebar/index.tsx
git commit -m "feat: add data-path to sidebar tree items; isDir to context menu state; folder right-click"
```

---

### Task 4: ContextMenu — emit `file-menu`, render plugin-contributed items

**Files:**
- Modify: `src/components/ContextMenu.tsx`

When the context menu opens, create a `Menu` instance, emit `workspace._emit('file-menu', menu, file)` so plugins register their items synchronously, then render those items above the built-in Delete button.

The emit is synchronous — plugins add items immediately in their `file-menu` listener — so computing inline during render is correct (no `useEffect` + state needed).

- [ ] **Step 1: Replace `src/components/ContextMenu.tsx` with the following**

```typescript
import { useEffect } from 'react'
import { useVaultStore } from '@/stores/vault'
import { useUIStore } from '@/stores/ui'
import { obsidianApp } from '@/plugins/loader'
import { Menu, TFile, TFolder } from '@/plugins/shim'

export function ContextMenu() {
  const { tree, deleteFile } = useVaultStore()
  const {
    contextMenuPath, contextMenuPos, contextMenuIsDir,
    hideContextMenu, setStatus,
  } = useUIStore()

  useEffect(() => {
    const close = () => hideContextMenu()
    document.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [hideContextMenu])

  if (!contextMenuPath || !contextMenuPos) return null

  // Collect plugin contributions synchronously — listeners are always sync
  const menu = new Menu()
  const obsFile = contextMenuIsDir
    ? new TFolder(contextMenuPath)
    : new TFile(contextMenuPath)
  obsidianApp.workspace._emit('file-menu', menu, obsFile, 'more-options', null)
  const pluginItems = menu.getItems()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    const path = contextMenuPath
    hideContextMenu()
    const ok = window.confirm(`Delete\n\n${path}\n\nThis cannot be undone. Continue?`)
    if (!ok) return

    function findFile(items: typeof tree): typeof tree[0] | null {
      for (const item of items) {
        if (item.path === path) return item
        if (item.children) {
          const found = findFile(item.children)
          if (found) return found
        }
      }
      return null
    }

    const file = findFile(tree)
    if (!file) return
    try {
      await deleteFile(file)
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    }
  }

  const padding = 8
  const left = Math.min(contextMenuPos.x, window.innerWidth - 200 - padding)
  const top  = Math.min(contextMenuPos.y, window.innerHeight - 120 - padding)

  return (
    <div
      className="context-menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {pluginItems.map((item, i) => (
        <button
          key={i}
          className={`context-item${item.warning ? ' danger' : ''}`}
          disabled={item.disabled}
          onClick={(e) => { hideContextMenu(); item.onClick(e.nativeEvent) }}
        >
          {item.title}
        </button>
      ))}
      <button className="context-item danger" onClick={handleDelete}>
        Delete
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ContextMenu.tsx
git commit -m "feat: emit file-menu workspace event from ContextMenu to support plugin contributions"
```

---

### Task 5: Version bump + README

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Bump Z in `package.json`**

Change `"version": "1.2.85"` → `"version": "1.2.86"`.

(If Z was already bumped by other commits since 1.2.85, use current + 1.)

- [ ] **Step 2: Update `README.md`**

In the plugin compatibility or features section, add a bullet explaining the new support:
- Plugin context menus: `file-menu` workspace event now fires on right-click, enabling plugins like **OA-file-hider** to contribute Hide/Unhide menu items
- Sidebar tree items now carry `data-path` attributes, enabling plugins to locate and manipulate file tree DOM nodes

- [ ] **Step 3: Commit**

```bash
git add package.json README.md
git commit -m "chore: bump to 1.2.86; document file-menu event and data-path sidebar support"
```

---

## Manual Verification

After all tasks are complete:

1. Build and open Browsidian Electron with the personal-vault (vault at `C:\Users\erick\Documents\personal-vault`)
2. Open Plugin Manager → verify OA-file-hider is enabled
3. **Auto-hide on load**: the `logseq` folder (in `data.json` → `hiddenList`) should be absent from the sidebar immediately after vault loads
4. **File context menu**: right-click any `.md` file → "Hide File" item should appear above "Delete"; clicking it hides the file
5. **Folder context menu**: right-click any folder → "Hide Folder" item should appear; clicking it hides the folder
6. **Unhide**: right-click a hidden item's path via settings → OA-file-hider Settings → "Manage" → remove path → item reappears
7. **Toggle visibility**: OA-file-hider Settings → toggle "Hidden File Visibility" → all hidden items toggle visible/invisible

## Known Limitations

- Hidden state is stored as inline `style.display` on wrapper divs. If `refreshTree()` is called (e.g., file watcher detects external changes), React will remount tree nodes and hidden items reappear until the next plugin re-apply (which requires toggling or reloading). This matches existing behavior since the plugin's `onLayoutReady` runs only once.
