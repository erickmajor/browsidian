# Excalidraw Editor — Design Spec

**Date:** 2026-06-02  
**Status:** Approved  
**Branch:** electron-support

---

## Goal

Add native support for Excalidraw files (`.excalidraw` and `.excalidraw.md`) in Browsidian — a full interactive editor using the official `@excalidraw/excalidraw` React library, with auto-save and compatibility with the Obsidian Excalidraw plugin format.

---

## Approach

Lazy-load `@excalidraw/excalidraw` (~4MB) via `React.lazy` + dynamic `import()`. The library is only downloaded when the user opens an Excalidraw file, so users who never open one pay no bundle cost. The component provides a complete whiteboard experience (pan, zoom, shapes, text, export) with no custom rendering code.

---

## Architecture

### New component

`src/components/ExcalidrawEditor/index.tsx`

Single file — no sub-components needed. Responsibilities:
- Read file from vault via `VaultAdapter`
- Parse format (JSON or `.md` wrapper)
- Render `<Excalidraw>` with `initialData`
- Debounce `onChange` → write back to vault
- Cancel timer on unmount

### File detection

`src/components/Editor/index.tsx` gains an `isExcalidraw` check **before** the plugin lookup (same pattern as the Canvas Editor branch):

```tsx
const isExcalidraw = !!activeFile && (
  activeFile.name.endsWith('.excalidraw') ||
  activeFile.name.endsWith('.excalidraw.md')
)
if (isExcalidraw) return <div className="editor-wrap"><ExcalidrawEditor /></div>
```

`.endsWith()` is required because `.excalidraw.md` ends in `md` — `split('.').pop()` would give the wrong extension.

### Lazy loading

```tsx
const ExcalidrawLib = React.lazy(() =>
  import('@excalidraw/excalidraw').then(m => ({ default: m.Excalidraw }))
)
```

Wrapped in `<Suspense fallback={<div className="canvas-error"><span>Carregando Excalidraw…</span></div>}>`.

---

## File Format Handling

### `.excalidraw` (JSON)

Load: `JSON.parse(raw)` → extract `{ elements, appState, files }`.  
Save: `JSON.stringify({ type: 'excalidraw', version: 2, source: 'browsidian', elements, appState, files }, null, 2)`.

### `.excalidraw.md` (Obsidian wrapper)

The Obsidian Excalidraw plugin wraps the JSON in a markdown file:

```markdown
---
excalidraw-plugin: parsed
tags: [excalidraw]
---

==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==

%%
# Drawing
```json
{"type":"excalidraw","version":2,"elements":[...],"appState":{...},"files":{}}
```
%%
```

**Parse (load):** regex extracts the JSON from the fenced code block inside `%%`:

```typescript
const match = raw.match(/%%[\s\S]*?```json\s*([\s\S]*?)```[\s\S]*?%%/)
// match[1] = JSON string
```

**Save:** replace only the JSON block, preserve the rest (frontmatter, warning text):

```typescript
raw.replace(
  /(%%[\s\S]*?```json\s*)([\s\S]*?)(```[\s\S]*?%%)/,
  `$1${newJson}$3`
)
```

**New/empty `.excalidraw.md`:** generate a minimal wrapper with frontmatter + `%%` block.

### `sanitizeAppState`

Remove volatile fields that must not be persisted:

```typescript
function sanitizeAppState(appState: Record<string, unknown>): Record<string, unknown> {
  const { collaborators, isLoading, isResizing, isRotating,
          isTranslating, contextMenu, openMenu, ...rest } = appState as any
  return rest
}
```

### Error handling

If `JSON.parse` throws or the regex finds no match, render:
```tsx
<div className="canvas-error"><span>Arquivo Excalidraw inválido ou corrompido.</span></div>
```
Same pattern as `CanvasEditor`.

---

## Data Flow

```
activeFile.path changes
  → component remounts (key={activeFile.path})
  → adapter.readFile(path)
  → parse: JSON | regex extract from .md
  → setData({ elements, appState, files })
  → <ExcalidrawLib initialData={data} onChange={onChange} />

User draws / edits
  → onChange(elements, appState, files) fires
  → pendingRef.current = { elements, appState, files }
  → debounce 1200ms resets
  → on timeout: serialize → adapter.writeFile(path, content)

Component unmounts
  → clearTimeout(timerRef.current)
```

`rawRef` stores the original file content so `.excalidraw.md` saves can preserve the wrapper.

---

## Auto-save

- `AUTOSAVE_MS = 1200` — matches the markdown and canvas editors
- Timer stored in `timerRef` (not state — avoids re-renders)
- Pending data in `pendingRef` (stale-closure-safe)
- Cleanup on unmount via `useEffect(() => () => clearTimeout(timerRef.current), [])`

---

## Files Modified

| Action | File | Change |
|--------|------|--------|
| Create | `src/components/ExcalidrawEditor/index.tsx` | New editor component |
| Modify | `src/components/Editor/index.tsx` | Add `isExcalidraw` branch before plugin lookup |
| Modify | `package.json` | Add `@excalidraw/excalidraw` dep + version bump |
| Modify | `README.md` | Document Excalidraw support |

---

## Out of Scope

- Excalidraw export (PNG/SVG) — the library provides this natively in its toolbar
- Custom theming to match Browsidian dark/light theme — Excalidraw has its own theme toggle
- `.excalidraw.md` text section regeneration (the human-readable markdown above the `%%` block) — preserved as-is on save
- Multi-file embeds (`![[file.excalidraw]]` in markdown) — not addressed here
