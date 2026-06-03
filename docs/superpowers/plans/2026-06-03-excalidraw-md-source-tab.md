# Excalidraw .md Source Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Excalidraw" / "Código" tabs to `.excalidraw.md` files so users can view and edit the raw markdown source, matching the tab behavior of conventional `.md` files.

**Architecture:** Split the existing `isExcalidraw` early-return in `EditorArea` into two cases: `.excalidraw.md` gets tabs (Excalidraw canvas + raw CodeMirror source), pure `.excalidraw` keeps its current tab-free behavior. Two new state vars control the active tab and force-remount ExcalidrawEditor after raw edits. CodeMirror container stays always in the DOM (using `display:none`) to avoid re-initialization on tab switch.

**Tech Stack:** React, TypeScript, CodeMirror 6, `@excalidraw/excalidraw@0.18.1`

---

## File Structure

| File | Change |
|------|--------|
| `src/components/Editor/index.tsx` | Add `useState` import, two new states, reset effect, two tab handlers, restructure `isExcalidraw` block |
| `package.json` | Version bump |

---

### Task 1: Add source tab to `.excalidraw.md` files

**Files:**
- Modify: `src/components/Editor/index.tsx` (lines 1–112)
- Modify: `package.json`

**Context:**

Current `EditorArea` imports at line 1:
```tsx
import { useEffect, useRef } from 'react'
```

Current state destructuring at line 64:
```tsx
const { activeFile, content, isDirty, showPreview, setContent, saveFile, setShowPreview } = useVaultStore()
```

Current `isExcalidraw` block at lines 102–112 (the block to replace):
```tsx
const isExcalidraw = !!activeFile && (
  activeFile.name.endsWith('.excalidraw') ||
  activeFile.name.endsWith('.excalidraw.md')
)
if (isExcalidraw) {
  return (
    <div className="editor-wrap">
      <ExcalidrawEditor />
    </div>
  )
}
```

Current `isMd` definition at line 99:
```tsx
const isMd = activeFile?.name.toLowerCase().endsWith('.md') ?? false
```

- [ ] **Step 1: Add `useState` to the React import**

In `src/components/Editor/index.tsx`, replace line 1:

```tsx
import { useEffect, useRef, useState } from 'react'
```

- [ ] **Step 2: Add `showSource` and `excalidrawMdKey` state variables**

Inside `EditorArea`, after the existing `const viewRef` line (line 66), add:

```tsx
const [showSource,      setShowSource]      = useState(false)
const [excalidrawMdKey, setExcalidrawMdKey] = useState(0)
```

The result around that area should look like:

```tsx
export function EditorArea() {
  const { activeFile, content, isDirty, showPreview, setContent, saveFile, setShowPreview } = useVaultStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef      = useRef<EditorView | null>(null)
  const [showSource,      setShowSource]      = useState(false)
  const [excalidrawMdKey, setExcalidrawMdKey] = useState(0)
```

- [ ] **Step 3: Add reset effect for file change**

After the existing `useEffect(() => { if (!showPreview && viewRef.current) ... }, [showPreview])` block (currently ending around line 90), add:

```tsx
useEffect(() => { setShowSource(false) }, [activeFile?.path])
```

- [ ] **Step 4: Add tab switch handlers**

After the existing `const switchToPreview` line (line 97), add:

```tsx
const switchToExcalidrawTab = () => {
  if (isDirty) void saveFile()
  setExcalidrawMdKey(k => k + 1)
  setShowSource(false)
}
const switchToSourceTab = () => setShowSource(true)
```

- [ ] **Step 5: Replace the `isExcalidraw` block with the split version**

Replace the entire block from `const isExcalidraw` through the closing `}` of its `if` statement (lines 102–112) with:

```tsx
const isExcalidraw = !!activeFile && (
  activeFile.name.endsWith('.excalidraw') ||
  activeFile.name.endsWith('.excalidraw.md')
)

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

- [ ] **Step 6: Bump version in `package.json`**

Read current version. Increment the Z segment by 1 (e.g., `1.2.52` → `1.2.53`).

- [ ] **Step 7: Start dev server and verify tabs appear**

Kill any running Node/Vite processes, then run:

```powershell
# Terminal 1 — file server
node server.js --vault "C:\Users\erick\Documents\second-brain" --port 5174

# Terminal 2 — Vite
npx vite --port 5173
```

Open `http://127.0.0.1:5173`.

Open a `.excalidraw.md` file (e.g., `Drawing 2024-04-15 22.18.25.excalidraw.md`).

Expected:
- Two tabs appear: **Excalidraw** (active, highlighted) and **Código**
- Excalidraw canvas renders normally on the Excalidraw tab

- [ ] **Step 8: Verify Código tab shows raw source**

Click **Código** tab.

Expected:
- CodeMirror editor appears with the raw markdown source (front matter + fenced JSON block)
- Tab label "Código" becomes active (highlighted), "Excalidraw" becomes inactive

- [ ] **Step 9: Verify switching back to Excalidraw tab reloads canvas**

While on the Código tab, type a space anywhere in the editor (makes it dirty).

Click **Excalidraw** tab.

Expected:
- File saves (dirty flag cleared)
- ExcalidrawEditor remounts and shows the canvas (key incremented → fresh load)
- Tab label "Excalidraw" becomes active

- [ ] **Step 10: Verify plain `.excalidraw` files are unaffected**

Open a `.excalidraw` file (e.g., `test-grid-fresh.excalidraw`).

Expected:
- No tabs shown
- Excalidraw canvas renders as before

- [ ] **Step 11: Verify file switch resets to Excalidraw tab**

While on the Código tab of a `.excalidraw.md` file, click a different `.excalidraw.md` file in the tree.

Expected:
- New file opens on the **Excalidraw** tab (not Código) — `showSource` reset to `false`

- [ ] **Step 12: Commit**

```bash
git add src/components/Editor/index.tsx package.json
git commit -m "feat(excalidraw): add Excalidraw/Código tabs to .excalidraw.md files"
```

- [ ] **Step 13: Update README.md**

In `README.md`, find line 39 (the `.excalidraw` feature bullet) and append mention of the source tab:

Replace:
```
`.excalidraw` and `.excalidraw.md` files — Full interactive Excalidraw whiteboard editor (lazy-loaded) with auto-save. Compatible with both raw Excalidraw JSON and the Obsidian Excalidraw plugin wrapper format. Grid is enabled by default (20px); toggle it with the **⊞ Grid** button in the canvas toolbar or `Ctrl+'`.
```

With:
```
`.excalidraw` and `.excalidraw.md` files — Full interactive Excalidraw whiteboard editor (lazy-loaded) with auto-save. Compatible with both raw Excalidraw JSON and the Obsidian Excalidraw plugin wrapper format. Grid is enabled by default (20px); toggle it with the **⊞ Grid** button in the canvas toolbar or `Ctrl+'`. `.excalidraw.md` files show **Excalidraw** / **Código** tabs — switch to Código to view and edit the raw markdown source.
```

- [ ] **Step 14: Commit README**

```bash
git add README.md
git commit -m "docs: document Excalidraw/Código tabs for .excalidraw.md files"
```
