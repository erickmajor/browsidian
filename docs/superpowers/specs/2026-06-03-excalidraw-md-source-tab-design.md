# Excalidraw .md Source Tab Design

**Goal:** Add "Excalidraw" / "Código" tabs to `.excalidraw.md` files so users can view and edit the raw markdown source, matching the behavior of conventional markdown files.

---

## Problem

`.excalidraw.md` files are routed through `isExcalidraw` early-return in `EditorArea`, bypassing the tab UI entirely. No "Código" tab is shown. Raw markdown (front matter + JSON block) is inaccessible from the UI.

`.excalidraw` (pure JSON, no `.md`) is unaffected — it has no markdown structure to edit and keeps its current behavior (no tabs).

---

## Approach

Split the `isExcalidraw` early-return into two cases:

- **`.excalidraw.md`** → render tabs "Excalidraw" / "Código" with conditional content
- **`.excalidraw` (no `.md`)** → keep current behavior, no tabs

Two new state variables control the tab:
- `showSource: boolean` — which tab is active (defaults `false` = Excalidraw tab)
- `excalidrawMdKey: number` — incremented when switching Código → Excalidraw to force ExcalidrawEditor remount (so it reloads from the freshly-saved file)

The CodeMirror container (`<div ref={containerRef}>`) is kept in the DOM at all times for `.excalidraw.md` (using `display: none` when on Excalidraw tab), following the same pattern used for regular markdown files.

---

## Implementation

**File changed:** `src/components/Editor/index.tsx` only (plus `package.json` version bump).

### New state (inside `EditorArea`)

```tsx
const [showSource,      setShowSource]      = useState(false)
const [excalidrawMdKey, setExcalidrawMdKey] = useState(0)
```

### Reset on file change

```tsx
useEffect(() => { setShowSource(false) }, [activeFile?.path])
```

### Tab switch handlers

```tsx
const switchToExcalidrawTab = () => {
  if (isDirty) void saveFile()
  setExcalidrawMdKey(k => k + 1)
  setShowSource(false)
}
const switchToSourceTab = () => setShowSource(true)
```

### Restructured `isExcalidraw` block

Replace the current block:

```tsx
if (isExcalidraw) {
  return (
    <div className="editor-wrap">
      <ExcalidrawEditor />
    </div>
  )
}
```

With:

```tsx
if (isExcalidraw && isMd) {
  return (
    <div className="editor-wrap">
      <div className="editor-mode-tabs">
        <button
          className={`editor-mode-tab${!showSource ? ' active' : ''}`}
          onClick={switchToExcalidrawTab}
        >
          Excalidraw
        </button>
        <button
          className={`editor-mode-tab${showSource ? ' active' : ''}`}
          onClick={switchToSourceTab}
        >
          Código
        </button>
      </div>
      <div className="editor-content">
        <div
          className="cm-editor-outer"
          onBlur={handleBlur}
          style={showSource ? undefined : { display: 'none' }}
        >
          <div ref={containerRef} style={{ height: '100%' }} />
        </div>
        {!showSource && <ExcalidrawEditor key={excalidrawMdKey} />}
      </div>
    </div>
  )
}

if (isExcalidraw) {
  return (
    <div className="editor-wrap">
      <ExcalidrawEditor />
    </div>
  )
}
```

---

## Behavior

| Scenario | Result |
|----------|--------|
| Open `.excalidraw.md` | Excalidraw tab active (default), ExcalidrawEditor shown |
| Click "Código" tab | CodeMirror shows raw markdown (front matter + JSON block) |
| Edit raw JSON in Código tab | Content updated in CodeMirror |
| Click "Excalidraw" tab | File saved if dirty, ExcalidrawEditor remounts from saved file |
| Switch to different file | `showSource` resets to `false` (Excalidraw tab) |
| Open `.excalidraw` (no `.md`) | No tabs, ExcalidrawEditor only (unchanged) |

---

## Files modified

| File | Change |
|------|--------|
| `src/components/Editor/index.tsx` | Two new states, reset effect, two tab handlers, restructured `isExcalidraw` block |
| `package.json` | Version bump |
