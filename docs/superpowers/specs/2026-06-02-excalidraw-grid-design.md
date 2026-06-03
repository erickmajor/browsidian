# Excalidraw Grid Default Design

**Goal:** Show a grid in the Excalidraw editor by default to help orient elements, while letting users toggle it off via Excalidraw's built-in View menu.

**Approach:** Merge `{ gridSize: 20 }` as the base of `appState` in `initialData`, then spread the file's saved appState on top. First open → grid on. User disables via View menu → `onChange` saves `gridSize: null` → next open, saved null overrides default → grid stays off. No new state, no new UI — leverages existing autosave.

**Change:** `src/components/ExcalidrawEditor/index.tsx` line ~148:

```tsx
// Before
appState: data.appState as any,

// After
appState: { gridSize: 20, ...data.appState } as any,
```

**Grid size:** 20px — Excalidraw's own default. No reason to deviate.

**Persistence:** `sanitizeAppState` does not strip `gridSize`, so the user's toggle preference saves automatically on the 1200ms autosave timer.

**Files modified:** `src/components/ExcalidrawEditor/index.tsx`, `package.json` (version bump 1.2.48 → 1.2.49).

**No README update needed** — grid is UX polish, not a public API or behavior change visible to non-Excalidraw users.
