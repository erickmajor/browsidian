# Plugin System Design

**Date:** 2026-05-23  
**Status:** Approved  
**Approach:** Obsidian module shim + direct execution (Approach A)

---

## Goal

Run real Obsidian community plugins inside Browsidian — both Electron and Web — with maximum compatibility and graceful degradation.

---

## Architecture

```
src/plugins/
├── shim/
│   ├── index.ts          ← synthetic `obsidian` module (all exports)
│   ├── Plugin.ts         ← Plugin base class
│   ├── Component.ts      ← Component base class (lifecycle, event tracking)
│   ├── Vault.ts          ← delegates to useVaultStore adapter
│   ├── Workspace.ts      ← manages leaves/views, delegates to UIStore
│   ├── components.ts     ← Notice, Modal, Setting, PluginSettingTab
│   └── types.ts          ← TFile, TFolder, TAbstractFile, Platform, etc.
├── loader.ts             ← discovers, executes, manages plugin lifecycle
├── registry.ts           ← fetches obsidian-releases, downloads, installs
└── store.ts              ← Zustand: loaded[], enabled[], errors{}, installing{}

src/components/PluginManager/
├── index.tsx             ← modal wrapper + Installed/Community tabs
├── InstalledTab.tsx      ← list, toggle enable/disable, uninstall
├── CommunityTab.tsx      ← fetch list, search, install
└── PluginCard.tsx        ← reusable card (both tabs)
```

---

## Plugin Discovery

Plugins live at `.obsidian/plugins/<id>/` inside the vault, matching the Obsidian convention.

Boot sequence:
1. App initializes → VaultAdapter ready
2. `loader.ts` scans `.obsidian/plugins/*/manifest.json`
3. Reads enabled list from `.obsidian/community-plugins.json`
4. For each enabled plugin: reads `main.js`, executes with shim injected
5. Calls `plugin.onload()`

---

## Plugin Execution

### Execution wrapper (both Electron and Web)

```typescript
const fakeRequire = (mod: string) => {
  if (mod === 'obsidian') return obsidianShim
  if (mod === 'electron') return { remote: null } // stub
  if (mod === 'fs' || mod === 'path') {
    throw new Error(`[plugin:${id}] require('${mod}') not available in web mode`)
  }
  throw new Error(`[plugin:${id}] require('${mod}') not supported`)
}

const mod = { exports: {} as any }
const fn = new Function('module', 'exports', 'require', code)
fn(mod, mod.exports, fakeRequire)

const PluginClass = mod.exports.default ?? mod.exports
const instance = new PluginClass(app, manifest)
await instance.load()
```

**Electron** additionally provides `__dirname` and `__filename` as 4th/5th arguments for plugins that reference them.

Each plugin executes inside `try/catch` — a crash never affects other plugins or the app.

### `app` singleton

```typescript
const app: App = {
  vault: new Vault(),
  workspace: new Workspace(),
  metadataCache: new MetadataCache(),
  plugins: { getPlugin: (id) => loadedPlugins.get(id)?.instance ?? null },
  commands: commandRegistry,
  keymap: keymapStub,
}
```

Singleton created before the first plugin loads, passed to every plugin constructor.

---

## Obsidian Shim — API Surface

### Tier 1 — Plugin loads and initializes (Day 1)

| API | Notes |
|-----|-------|
| `Component` | `registerEvent`, `registerInterval`, `addChild`, `load`, `unload` |
| `Plugin` | Extends Component: `addCommand`, `addSettingTab`, `loadData`, `saveData`, `registerDomEvent` |
| `App` | Root object: `vault`, `workspace`, `metadataCache`, `commands`, `plugins` |
| `TFile / TFolder / TAbstractFile` | Simple value objects: `path`, `name`, `extension`, `stat` |
| `Notice` | `new Notice(msg, timeout?)` → delegates to `useUIStore.addToast()` |

### Tier 2 — Core functionality (Week 1)

| API | Delegation |
|-----|-----------|
| `Vault` | Delegates to `useVaultStore.getState().adapter`: `read`, `write`, `create`, `delete`, `rename`, `getFiles`, `getMarkdownFiles`, `getAbstractFileByPath`, `on`/`off` events |
| `Vault.adapter` | Exposes `basePath`, `exists`, `read`, `write`, `mkdir`, `list`, `stat`. In Web: `basePath` returns `''` |
| `Workspace` | `getLeaf`, `getActiveViewOfType`, `getLeavesOfType`, `activeLeaf`, `getActiveFile`, `on`/`off` |
| `WorkspaceLeaf` | `view`, `open`, `setViewState` |
| `MarkdownView` | `editor`, `file`, `getMode()` — proxies current CodeMirror instance |
| `Editor` | CodeMirror 6 proxy: `getValue`, `setValue`, `getLine`, `setCursor`, `getCursor`, `replaceRange`, `getSelection`, `replaceSelection` |
| `Modal` | `open`/`close` → creates `<dialog>` in DOM; `contentEl`, `onOpen`, `onClose` |
| `Setting` | Fluent builder: `setName`, `setDesc`, `addText`, `addToggle`, `addDropdown`, `addButton`, `addTextArea` |
| `PluginSettingTab` | `containerEl`, `display()`, `hide()` |

### Tier 3 — Rich UI (Month 1)

`SuggestModal<T>`, `FuzzySuggestModal<T>`, `Menu` / `MenuItem`, `MetadataCache`, `MarkdownRenderer.render()`, `ItemView`, `FileView`

