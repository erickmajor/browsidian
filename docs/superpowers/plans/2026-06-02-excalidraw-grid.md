# Excalidraw Grid Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Excalidraw editor show a 20px grid by default while preserving the user's ability to toggle it off via the built-in View menu.

**Architecture:** Spread `{ gridSize: 20 }` as the base of `appState` in `initialData`, then spread the file's saved `appState` on top. The saved value (null when user disabled the grid) overrides the default. Existing autosave already persists `gridSize` because `sanitizeAppState` does not strip it.

**Tech Stack:** React, TypeScript, `@excalidraw/excalidraw@0.18.1`

---

### Task 1: Apply grid default and bump version

**Files:**
- Modify: `src/components/ExcalidrawEditor/index.tsx` (line ~148 — `appState` prop)
- Modify: `package.json` (version `1.2.48` → `1.2.49`)

**Context:**

The `<ExcalidrawLib>` component receives `initialData`. Currently `appState` is passed as `data.appState` directly. Changing it to `{ gridSize: 20, ...data.appState }` sets the grid on for new/empty files while letting any saved `gridSize` (including `null`) take precedence.

`sanitizeAppState` (also in `index.tsx`) removes only volatile runtime fields: `collaborators`, `isLoading`, `isResizing`, `isRotating`, `isTranslating`, `contextMenu`, `openMenu`. It does NOT remove `gridSize`, so the user's toggle preference is already saved by the 1200ms autosave.

The project has no automated test suite. Verification is manual: start dev servers, open a `.excalidraw` file, confirm grid is visible. Toggle it off via View → Grid, reload the file, confirm grid stays off.

The current render block in `src/components/ExcalidrawEditor/index.tsx` (lines 143–157):

```tsx
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={<div className="canvas-error"><span>Carregando Excalidraw…</span></div>}>
        <ExcalidrawLib
          key={activeFile?.path}
          initialData={{
            elements: data.elements as any,
            appState: data.appState as any,
            files:    data.files as any,
          }}
          onChange={onChange as any}
        />
      </Suspense>
    </div>
  )
```

- [ ] **Step 1: Edit `appState` in `initialData`**

In `src/components/ExcalidrawEditor/index.tsx`, change line `appState: data.appState as any,` to:

```tsx
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={<div className="canvas-error"><span>Carregando Excalidraw…</span></div>}>
        <ExcalidrawLib
          key={activeFile?.path}
          initialData={{
            elements: data.elements as any,
            appState: { gridSize: 20, ...data.appState } as any,
            files:    data.files as any,
          }}
          onChange={onChange as any}
        />
      </Suspense>
    </div>
  )
```

No other changes to this file.

- [ ] **Step 2: Bump version in `package.json`**

Change `"version": "1.2.48"` to `"version": "1.2.49"`.

- [ ] **Step 3: Start dev servers and verify grid appears**

Run (two terminals or concurrently):
```bash
node server.js --vault /path/to/any/vault --port 5174
npx vite --port 5173
```

Open `http://localhost:5173`, load a vault, open any `.excalidraw` or `.excalidraw.md` file.

Expected: a light dotted/dashed grid is visible on the canvas background.

- [ ] **Step 4: Verify toggle is persistent**

In the open Excalidraw editor, open the View menu (hamburger icon top-left of the Excalidraw toolbar) and disable the grid. Wait ~2 seconds for autosave. Close and reopen the same file.

Expected: grid remains off (saved preference overrides the 20px default).

- [ ] **Step 5: Commit**

```bash
git add src/components/ExcalidrawEditor/index.tsx package.json
git commit -m "feat(excalidraw): enable 20px grid by default"
```
