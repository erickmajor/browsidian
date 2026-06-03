# Excalidraw Icon Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Excalidraw toolbar icon size/alignment by importing the missing `@excalidraw/excalidraw/index.css` stylesheet.

**Architecture:** Single import added to `ExcalidrawEditor/index.tsx` so the stylesheet loads only when the component mounts. No structural changes needed.

**Tech Stack:** React, Vite, `@excalidraw/excalidraw@^0.18.1`

---

### Task 1: Add CSS import and bump version

**Files:**
- Modify: `src/components/ExcalidrawEditor/index.tsx` (add CSS import at line 1)
- Modify: `package.json` (bump version `1.2.47` → `1.2.48`)

**Context:**

`@excalidraw/excalidraw` ships its stylesheet at `@excalidraw/excalidraw/index.css`. Without it, the Excalidraw UI renders with no CSS support — icons appear at wrong sizes and misaligned. The project has no automated test suite; verification is manual (start dev servers, open an `.excalidraw` file, confirm toolbar icons look correct).

The current `src/components/ExcalidrawEditor/index.tsx` starts with:

```tsx
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useVaultStore } from '@/stores/vault'
```

- [ ] **Step 1: Add CSS import**

Edit `src/components/ExcalidrawEditor/index.tsx` — prepend the CSS import as the very first line:

```tsx
import '@excalidraw/excalidraw/index.css'
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useVaultStore } from '@/stores/vault'
```

No other changes to this file.

- [ ] **Step 2: Verify Vite resolves the import**

Run:
```bash
npm run dev:web
```

Expected: Vite starts without errors. If Vite throws `Cannot find module '@excalidraw/excalidraw/index.css'`, the package is not installed correctly — run `npm install` first.

- [ ] **Step 3: Open an Excalidraw file and verify icons**

With both servers running (`npm run dev:web` starts both Vite at 5173 and node server at 5174), open `http://localhost:5173` in a browser, load a vault, and open any `.excalidraw` or `.excalidraw.md` file.

Expected: Excalidraw toolbar icons (pencil, shapes, text, etc.) render at correct size and are properly spaced. If secondary layout issues appear (e.g., toolbar overlapping canvas), note them but do not fix in this task.

- [ ] **Step 4: Bump version in `package.json`**

Change `"version": "1.2.47"` to `"version": "1.2.48"`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExcalidrawEditor/index.tsx package.json
git commit -m "fix(excalidraw): import stylesheet to fix icon sizing"
```
