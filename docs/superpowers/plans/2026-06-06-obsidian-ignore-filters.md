# Obsidian Ignore Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read `userIgnoreFilters` from `.obsidian/app.json` and exclude matching files from wikilink resolution, MetadataCache, and graph view — while leaving the file tree sidebar unchanged.

**Architecture:** New utility `src/lib/obsidianConfig.ts` exposes `loadUserIgnorePatterns` (reads the vault config) and `isIgnoredByUser` (glob matching via picomatch). Vault store gains `ignoredPatterns: string[]`, populated on every init. Four application points are updated to filter using these patterns.

**Tech Stack:** `picomatch` (glob matching, ~5 KB, zero deps). No new frameworks. No test suite (per CLAUDE.md) — verify manually via app.

---

## File Map

| Action | File | Change |
|---|---|---|
| Create | `src/lib/obsidianConfig.ts` | `loadUserIgnorePatterns`, `isIgnoredByUser` |
| Modify | `src/stores/vault.ts` | `ignoredPatterns` field; load in 7 init funcs; filter `buildFileIndex`; guard `updateFile` calls |
| Modify | `src/plugins/loader.ts` | Filter `vault.getMarkdownFiles()` in `populateMetadataCache` |
| Modify | `src/components/GraphView/buildGraph.ts` | `ignoredPatterns` param on `flattenMdFiles` + `buildGraph` |
| Modify | `src/components/GraphView/index.tsx` | Pass `ignoredPatterns` from store to `buildGraph` |
| Modify | `package.json` | Add `picomatch`; bump version Z |
| Modify | `README.md` | Note ignore filters |

---

## Task 1: Install picomatch and create `src/lib/obsidianConfig.ts`

**Files:**
- Run: `npm install picomatch`
- Create: `src/lib/obsidianConfig.ts`
- Modify: `package.json` (npm install updates it automatically)

- [ ] **Step 1: Install picomatch**

```bash
npm install picomatch
npm install --save-dev @types/picomatch
```

Expected: `package.json` now has `"picomatch"` in `dependencies` and `"@types/picomatch"` in `devDependencies`.

- [ ] **Step 2: Create `src/lib/obsidianConfig.ts`**

```typescript
import picomatch from 'picomatch'
import type { VaultAdapter } from '@/adapters'

export async function loadUserIgnorePatterns(
  adapter: VaultAdapter,
  vaultPath: string
): Promise<string[]> {
  try {
    const raw = await adapter.readFile(`${vaultPath}/.obsidian/app.json`)
    const config = JSON.parse(raw) as Record<string, unknown>
    return Array.isArray(config.userIgnoreFilters)
      ? (config.userIgnoreFilters as unknown[]).filter((p): p is string => typeof p === 'string')
      : []
  } catch {
    return []
  }
}

export function isIgnoredByUser(relativePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false
  const normalized = relativePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return patterns.some((pattern) => {
    try {
      const isMatch = picomatch(pattern, { dot: true })
      return isMatch(normalized) || parts.some((part) => isMatch(part))
    } catch {
      console.warn('[obsidianConfig] invalid ignore pattern:', pattern)
      return false
    }
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new file.

- [ ] **Step 4: Commit**

```bash
git add src/lib/obsidianConfig.ts package.json package-lock.json
git commit -m "feat: add obsidianConfig utility for userIgnoreFilters"
```

---

## Task 2: Add `ignoredPatterns` to vault store interface and state

**Files:**
- Modify: `src/stores/vault.ts` (lines 95–154 for interface + initial state; line 292–306 for `disconnect`)

- [ ] **Step 1: Add field to `VaultStore` interface**

In `src/stores/vault.ts`, the `VaultStore` interface starts at line 95. Add `ignoredPatterns` after `fileIndex`:

```typescript
// Before (line 106):
fileIndex:  Map<string, string[]> | null

