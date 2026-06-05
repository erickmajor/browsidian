# MetadataCache Population Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `MetadataCache.getFileCache()` return real data so Dataview `FROM #tag` queries find files instead of returning "No results to show".

**Architecture:** Create a YAML+tags+links parser (`metadata-parser.ts`), wire it into `MetadataCache.populate()` which reads all `.md` files after vault load and fires `'resolved'` only when done. Incremental updates fire `'changed'` on save/delete/rename.

**Tech Stack:** TypeScript, Zustand, Vite (no test runner — verify by running the app).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/plugins/shim/metadata-parser.ts` | **Create** | `parseFileCache(content, path): CachedMetadata` — pure parser |
| `src/plugins/shim/index.ts` | **Modify** lines 293–325 | Replace stub `MetadataCache` with real cache implementation |
| `src/plugins/loader.ts` | **Modify** | Export `metadataCache`; add `populateMetadataCache()` |
| `src/stores/vault.ts` | **Modify** | Call `populateMetadataCache()` after each vault init; incremental updates on save/delete/move/new |
| `package.json` | **Modify** | Bump version (Z) |
| `README.md` | **Modify** | Document Dataview support |

---

## Task 1: Create `parseFileCache` parser

**Files:**
- Create: `src/plugins/shim/metadata-parser.ts`

- [ ] **Step 1: Create the file with full implementation**

```typescript
// src/plugins/shim/metadata-parser.ts

export interface CachedMetadata {
  frontmatter?: Record<string, any>
  tags?: Array<{ tag: string }>
  links?: Array<{ link: string; original: string }>
}

function parseScalar(v: string): any {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  const n = Number(v)
  if (!isNaN(n) && v !== '') return n
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    return v.slice(1, -1)
  return v
}

function parseFrontmatterYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {}
  const lines = yaml.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const keyMatch = line.match(/^([\w][\w-]*)\s*:\s*(.*)$/)
    if (!keyMatch) { i++; continue }
    const [, key, rest] = keyMatch
    const trimmed = rest.trim()

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // Inline array: [a, b, c]
      const inner = trimmed.slice(1, -1)
      result[key] = inner
        ? inner.split(',').map(s => parseScalar(s.trim())).filter(s => s !== '')
        : []
    } else if (trimmed === '') {
      // Block sequence — collect indented `- value` lines
      const items: any[] = []
      i++
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        items.push(parseScalar(lines[i].replace(/^\s+-\s+/, '').trim()))
        i++
      }
      result[key] = items
      continue
    } else {
      result[key] = parseScalar(trimmed)
    }
    i++
  }
  return result
}

