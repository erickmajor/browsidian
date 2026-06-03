# Excalidraw Grid Toggle Button Design

**Goal:** Add a visual button inside the Excalidraw canvas area to toggle the grid on/off, resolving the missing affordance in Electron where `Ctrl+'` keyboard shortcuts don't fire.

---

## Problem

`gridModeEnabled` defaults to `true` (set in `initialData.appState`). The only way to toggle it is `Ctrl+'` — a keyboard shortcut that does not work in the Electron build. Users have no visual way to discover or trigger the toggle.

## Approach

Use Excalidraw's official `renderTopRightUI` prop to inject a custom button into the canvas toolbar area. The prop callback receives the current `appState`, so `gridModeEnabled` is available without extra state. Toggling calls `excalidrawAPI.updateScene()`. The existing 1200ms autosave persists the change automatically via `onChange`.

---

## Implementation

**File changed:** `src/components/ExcalidrawEditor/index.tsx` only (plus `package.json` version bump).

### API ref

```tsx
const excalidrawAPIRef = useRef<any>(null)
```

Passed to `<ExcalidrawLib>` as:

```tsx
excalidrawAPI={(api) => { excalidrawAPIRef.current = api }}
```

### `renderTopRightUI` button

```tsx
renderTopRightUI={(_, appState) => (
  <button
    onClick={() =>
      excalidrawAPIRef.current?.updateScene({
        appState: { gridModeEnabled: !(appState as any).gridModeEnabled },
      })
    }
    style={{
      background: (appState as any).gridModeEnabled
        ? 'var(--color-primary)'
        : 'var(--button-gray-1)',
      color: (appState as any).gridModeEnabled ? '#fff' : 'inherit',
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
```

### Persistence

No change to autosave logic. `onChange` fires on every Excalidraw state change, including the `updateScene` call, and serializes `gridModeEnabled` via the existing 1200ms timer.

---

## Behavior

| Scenario | Result |
|----------|--------|
| File opens with grid ON (default) | Button shows highlighted (primary color) |
| User clicks button | Grid toggles, button state updates immediately |
| Autosave fires (~1200ms later) | `gridModeEnabled` written to file |
| File reopened | Saved state restored (spread order: default ← file appState) |
| `Ctrl+'` in browser | Still works (keyboard and button coexist) |
| Electron | Button works; keyboard shortcut not required |

---

## Style notes

- Uses Excalidraw CSS variables (`--color-primary`, `--button-gray-1`) already available from `import '@excalidraw/excalidraw/index.css'`
- Button positioned in `renderTopRightUI` slot — top-right of canvas, alongside the Library button
- Always visible (web + Electron); no `__IS_ELECTRON__` conditional

---

## Files modified

| File | Change |
|------|--------|
| `src/components/ExcalidrawEditor/index.tsx` | Add `excalidrawAPIRef`, `excalidrawAPI` prop, `renderTopRightUI` prop |
| `package.json` | Version bump |
