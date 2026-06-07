# Obsidian Ignore Filters Design

## Goal

Honor Obsidian's `userIgnoreFilters` setting (stored in `.obsidian/app.json`) so that files and folders matching those glob patterns are excluded from Browsidian's metadata indexing (wikilink resolution, MetadataCache, graph view) while still appearing in the file tree — identical behavior to Obsidian.

## Scope

Read-only respect of existing Obsidian vault configuration. No UI to edit patterns from within Browsidian.

**In scope:**
- Wikilink `[[]]` resolution (`buildFileIndex`)
- MetadataCache population (`populateMetadataCache`)
- Graph view nodes and edges (`buildGraph`)
- MetadataCache live updates on save/create (`metadataCache.updateFile`)

**Out of scope:**
- Hiding files from the file tree sidebar (Obsidian does not do this)
- Editing `userIgnoreFilters` from within Browsidian
- Reloading patterns on `.obsidian/app.json` changes without reconnect
- Search and backlinks (not yet implemented as features)

## Architecture

### New utility: `src/lib/obsidianConfig.ts`

Two exported functions:

```ts
export async function loadUserIgnorePatterns(
  adapter: VaultAdapter,
  vaultPath: string
): Promise<string[]>
```

Reads `.obsidian/app.json` via `adapter.readFile`, extracts `userIgnoreFilters: string[]`. Returns `[]` on any error (missing file, missing key, malformed JSON, permission denied). Never throws.

```ts
export function isIgnoredByUser(
  relativePath: string,
  patterns: string[]
): boolean
```

Uses `picomatch` (new dependency, ~5 KB, zero deps). Checks `relativePath` against each pattern in two ways:
1. Full path match (e.g., pattern `archive/*` matches `archive/old.md`)
2. Per-segment match (e.g., pattern `private` matches `private/notes.md` — folder exclusion propagates to contents)

Invalid patterns caught per-pattern; logged as `console.warn`, skipped.

```ts
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

### Vault store: `src/stores/vault.ts`

New field `ignoredPatterns: string[]` (default `[]`) in the store interface and initial state.

Each `initXxxMode()` (server, electron, browser, dropbox) calls `loadUserIgnorePatterns(adapter, vaultPath)` after connecting the adapter and calls `set({ ignoredPatterns })`. Demo mode sets `ignoredPatterns: []` directly without attempting to read.

`disconnect()` resets `ignoredPatterns: []` alongside other fields.

`refreshTree()` does **not** reload `ignoredPatterns` — patterns change only on reconnect (YAGNI; `app.json` edits are rare and `.obsidian` is already in the watcher `IGNORED` set so changes won't fire `onTreeChanged`).

### New dependency

`picomatch` — add to `dependencies` in `package.json`. Lightweight, no transitive deps, works in browser and Node.

## Application Points

### 1. `buildFileIndex` (vault.ts:73)

Used for `[[wikilink]]` resolution. Computes relative path per file entry and skips ignored files.

```ts
async function buildFileIndex(
  adapter: VaultAdapter,
  rootPath: string,
  ignoredPatterns: string[]
): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>()
  const walk = async (dir: string) => {
    const entries = await adapter.listFiles(dir)
    for (const e of entries) {
      if (e.isDir) { await walk(e.path); continue }
      if (!e.name.toLowerCase().endsWith('.md')) continue
      const rel = e.path.replace(rootPath, '').replace(/^[/\\]/, '').replace(/\\/g, '/')
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

Call site (vault.ts:434): `buildFileIndex(adapter, vaultPath, ignoredPatterns)` — `ignoredPatterns` read from `get()`.

### 2. `populateMetadataCache` (loader.ts:153)

`TFile.path` from `vault.getMarkdownFiles()` is already a relative forward-slash path (built by `flattenTree` in the Vault shim). Filter before passing to `metadataCache.populate()`:

```ts
const { ignoredPatterns } = useVaultStore.getState()
const allFiles = vault.getMarkdownFiles()
const files = ignoredPatterns.length > 0
  ? allFiles.filter(f => !isIgnoredByUser(f.path, ignoredPatterns))
  : allFiles
await metadataCache.populate(files, (p) => adapter.readFile(p))
```

### 3. `metadataCache.updateFile` guards (vault.ts)

Called in `saveFile` (line 342) and `createFile` (line 360). Guard with ignore check to prevent user-ignored files from entering the cache after initial population:

```ts
const { vaultPath, ignoredPatterns } = get()
const rel = vaultPath
  ? activeFile.path.replace(vaultPath, '').replace(/^[/\\]/, '').replace(/\\/g, '/')
  : activeFile.path
if (!isIgnoredByUser(rel, ignoredPatterns)) {
  void import('@/plugins/loader').then(m => m.metadataCache.updateFile(activeFile, content)).catch(() => {})
}
```

Same guard applies to `createFile` and to the `metadataCache.deleteFile` call in `deleteFile` (no need to delete a file that was never indexed — but calling delete on a missing key is a no-op, so the guard is optional there).

### 4. `buildGraph` (GraphView/buildGraph.ts)

`flattenMdFiles` produces `cachePath` as a relative forward-slash path — already suitable for `isIgnoredByUser`. Add `ignoredPatterns` parameter:

```ts
function flattenMdFiles(
  tree: VaultFile[],
  ignoredPatterns: string[],
  prefix = ''
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

export function buildGraph(
  tree: VaultFile[],
  metadataCache: MetadataCache,
  ignoredPatterns: string[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const fileEntries = flattenMdFiles(tree, ignoredPatterns)
  // ...rest unchanged
}
```

`GraphView/index.tsx` reads `ignoredPatterns` from `useVaultStore` and passes to `buildGraph`.

## Mode Behavior

| Mode | Source | Missing `app.json` |
|---|---|---|
| Server | `adapter.readFile(vaultPath + '/.obsidian/app.json')` | `[]` |
| Electron | Same — adapter reads via IPC | `[]` |
| Browser | Same — FSAA | `[]` |
| Dropbox | Same — proxied via `/api/dropbox` | `[]` |
| Demo | No vault; skip read | `[]` fixed |

## Files Modified

| File | Change |
|---|---|
| `src/lib/obsidianConfig.ts` | New: `loadUserIgnorePatterns`, `isIgnoredByUser` |
| `src/stores/vault.ts` | Add `ignoredPatterns` field; call `loadUserIgnorePatterns` in each `initXxxMode`; update `buildFileIndex` signature; guard `metadataCache.updateFile` calls |
| `src/plugins/loader.ts` | Filter `vault.getMarkdownFiles()` in `populateMetadataCache` |
| `src/components/GraphView/buildGraph.ts` | Add `ignoredPatterns` param to `flattenMdFiles` and `buildGraph` |
| `src/components/GraphView/index.tsx` | Pass `ignoredPatterns` to `buildGraph` |
| `package.json` | Add `picomatch` dependency; bump version |
| `README.md` | Note Obsidian ignore filters are respected |