export function parseFileCache(content: string, _path: string): CachedMetadata {
  const result: CachedMetadata = {}

  // Step 1: extract frontmatter
  let body = content
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (fmMatch) {
    try {
      result.frontmatter = parseFrontmatterYaml(fmMatch[1])
    } catch {
      result.frontmatter = {}
    }
    body = content.slice(fmMatch[0].length)
  }

  // Step 2: inline tags (body only, skip code blocks, tag must not be inside [[...]])
  const seen = new Set<string>()
  const tags: Array<{ tag: string }> = []

  // Frontmatter `tags:` field → add with # prefix
  const fmTags = result.frontmatter?.tags
  if (fmTags) {
    const arr = Array.isArray(fmTags) ? fmTags : [fmTags]
    for (const t of arr) {
      const s = String(t ?? '').replace(/^#/, '').trim()
      if (s) { const tag = `#${s}`; if (!seen.has(tag)) { seen.add(tag); tags.push({ tag }) } }
    }
  }

  // Inline #tags in body, strip code blocks first
  const noCode = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')

  for (const m of noCode.matchAll(/(?<![[\w])#([A-Za-zÀ-￿][A-Za-z0-9À-￿/_-]*)/g)) {
    const tag = `#${m[1]}`
    if (!seen.has(tag)) { seen.add(tag); tags.push({ tag }) }
  }

  if (tags.length) result.tags = tags

  // Step 3: wikilinks [[target]] or [[target|alias]]
  const links: Array<{ link: string; original: string }> = []
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    links.push({ link: m[1].trim(), original: m[0] })
  }
  if (links.length) result.links = links

  return result
}
```

- [ ] **Step 2: Verify file was created**

```bash
ls src/plugins/shim/metadata-parser.ts
```

Expected: file listed.

- [ ] **Step 3: Commit**

```bash
git add src/plugins/shim/metadata-parser.ts
git commit -m "feat(metadata): add parseFileCache parser for frontmatter, tags, links"
```

---

## Task 2: Replace `MetadataCache` class in `shim/index.ts`

**Files:**
- Modify: `src/plugins/shim/index.ts` (MetadataCache class, currently lines ~293–325)

- [ ] **Step 1: Add import at the very top of `src/plugins/shim/index.ts`**

Add this as the first line of the file (before any `export` statements):

```typescript
import { parseFileCache, type CachedMetadata } from './metadata-parser'
```

- [ ] **Step 2: Replace the entire `MetadataCache` class**

Find this block (the complete `export class MetadataCache { ... }`) and replace it with:

```typescript
export class MetadataCache {
  private _handlers = new Map<string, Set<(...args: any[]) => any>>()
  private _cache    = new Map<string, CachedMetadata>()
  private _resolvedCallbacks: Array<() => void> = []
  private _resolvedFired = false

  // Non-empty so plugins that check Object.keys(resolvedLinks).length > 0 treat cache as ready
  resolvedLinks: Record<string, Record<string, number>> = {}
  unresolvedLinks: Record<string, Record<string, number>> = {}

  getFileCache(file: any): CachedMetadata | null {
    return this._cache.get(file?.path ?? '') ?? null
  }

  getFirstLinkpathDest(_path: string, _from: string): any { return null }

  getCache(path: string): CachedMetadata | null {
    return this._cache.get(path) ?? null
  }

  fileToLinktext(_file: any, _sourcePath: string, _omitMdExtension?: boolean): string { return '' }

  on(event: string, cb: (...args: any[]) => any): { unsubscribe: () => void } {
    if (event === 'resolved') {
      if (this._resolvedFired) {
        Promise.resolve().then(() => { try { cb() } catch {} })
      } else {
        this._resolvedCallbacks.push(cb)
      }
      return { unsubscribe: () => {
        this._resolvedCallbacks = this._resolvedCallbacks.filter(f => f !== cb)
      }}
    }
    if (!this._handlers.has(event)) this._handlers.set(event, new Set())
    this._handlers.get(event)!.add(cb)
    return { unsubscribe: () => this._handlers.get(event)?.delete(cb) }
  }

  off(event: string, cb: (...args: any[]) => any): void {
    this._handlers.get(event)?.delete(cb)
    this._resolvedCallbacks = this._resolvedCallbacks.filter(f => f !== cb)
  }

  trigger(event: string, ...args: any[]): void {
    this._handlers.get(event)?.forEach(cb => { try { cb(...args) } catch {} })
  }

  _fireResolved(): void {
    if (this._resolvedFired) return
    this._resolvedFired = true
    this._resolvedCallbacks.forEach(cb => { try { cb() } catch {} })
    this._resolvedCallbacks = []
  }

  async populate(files: any[], read: (path: string) => Promise<string>): Promise<void> {
    const BATCH = 20
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH)
      await Promise.all(batch.map(async (file: any) => {
        try {
          const content = await read(file.path)
          const data = parseFileCache(content, file.path)
          this._cache.set(file.path, data)
          this.trigger('changed', file, data)
        } catch {
          // skip unreadable files silently
        }
      }))
    }
    this._fireResolved()
  }

  updateFile(file: { path: string }, content: string): void {
    const data = parseFileCache(content, file.path)
    this._cache.set(file.path, data)
    this.trigger('changed', file, data)
  }

  deleteFile(file: { path: string }): void {
    this._cache.delete(file.path)
    this.trigger('delete', file)
  }

  reset(): void {
    this._cache.clear()
    this._resolvedFired = false
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/plugins/shim/index.ts
git commit -m "feat(metadata): implement real MetadataCache with populate, updateFile, deleteFile"
```

---

## Task 3: Export `metadataCache` and add `populateMetadataCache` in `loader.ts`

**Files:**
- Modify: `src/plugins/loader.ts`

- [ ] **Step 1: Export `metadataCache`**

Find this line in `loader.ts` (around line 69):

```typescript
const metadataCache = new MetadataCache()
```

Change it to:

```typescript
export const metadataCache = new MetadataCache()
```

- [ ] **Step 2: Add `populateMetadataCache` export**

Add this function after the `obsidianApp` object definition (after the closing `}` of `obsidianApp`, before the Node.js module shims section). Insert after `(globalThis as any).app = obsidianApp`:

```typescript
export async function populateMetadataCache(): Promise<void> {
  metadataCache.reset()
  const { adapter } = useVaultStore.getState()
  if (!adapter) {
    metadataCache._fireResolved()
    return
  }
  const files = vault.getMarkdownFiles()
  const populate = metadataCache.populate(files, (p: string) => adapter.readFile(p))
  const timeout = new Promise<void>(resolve => setTimeout(() => {
    console.warn('[MetadataCache] populate timeout — firing resolved anyway')
    metadataCache._fireResolved()
    resolve()
  }, 30_000))
  await Promise.race([populate, timeout])
}
```

- [ ] **Step 3: Commit**

```bash
git add src/plugins/loader.ts
git commit -m "feat(metadata): export metadataCache and populateMetadataCache from loader"
```

---

## Task 4: Wire initial population in `vault.ts`

**Files:**
- Modify: `src/stores/vault.ts`

Every vault init mode calls `await get().refreshTree()`. After each one, add the populate call. There are 7 init modes. Do each as written below — do not abbreviate.

- [ ] **Step 1: `initServerMode` — add populate call**

Find in `initServerMode`:
```typescript
    set({ adapter, vaultPath: cfg.vault, isLoading: false })
    await get().refreshTree()
  },