// After:
fileIndex:        Map<string, string[]> | null
ignoredPatterns:  string[]
```

- [ ] **Step 2: Add to initial state**

In the `create<VaultStore>` call initial state (around line 151), add after `fileIndex: null`:

```typescript
fileIndex:        null,
ignoredPatterns:  [],
```

- [ ] **Step 3: Reset in `disconnect()`**

In `disconnect()` (around line 300–305), the `set({...})` call currently has:

```typescript
set({
  mode: 'server', adapter: null, vaultPath: null,
  tree: [], activeFile: null, content: '',
  isDirty: false, showPreview: true, selectedDir: null, fileIndex: null,
  _watcher: null,
})
```

Add `ignoredPatterns: []` to that object:

```typescript
set({
  mode: 'server', adapter: null, vaultPath: null,
  tree: [], activeFile: null, content: '',
  isDirty: false, showPreview: true, selectedDir: null, fileIndex: null,
  _watcher: null,
  ignoredPatterns: [],
})
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/stores/vault.ts
git commit -m "feat: add ignoredPatterns field to vault store"
```

---

## Task 3: Load patterns in all init and restore functions

**Files:**
- Modify: `src/stores/vault.ts` (7 init/restore functions)

The pattern for each function that has a real vault adapter: call `loadUserIgnorePatterns(adapter, vaultPath)` and `set({ ignoredPatterns })` **before** calling `populateMetadataCache()`. Demo mode sets `[]` directly without calling the loader.

- [ ] **Step 1: Add import at top of `src/stores/vault.ts`**

After the existing imports (around line 9), add:

```typescript
import { loadUserIgnorePatterns } from '@/lib/obsidianConfig'
```

- [ ] **Step 2: Update `initServerMode` (around line 157)**

Current end of function:
```typescript
set({ adapter, vaultPath: cfg.vault, isLoading: false })
await get().refreshTree()
_attachWatcher('server', adapter, cfg.vault, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

Replace with:
```typescript
set({ adapter, vaultPath: cfg.vault, isLoading: false })
await get().refreshTree()
const ignoredPatterns = await loadUserIgnorePatterns(adapter, cfg.vault)
set({ ignoredPatterns })
_attachWatcher('server', adapter, cfg.vault, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

- [ ] **Step 3: Update `initBrowserMode` (around line 200)**

Current end of function:
```typescript
set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath, mode: 'browser' })
await get().refreshTree()
_attachWatcher('browser', browserAdapter as unknown as VaultAdapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

Replace with:
```typescript
set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath, mode: 'browser' })
await get().refreshTree()
const ignoredPatterns = await loadUserIgnorePatterns(browserAdapter as unknown as VaultAdapter, vaultPath)
set({ ignoredPatterns })
_attachWatcher('browser', browserAdapter as unknown as VaultAdapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

- [ ] **Step 4: Update `restoreBrowserMode` (around line 226)**

Current end of function (before `return true`):
```typescript
set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath: handle.name, mode: 'browser' })
await get().refreshTree()
_attachWatcher('browser', browserAdapter as unknown as VaultAdapter, handle.name, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
return true
```

Replace with:
```typescript
set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath: handle.name, mode: 'browser' })
await get().refreshTree()
const ignoredPatterns = await loadUserIgnorePatterns(browserAdapter as unknown as VaultAdapter, handle.name)
set({ ignoredPatterns })
_attachWatcher('browser', browserAdapter as unknown as VaultAdapter, handle.name, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
return true
```

- [ ] **Step 5: Update `initDemoMode` (around line 234)**

Current end of function:
```typescript
set({ adapter, vaultPath, mode: 'demo' })
await get().refreshTree()
_attachWatcher('demo', adapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

Replace with (no `loadUserIgnorePatterns` call — demo has no real `.obsidian/`):
```typescript
set({ adapter, vaultPath, mode: 'demo', ignoredPatterns: [] })
await get().refreshTree()
_attachWatcher('demo', adapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

- [ ] **Step 6: Update `initDropboxMode` (around line 245)**

Current end of function:
```typescript
set({ adapter, vaultPath, mode: 'dropbox' })
await get().refreshTree()
_attachWatcher('dropbox', adapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

Replace with:
```typescript
set({ adapter, vaultPath, mode: 'dropbox' })
await get().refreshTree()
const ignoredPatterns = await loadUserIgnorePatterns(adapter, vaultPath)
set({ ignoredPatterns })
_attachWatcher('dropbox', adapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

- [ ] **Step 7: Update `initElectronMode` (around line 254)**

Current end of function:
```typescript
set({ adapter, vaultPath, mode: 'electron' })
await get().refreshTree()
_attachWatcher('electron', adapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

Replace with:
```typescript
set({ adapter, vaultPath, mode: 'electron' })
await get().refreshTree()
const ignoredPatterns = await loadUserIgnorePatterns(adapter, vaultPath)
set({ ignoredPatterns })
_attachWatcher('electron', adapter, vaultPath, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
```

- [ ] **Step 8: Update `restoreElectronMode` (around line 267)**

Inside the `try` block, current code:
```typescript
set({ adapter, vaultPath: saved, mode: 'electron' })
await get().refreshTree()
_attachWatcher('electron', adapter, saved, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
return true
```

Replace with:
```typescript
set({ adapter, vaultPath: saved, mode: 'electron' })
await get().refreshTree()
const ignoredPatterns = await loadUserIgnorePatterns(adapter, saved)
set({ ignoredPatterns })
_attachWatcher('electron', adapter, saved, get, set)
void import('@/plugins/loader').then(m => m.populateMetadataCache()).catch(e => console.error('[MetadataCache] populate failed', e))
return true
```

- [ ] **Step 9: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/stores/vault.ts
git commit -m "feat: load Obsidian userIgnoreFilters on vault init"
```

---

## Task 4: Filter `buildFileIndex` (wikilink resolution)

**Files:**
- Modify: `src/stores/vault.ts` (function `buildFileIndex` at line 73; call site at line 434)

- [ ] **Step 1: Add import of `isIgnoredByUser`**

The import from Task 3 Step 1 already covers `loadUserIgnorePatterns`. Extend it to also import `isIgnoredByUser`:

```typescript
import { loadUserIgnorePatterns, isIgnoredByUser } from '@/lib/obsidianConfig'
```

- [ ] **Step 2: Update `buildFileIndex` signature and body**

Current `buildFileIndex` (line 73–91):
```typescript
async function buildFileIndex(
  adapter: VaultAdapter,
  rootPath: string
): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>()
  const walk = async (dir: string) => {
    const entries = await adapter.listFiles(dir)
    for (const e of entries) {
      if (e.isDir) { await walk(e.path); continue }
      if (!e.name.toLowerCase().endsWith('.md')) continue
      const key = e.name.toLowerCase().replace(/\.md$/, '')
      const existing = index.get(key)
      if (existing) existing.push(e.path)
      else index.set(key, [e.path])
    }
  }
  await walk(rootPath)
  return index
}
```

Replace entirely with:
```typescript
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
```

- [ ] **Step 3: Update the call site**

The call site is around line 434 (inside `resolveWikilink`):

```typescript
// Before:
fileIndex = await buildFileIndex(adapter, vaultPath)

// After:
fileIndex = await buildFileIndex(adapter, vaultPath, get().ignoredPatterns)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/stores/vault.ts
git commit -m "feat: filter ignored paths from wikilink file index"
```

---

## Task 5: Filter `populateMetadataCache` and guard `updateFile` calls

**Files:**
- Modify: `src/plugins/loader.ts` (function `populateMetadataCache` at line 153)
- Modify: `src/stores/vault.ts` (`saveFile` around line 334; `newFile` around line 351)

- [ ] **Step 1: Update `populateMetadataCache` in `src/plugins/loader.ts`**

Add import at top of `src/plugins/loader.ts`:
```typescript
import { isIgnoredByUser } from '@/lib/obsidianConfig'
```

Current body of `populateMetadataCache` (lines 153–176):
```typescript
export async function populateMetadataCache(): Promise<void> {
  metadataCache.reset()
  const { adapter } = useVaultStore.getState()
  if (!adapter) {
    metadataCache._fireResolved()
    return
  }
  const files = vault.getMarkdownFiles()
  if (files.length === 0) {
    console.warn('[MetadataCache] no markdown files found — vault tree may not be ready')
    metadataCache._fireResolved()
    return
  }
  let timerId: ReturnType<typeof setTimeout>
  const timeout = new Promise<void>(resolve => {
    timerId = setTimeout(() => {
      console.warn('[MetadataCache] populate timeout — firing resolved anyway')
      metadataCache._fireResolved()
      resolve()
    }, 30_000)
  })
  await Promise.race([metadataCache.populate(files, (p: string) => adapter.readFile(p)), timeout])
  clearTimeout(timerId!)
}
```

Replace with:
```typescript
export async function populateMetadataCache(): Promise<void> {
  metadataCache.reset()
  const { adapter, ignoredPatterns } = useVaultStore.getState()
  if (!adapter) {
    metadataCache._fireResolved()
    return
  }
  const allFiles = vault.getMarkdownFiles()
  const files = ignoredPatterns.length > 0
    ? allFiles.filter(f => !isIgnoredByUser(f.path, ignoredPatterns))
    : allFiles
  if (files.length === 0) {
    console.warn('[MetadataCache] no markdown files found — vault tree may not be ready')
    metadataCache._fireResolved()
    return
  }
  let timerId: ReturnType<typeof setTimeout>
  const timeout = new Promise<void>(resolve => {
    timerId = setTimeout(() => {
      console.warn('[MetadataCache] populate timeout — firing resolved anyway')
      metadataCache._fireResolved()
      resolve()
    }, 30_000)
  })
  await Promise.race([metadataCache.populate(files, (p: string) => adapter.readFile(p)), timeout])
  clearTimeout(timerId!)
}
```

- [ ] **Step 2: Guard `metadataCache.updateFile` in `saveFile`**

In `src/stores/vault.ts`, `saveFile` around line 341:

```typescript
// Before:
if (activeFile.name.toLowerCase().endsWith('.md')) {
  void import('@/plugins/loader').then(m => m.metadataCache.updateFile(activeFile, content)).catch(() => {})
}
```

Replace with:
```typescript
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
```

- [ ] **Step 3: Guard `metadataCache.updateFile` in `newFile`**

In `src/stores/vault.ts`, `newFile` around line 360:

```typescript
// Before:
void import('@/plugins/loader').then(m => m.metadataCache.updateFile({ path: filePath }, '')).catch(() => {})
```

Replace with:
```typescript
const { vaultPath: vp, ignoredPatterns: ip } = get()
const normRoot2 = vp ? vp.replace(/[/\\]+$/, '') : ''
const relPath = normRoot2
  ? filePath.replace(normRoot2, '').replace(/^[/\\]+/, '').replace(/\\/g, '/')
  : filePath
if (!isIgnoredByUser(relPath, ip)) {
  void import('@/plugins/loader').then(m => m.metadataCache.updateFile({ path: filePath }, '')).catch(() => {})
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/loader.ts src/stores/vault.ts
git commit -m "feat: filter ignored paths from MetadataCache"
```

---

## Task 6: Filter graph view + bump version + update README

**Files:**
- Modify: `src/components/GraphView/buildGraph.ts`
- Modify: `src/components/GraphView/index.tsx`
- Modify: `package.json` (bump version Z)
- Modify: `README.md`

- [ ] **Step 1: Update `src/components/GraphView/buildGraph.ts`**

Add import at top:
```typescript
import { isIgnoredByUser } from '@/lib/obsidianConfig'
```

Replace `flattenMdFiles` (lines 18–29):
```typescript
// Before:
function flattenMdFiles(
  tree: VaultFile[],
  prefix = '',
): Array<{ file: VaultFile; cachePath: string }> {
  const out: Array<{ file: VaultFile; cachePath: string }> = []
  for (const f of tree) {
    const rel = prefix ? `${prefix}/${f.name}` : f.name
    if (f.isDir) out.push(...flattenMdFiles(f.children ?? [], rel))
    else if (f.name.toLowerCase().endsWith('.md')) out.push({ file: f, cachePath: rel })
  }
  return out
}
```

```typescript
// After:
function flattenMdFiles(
  tree: VaultFile[],
  ignoredPatterns: string[],
  prefix = '',
): Array<{ file: VaultFile; cachePath: string }> {
  const out: Array<{ file: VaultFile; cachePath: string }> = []
  for (const f of tree) {
    const rel = prefix ? `${prefix}/${f.name}` : f.name
    if (f.isDir) out.push(...flattenMdFiles(f.children ?? [], ignoredPatterns, rel))
    else if (f.name.toLowerCase().endsWith('.md')) {
      if (!isIgnoredByUser(rel, ignoredPatterns)) out.push({ file: f, cachePath: rel })
    }
  }
  return out
}
```

Replace `buildGraph` signature and first line (lines 31–35):
```typescript
// Before:
export function buildGraph(
  tree: VaultFile[],
  metadataCache: MetadataCache,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const fileEntries = flattenMdFiles(tree)
```

```typescript
// After:
export function buildGraph(
  tree: VaultFile[],
  metadataCache: MetadataCache,
  ignoredPatterns: string[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const fileEntries = flattenMdFiles(tree, ignoredPatterns)
```

Everything else in `buildGraph` stays unchanged.

- [ ] **Step 2: Update `src/components/GraphView/index.tsx` to pass `ignoredPatterns`**

After `openFile` on line 111, add one more selector:

```typescript
// Before (lines 110–111):
const tree     = useVaultStore(s => s.tree)
const openFile = useVaultStore(s => s.openFile)

// After:
const tree            = useVaultStore(s => s.tree)
const openFile        = useVaultStore(s => s.openFile)
const ignoredPatterns = useVaultStore(s => s.ignoredPatterns)
```

Update the `buildGraph` call (line 137):
```typescript
// Before:
const graphData = buildGraph(tree, metadataCache)

// After:
const graphData = buildGraph(tree, metadataCache, ignoredPatterns)
```

- [ ] **Step 3: Bump version in `package.json`**

Current version is `1.2.77`. Increment Z:
```json
"version": "1.2.78",
```

- [ ] **Step 4: Update `README.md`**

In the Features section (or wherever file watching was noted), add a bullet:
```
- **Obsidian ignore filters:** Patterns configured in `.obsidian/app.json` (`userIgnoreFilters`) are respected — matching files are excluded from wikilink resolution, graph view, and MetadataCache while still appearing in the file tree.
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Manual verification**

1. In your Obsidian vault, open `.obsidian/app.json` and add (or verify) a pattern like:
   ```json
   "userIgnoreFilters": ["private"]
   ```
2. Create a folder `private/` with a note `private/secret.md` that contains `[[public]]`.
3. Open Browsidian with that vault.
4. **File tree:** `private/secret.md` still appears in sidebar. ✓
5. **Wikilink resolution:** Create `public.md` that links `[[secret]]` — it should NOT resolve (secret.md is ignored). ✓
6. **Graph view:** Open graph — `private/secret.md` should NOT appear as a node. ✓

- [ ] **Step 7: Commit**

```bash
git add src/components/GraphView/buildGraph.ts src/components/GraphView/index.tsx package.json README.md
git commit -m "feat: filter Obsidian userIgnoreFilters from graph view; bump version"
```
