# Excalidraw Icon Fix Design

**Goal:** Fix toolbar icon size/alignment by importing the missing Excalidraw stylesheet.

**Root cause:** `@excalidraw/excalidraw` ships `index.css` containing icon sizing, toolbar layout, and spacing rules. No import exists in the codebase, so Excalidraw renders with JS-computed layout but no CSS support — icons appear at wrong sizes/misaligned.

**Fix:** Add `import '@excalidraw/excalidraw/index.css'` at the top of `src/components/ExcalidrawEditor/index.tsx`. This scopes the stylesheet load to when the component mounts and avoids loading ~50KB on non-Excalidraw pages.

**Risk:** The global CSS reset (`*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }`) could still interfere after the fix. Verify visually after applying — if secondary layout issues appear, a follow-up scoping rule may be needed.

**Files modified:** `src/components/ExcalidrawEditor/index.tsx`, `package.json` (version bump).