```

Replace with:
```typescript
    set({ adapter, vaultPath: cfg.vault, isLoading: false })
    await get().refreshTree()
    void import('@/plugins/loader').then(m => m.populateMetadataCache())
  },
```

- [ ] **Step 2: `initBrowserMode` — add populate call**

Find:
```typescript
    set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath, mode: 'browser' })
    await get().refreshTree()
  },
```

Replace with:
```typescript
    set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath, mode: 'browser' })
    await get().refreshTree()
    void import('@/plugins/loader').then(m => m.populateMetadataCache())
  },
```

- [ ] **Step 3: `restoreBrowserMode` — add populate call**

Find:
```typescript
    set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath: handle.name, mode: 'browser' })
    await get().refreshTree()
    return true
```

Replace with:
```typescript
    set({ adapter: browserAdapter as unknown as VaultAdapter, vaultPath: handle.name, mode: 'browser' })
    await get().refreshTree()
    void import('@/plugins/loader').then(m => m.populateMetadataCache())
    return true
```

- [ ] **Step 4: `initDemoMode` — add populate call**

Find:
```typescript
    set({ adapter, vaultPath, mode: 'demo' })
    await get().refreshTree()
    const welcomeFile
```

Replace with:
```typescript
    set({ adapter, vaultPath, mode: 'demo' })
    await get().refreshTree()
    void import('@/plugins/loader').then(m => m.populateMetadataCache())
    const welcomeFile
```

- [ ] **Step 5: `initDropboxMode` — add populate call**

Find:
```typescript
    set({ adapter, vaultPath, mode: 'dropbox' })
    await get().refreshTree()
  },
```

Replace with:
```typescript
    set({ adapter, vaultPath, mode: 'dropbox' })
    await get().refreshTree()
    void import('@/plugins/loader').then(m => m.populateMetadataCache())
  },
```

- [ ] **Step 6: `initElectronMode` — add populate call**

Find:
```typescript
    set({ adapter, vaultPath, mode: 'electron' })
    await get().refreshTree()
  },
```

Replace with:
```typescript
    set({ adapter, vaultPath, mode: 'electron' })
    await get().refreshTree()
    void import('@/plugins/loader').then(m => m.populateMetadataCache())
  },
```

- [ ] **Step 7: `restoreElectronMode` — add populate call**

Find:
```typescript
      set({ adapter, vaultPath: saved, mode: 'electron' })
      await get().refreshTree()
      return true
```

Replace with:
```typescript
      set({ adapter, vaultPath: saved, mode: 'electron' })
      await get().refreshTree()
      void import('@/plugins/loader').then(m => m.populateMetadataCache())
      return true
