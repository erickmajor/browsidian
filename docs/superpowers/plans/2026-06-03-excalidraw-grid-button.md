# Excalidraw Grid Toggle Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visual "⊞ Grid" toggle button inside the Excalidraw canvas toolbar so users can enable/disable the grid without keyboard shortcuts (required for Electron where `Ctrl+'` doesn't fire).

**Architecture:** Use Excalidraw's `renderTopRightUI` prop to inject a button into the canvas toolbar area. The prop callback receives the current `appState` (including `gridModeEnabled`), so no extra React state is needed. An `excalidrawAPIRef` holds the API object obtained via the `excalidrawAPI` prop; the button's `onClick` calls `excalidrawAPIRef.current.updateScene()` to toggle. The existing 1200ms autosave already serializes `gridModeEnabled` via `onChange`.

**Tech Stack:** React, TypeScript, `@excalidraw/excalidraw@0.18.1`

---

### Task 1: Add excalidrawAPIRef and grid toggle button

**Files:**
- Modify: `src/components/ExcalidrawEditor/index.tsx` (lines 79–158)
- Modify: `package.json` (version bump `1.2.50` → `1.2.51`)

**Context:**

The component currently renders `<ExcalidrawLib>` with three props: `key`, `initialData`, `onChange`. Two new props are added:
- `excalidrawAPI`: callback `(api: any) => void` — stores the Excalidraw API object in a ref
- `renderTopRightUI`: callback `(_isMobile: boolean, appState: any) => JSX` — renders the toggle button

The `excalidrawAPIRef` ref must be defined alongside the other refs (lines 79–84). It does NOT need a `useEffect` sync — it's write-once on mount.

The button uses Excalidraw's own CSS variables:
- `--color-primary` (active/ON state background)
- `--button-gray-1` (inactive/OFF state background)

These variables are already available because `import '@excalidraw/excalidraw/index.css'` is line 1 of the file.

The current render block (lines 143–158):

```tsx
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={<div className="canvas-error"><span>Carregando Excalidraw…</span></div>}>
        <ExcalidrawLib
          key={activeFile?.path}
          initialData={{
            elements: data.elements as any,
            appState: { gridSize: 20, gridModeEnabled: true, ...data.appState } as any,
            files:    data.files as any,
          }}
          onChange={onChange as any}
        />
      </Suspense>
    </div>
  )
```

The current refs block (lines 79–84):

```tsx
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef    = useRef<ExcalidrawData>({ elements: [], appState: {}, files: {} })
  const rawRef        = useRef('')
  const adapterRef    = useRef(adapter)
  const activeFileRef = useRef(activeFile)
  const isMdRef       = useRef(isMd)
```

- [ ] **Step 1: Add `excalidrawAPIRef` to the refs block**

In `src/components/ExcalidrawEditor/index.tsx`, replace the refs block (lines 79–84) with:

```tsx
  const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef       = useRef<ExcalidrawData>({ elements: [], appState: {}, files: {} })
  const rawRef           = useRef('')
  const adapterRef       = useRef(adapter)
  const activeFileRef    = useRef(activeFile)
  const isMdRef          = useRef(isMd)
  const excalidrawAPIRef = useRef<any>(null)
```

- [ ] **Step 2: Replace the render block with the new version including both new props**

Replace the return block (lines 143–158) with:

```tsx
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={<div className="canvas-error"><span>Carregando Excalidraw…</span></div>}>
        <ExcalidrawLib
          key={activeFile?.path}
          excalidrawAPI={(api: any) => { excalidrawAPIRef.current = api }}
          initialData={{
            elements: data.elements as any,
            appState: { gridSize: 20, gridModeEnabled: true, ...data.appState } as any,
            files:    data.files as any,
          }}
          onChange={onChange as any}
          renderTopRightUI={(_isMobile: boolean, appState: any) => (
            <button
              onClick={() =>
                excalidrawAPIRef.current?.updateScene({
                  appState: { gridModeEnabled: !appState.gridModeEnabled },
                })
              }
              style={{
                background: appState.gridModeEnabled ? 'var(--color-primary)' : 'var(--button-gray-1)',
                color: appState.gridModeEnabled ? '#fff' : 'inherit',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Toggle grid (Ctrl+')"
            >
              ⊞ Grid
            </button>
          )}
        />
      </Suspense>
    </div>
  )
```

- [ ] **Step 3: Bump version in `package.json`**

Change `"version": "1.2.50"` to `"version": "1.2.51"`.

- [ ] **Step 4: Start dev servers and verify button appears**

Kill any running Node processes, then start:

```bash
# Terminal 1
node server.js --vault /path/to/any/vault --port 5174

# Terminal 2
npx vite --port 5173
```

Open `http://localhost:5173`, load a vault, open any `.excalidraw` or `.excalidraw.md` file.

Expected: A "⊞ Grid" button is visible in the top-right area of the Excalidraw canvas (to the left of the Library button). It should appear highlighted (blue/primary) when the grid is ON, and gray when OFF.

- [ ] **Step 5: Verify toggle works**

Click the "⊞ Grid" button.

Expected:
- Grid disappears from the canvas
- Button background changes from primary (blue) to gray
- Clicking again: grid reappears, button returns to primary

- [ ] **Step 6: Verify autosave persists the toggle**

After toggling the grid OFF, wait 2 seconds (autosave timer). Close and reopen the same file.

Expected: Grid is still OFF (saved preference restored from file).

- [ ] **Step 7: Commit**

```bash
git add src/components/ExcalidrawEditor/index.tsx package.json
git commit -m "feat(excalidraw): add visual grid toggle button via renderTopRightUI"
```