### Tier 4 — Specialized (ongoing, on-demand)

`Keymap`, `Modifier`, custom leaf types, `editorCallback`, advanced workspace manipulation

### Utility functions (all Tier 1)

```typescript
export const moment                                          // re-export
export function normalizePath(path: string): string
export function setIcon(el: HTMLElement, icon: string): void
export function debounce<T>(fn: T, timeout: number, immediate?: boolean): T
export function parseFrontMatterEntry(cache, key): unknown
export function parseFrontMatterTags(cache): string[]
export function sanitizeHTMLToDom(html: string): DocumentFragment
```

### `Platform` stub

```typescript
export const Platform = {
  isDesktop: true,
  isMobile: false,
  isElectron: typeof __IS_ELECTRON__ !== 'undefined' && __IS_ELECTRON__,
  isMacOS: navigator.platform.startsWith('Mac'),
  isWin: navigator.platform.startsWith('Win'),
  isLinux: navigator.platform.startsWith('Linux'),
}
```

---

## Plugin Lifecycle

```typescript
interface LoadedPlugin {
  id: string
  manifest: PluginManifest
  instance: Plugin
  error?: string
}

async function loadPlugin(id: string): Promise<LoadedPlugin>
async function unloadPlugin(id: string): Promise<void>   // triggers onunload(), cancels all registered events/intervals
async function reloadPlugin(id: string): Promise<void>   // unload + load
function getLoadedPlugins(): LoadedPlugin[]
```

`Component` tracks all registered events and intervals internally (`EventRef[]`). `unload()` cancels all of them automatically — plugins don't need to clean up manually.

---

## Community Browser UI

### Data sources

```
Plugin list (cached per session):
  https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json
  → [{ id, name, author, description, repo }, ...]  (~1800 plugins)

Install flow:
  1. GET https://api.github.com/repos/{repo}/releases/latest → tag_name
  2. Download main.js, manifest.json, styles.css from release assets
  3. Save to .obsidian/plugins/{id}/ via VaultAdapter
  4. Append id to .obsidian/community-plugins.json
  5. Call loadPlugin(id)
```

CORS: `raw.githubusercontent.com` and `api.github.com` work from the browser without a proxy. Community plugin installation available in both Electron and Web.

### Access point

New puzzle-piece icon button in `StatusBar` → opens `<PluginManager>` as full-screen modal.

### Plugin Manager layout

Two tabs: **Installed** and **Community**.

- **Installed tab**: lists all plugins in `.obsidian/plugins/`, toggle enable/disable, uninstall button, error badge if load failed
- **Community tab**: search box, virtual scroll list (~1800 items), Install button per card, lazy-fetched on first open

### Plugin card states

| State | Action |
|-------|--------|
| Not installed | `Install` button |
| Installing | `Installing…` spinner |
| Installed + enabled | Toggle ON → disables |
| Installed + disabled | Toggle OFF → enables; `Uninstall` button |
| Load error | Red `Error` badge + error message |
| Requires Electron | `⚠ Requires Electron` badge (detected via regex on source before execution) |

---

## Web Compatibility

### What works in the browser

Plugins using only:
- `Vault` read/write/list
- `Notice`, `Modal`, `Setting`, `PluginSettingTab`
- `Workspace.getActiveFile()`, `Editor`
- `MetadataCache` frontmatter parsing
- `registerEvent`, `addCommand`, DOM manipulation
- Standard Web APIs (`fetch`, `localStorage`, etc.)

Likely compatible: Calendar, Kanban, Word Count, Advanced Tables, Tasks, Obsidian Git (partial).

### What doesn't work in the browser

| Failure | Cause | Behavior |
|---------|-------|----------|
| `require('fs')` | Node.js only | Descriptive error, plugin disabled |
| `require('path')` | Node.js only | Same |
| `app.vault.adapter.basePath` | Empty string in browser | Plugins concatenating with basePath break |
| `process.env`, `process.platform` | Node.js only | Minimal stub: `{ env: {}, platform: 'browser' }` |
| `require('electron')` | Electron only | Empty stub with warning |

Detection: before executing, scan `main.js` source with a simple regex for `require('fs')`, `require('electron')` etc. → set `⚠ Requires Electron` badge proactively without actually running the plugin.

---

## Files Changed / Created

| File | Action |
|------|--------|
| `src/plugins/shim/index.ts` | Create |
| `src/plugins/shim/Plugin.ts` | Create |
| `src/plugins/shim/Component.ts` | Create |
| `src/plugins/shim/Vault.ts` | Create |
| `src/plugins/shim/Workspace.ts` | Create |
| `src/plugins/shim/components.ts` | Create |
| `src/plugins/shim/types.ts` | Create |
| `src/plugins/loader.ts` | Create |
| `src/plugins/registry.ts` | Create |
| `src/plugins/store.ts` | Create |
| `src/components/PluginManager/index.tsx` | Create |
| `src/components/PluginManager/InstalledTab.tsx` | Create |
| `src/components/PluginManager/CommunityTab.tsx` | Create |
| `src/components/PluginManager/PluginCard.tsx` | Create |
| `src/components/StatusBar.tsx` | Modify (add plugin manager button) |
| `src/App.tsx` | Modify (mount PluginManager, init plugins after vault ready) |
| `electron/main.ts` | Already has `plugin:load` — extend if needed |