```

- [ ] **Step 8: Commit**

```bash
git add src/stores/vault.ts
git commit -m "feat(metadata): wire populateMetadataCache after vault init in all modes"
```

---

## Task 5: Wire incremental updates in `vault.ts`

**Files:**
- Modify: `src/stores/vault.ts`

- [ ] **Step 1: `saveFile` — update cache after save**

Find the full `saveFile` function body:
```typescript
  async saveFile() {
    const { adapter, activeFile, content } = get()
    if (!adapter || !activeFile) return
    await adapter.writeFile(activeFile.path, content)
    set({ isDirty: false, showPreview: true })
  },
```

Replace with:
```typescript
  async saveFile() {
    const { adapter, activeFile, content } = get()
    if (!adapter || !activeFile) return
    await adapter.writeFile(activeFile.path, content)
    set({ isDirty: false, showPreview: true })
    if (activeFile.name.toLowerCase().endsWith('.md')) {
      void import('@/plugins/loader').then(m => m.metadataCache.updateFile(activeFile, content))
    }
  },
```

- [ ] **Step 2: `newFile` — update cache after create**

Find:
```typescript
    await adapter.writeFile(filePath, '')
    get().invalidateIndex()
    await get().refreshTree()
```

Replace with:
```typescript
    await adapter.writeFile(filePath, '')
    void import('@/plugins/loader').then(m => m.metadataCache.updateFile({ path: filePath }, ''))
    get().invalidateIndex()
    await get().refreshTree()
```

- [ ] **Step 3: `deleteFile` — remove from cache**

Find:
```typescript
  async deleteFile(file) {
    const { adapter, activeFile } = get()
    if (!adapter) return
    await adapter.deleteFile(file.path)
    get().invalidateIndex()
```

Replace with:
```typescript
  async deleteFile(file) {
    const { adapter, activeFile } = get()
    if (!adapter) return
    await adapter.deleteFile(file.path)
    void import('@/plugins/loader').then(m => m.metadataCache.deleteFile(file))
    get().invalidateIndex()
```

- [ ] **Step 4: `moveFile` — delete old path, add new path**

Find:
```typescript
  async moveFile(fromPath, toPath) {
    const { adapter, activeFile } = get()
    if (!adapter || fromPath === toPath) return
    await adapter.renameFile(fromPath, toPath)
    get().invalidateIndex()
```

Replace with:
```typescript
  async moveFile(fromPath, toPath) {
    const { adapter, activeFile } = get()
    if (!adapter || fromPath === toPath) return
    await adapter.renameFile(fromPath, toPath)
    void import('@/plugins/loader').then(async m => {
      m.metadataCache.deleteFile({ path: fromPath })
      if (toPath.toLowerCase().endsWith('.md')) {
        const content = await adapter.readFile(toPath).catch(() => '')
        m.metadataCache.updateFile({ path: toPath }, content)
      }
    })
    get().invalidateIndex()
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/vault.ts
git commit -m "feat(metadata): wire incremental MetadataCache updates on save, create, delete, move"
```

---

## Task 6: Version bump + README + verify

**Files:**
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Bump version Z in `package.json`**

Current version is `1.2.54`. Change to `1.2.55`.

Find `"version": "1.2.54"` → replace with `"version": "1.2.55"`.

- [ ] **Step 2: Update README.md**

Find the line about plugins / community plugins in `README.md`. Add or update a sentence about Dataview support. Find the relevant section (search for "plugin" or "Dataview") and add:

```
Dataview queries (`TABLE`, `LIST`, `TASK`) render correctly in preview. The app builds an internal metadata cache (frontmatter + tags + links) for all vault files on load, enabling `FROM #tag` and `FROM [[link]]` queries to return real results.
```

- [ ] **Step 3: Verify in the browser**

Start the dev server:

```bash
node server.js --vault "C:\Users\erick\Documents\second-brain" --port 5174
```

In a second terminal, start Vite:

```bash
node_modules\.bin\vite.cmd
```

Open `http://localhost:5173` in Chrome/Edge. Wait for vault to load. Open `pages/Trees of Knowledge.md`. Switch to **Visualização** tab.

Expected: Dataview table renders rows of files tagged `#map-of-contents` with their `description` field. Not "No results to show for table query."

If still empty, open browser DevTools → Console tab. Look for:
- `[MetadataCache] populate timeout` → vault too large, increase timeout
- Any `[plugin:dataview]` errors → Dataview runtime issue unrelated to this fix

- [ ] **Step 4: Commit**

```bash
git add package.json README.md
git commit -m "chore: bump version to 1.2.55, document Dataview metadata cache support"
```
