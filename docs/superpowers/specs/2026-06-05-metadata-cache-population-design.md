# MetadataCache Population Design Spec

**Date:** 2026-06-05  
**Status:** Approved

---

## Problem

`MetadataCache.getFileCache()` always returns `null`. Dataview's initialization loop (triggered by `metadataCache.on('resolved', ...)`) does:

```ts
for (const file of vault.getMarkdownFiles()) {
  const data = metadataCache.getFileCache(file)  // null
  if (data) await this.reload(file, data)         // skipped every time
}
```

Result: Dataview index stays empty → `FROM #tag` queries return "No results to show".

Affects any Obsidian plugin that relies on `MetadataCache` for file metadata (frontmatter, tags, links).

---

## Goal

Make `MetadataCache` a real cache: read all `.md` files on vault load, parse frontmatter + inline tags + wikilinks, fire `'changed'` per file, fire `'resolved'` only after all files are processed. `getFileCache(file)` returns real data.

---

## Architecture

### Files

| File | Change |
|---|---|
| `src/plugins/shim/metadata-parser.ts` | **New.** `parseFileCache(content, path): CachedMetadata` |
| `src/plugins/shim/index.ts` | `MetadataCache`: add `_cache`, `populate()`, fix `on('resolved')`, fix `getFileCache()` |
| `src/plugins/loader.ts` | Export `metadataCache` + export `populateMetadataCache()` |
| `src/stores/vault.ts` | Call `populateMetadataCache()` after each `refreshTree()` |

No changes to `electron/`, `server.js`, or any component files.

---

## `CachedMetadata` Shape

Dataview consumes these fields. All others are optional stubs.

```ts
interface CachedMetadata {
  frontmatter?: Record<string, any>
  tags?: Array<{ tag: string }>
  links?: Array<{ link: string; original: string }>
}
```

---

## Parser (`metadata-parser.ts`)

`parseFileCache(content: string, path: string): CachedMetadata`

**Step 1 — Frontmatter extraction:**
- Match `^---\n([\s\S]*?)\n---` at start of file
- Parse YAML manually (no external library):
  - `key: value` → string
  - `key: [a, b, c]` → array (inline)
  - `key:\n  - a\n  - b` → array (block)
  - `key: true/false` → boolean
  - `key: 123` → number
- Result goes into `frontmatter`

**Step 2 — Inline tags:**
- Strip frontmatter block from content
- Match `#([A-Za-z][A-Za-z0-9/_-]*)` — must not be preceded by `[` (not inside links)
- Deduplicate; return as `tags: [{ tag: '#word' }, ...]`
- Note: Dataview expects tag with `#` prefix in the `tag` field

**Step 3 — Wikilinks:**
- Match `\[\[([^\]|]+)(?:\|[^\]]+)?\]\]`
- Return as `links: [{ link: 'target', original: '[[target]]' }, ...]`

---

## `MetadataCache` Changes

```ts
class MetadataCache {
  private _cache = new Map<string, CachedMetadata>()
  private _resolvedCallbacks: Array<() => void> = []
  private _resolvedFired = false

  getFileCache(file: TFile): CachedMetadata | null {
    return this._cache.get(file.path) ?? null
  }

  getCache(path: string): CachedMetadata | null {
    return this._cache.get(path) ?? null
  }

  on(event: string, cb: (...args: any[]) => any): { unsubscribe: () => void } {
    // 'resolved': queue until populate() fires it (or fire immediately if already fired)
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
    // other events: use existing _handlers Map (same logic as current implementation)
  }

  _fireResolved(): void {
    if (this._resolvedFired) return
    this._resolvedFired = true
    this._resolvedCallbacks.forEach(cb => { try { cb() } catch {} })
    this._resolvedCallbacks = []
  }

  async populate(files: TFile[], read: (path: string) => Promise<string>): Promise<void> {
    const BATCH = 20
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH)
      await Promise.all(batch.map(async file => {
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

  updateFile(file: TFile, content: string): void {
    const data = parseFileCache(content, file.path)
    this._cache.set(file.path, data)
    this.trigger('changed', file, data)
  }

  deleteFile(file: TFile): void {
    this._cache.delete(file.path)
    this.trigger('delete', file)
  }
}
```

**Timeout safety:** `populate()` is called without awaiting in `vault.ts`. A 30-second `Promise.race` wraps it; if exceeded, fires `'resolved'` anyway and logs a warning.

---

## `loader.ts` Changes

Export `metadataCache` (already the singleton used by `obsidianApp`).

Add:

```ts
export async function populateMetadataCache(): Promise<void> {
  const { adapter } = useVaultStore.getState()
  if (!adapter) {
    metadataCache._fireResolved()  // no vault = fire immediately
    return
  }
  const files = vault.getMarkdownFiles()
  const timeout = new Promise<void>(resolve => setTimeout(() => {
    console.warn('[MetadataCache] populate timeout — firing resolved anyway')
    metadataCache._fireResolved()
    resolve()
  }, 30_000))
  await Promise.race([metadataCache.populate(files, p => adapter.readFile(p)), timeout])
}
```

---

## `vault.ts` Changes

After every call to `refreshTree()` (vault open, reconnect), call:

```ts
import { populateMetadataCache } from '@/plugins/loader'
// ...
await refreshTree()
void populateMetadataCache()  // non-blocking; fires resolved when done
```

Also wire incremental updates — after `adapter.writeFile` / `vault._emit('modify', file)`, call `metadataCache.updateFile(file, content)`. After delete/rename, call `metadataCache.deleteFile` / rename equivalent.

---

## Incremental Updates

| Vault event | MetadataCache action |
|---|---|
| `create(file)` | `updateFile(file, content)` |
| `modify(file)` | `updateFile(file, content)` |
| `delete(file)` | `deleteFile(file)` |
| `rename(file, oldPath)` | `deleteFile({path: oldPath})` + `updateFile(file, newContent)` |

These fire `'changed'` events so live Dataview views refresh.

---

## Error Handling

- File read error during `populate()` → skip file, no crash
- YAML parse error → store `frontmatter: {}` (empty, not null)
- `populate()` timeout (30s) → fire `'resolved'` with partial cache; log warning
- No vault adapter → fire `'resolved'` immediately with empty cache

---

## Verification

1. Open vault with Dataview installed
2. Open `pages/Trees of Knowledge.md`
3. Switch to Visualização tab
4. Dataview table shows real rows (files tagged `#map-of-contents` with non-null `description`)
5. NOT "No results to show for table query."
