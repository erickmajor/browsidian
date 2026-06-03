# Excalidraw Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full interactive Excalidraw editor for `.excalidraw` and `.excalidraw.md` files using the official `@excalidraw/excalidraw` React library, with auto-save and Obsidian plugin format compatibility.

**Architecture:** Lazy-load `@excalidraw/excalidraw` (~4MB) via `React.lazy` so the bundle cost is zero for users who never open an Excalidraw file. A single-file component handles both formats: raw JSON (`.excalidraw`) and the Obsidian markdown wrapper (`.excalidraw.md`). The component is wired into `EditorArea` with an `.endsWith()` check before the canvas branch.

**Tech Stack:** React 18, TypeScript, `@excalidraw/excalidraw`, Zustand (`useVaultStore`), existing `VaultAdapter`

---

### Task 1: Install `@excalidraw/excalidraw`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-updated by npm)

- [ ] **Step 1: Install the package**

```bash
npm install @excalidraw/excalidraw
```

Expected output: `added N packages` with no errors. Version installed should be `0.17.x` or newer.

- [ ] **Step 2: Verify TypeScript resolves the types**

```bash
npx tsc --noEmit
```

Expected: no errors. If `Cannot find module '@excalidraw/excalidraw'` appears, run `npm install` again and retry.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @excalidraw/excalidraw"
```

---

### Task 2: Create `ExcalidrawEditor` component

**Files:**
- Create: `src/components/ExcalidrawEditor/index.tsx`

- [ ] **Step 1: Create the file with the complete implementation**

Create `src/components/ExcalidrawEditor/index.tsx`:

```tsx
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useVaultStore } from '@/stores/vault'

const ExcalidrawLib = lazy(() =>
  import('@excalidraw/excalidraw').then(m => ({ default: m.Excalidraw }))
)

const AUTOSAVE_MS = 1200

interface ExcalidrawData {
  elements: unknown[]
  appState: Record<string, unknown>
  files:    Record<string, unknown>
}

function sanitizeAppState(s: Record<string, unknown>): Record<string, unknown> {
  const { collaborators, isLoading, isResizing, isRotating,
    isTranslating, contextMenu, openMenu, ...rest } = s as Record<string, unknown> & {
    collaborators?: unknown; isLoading?: unknown; isResizing?: unknown;
    isRotating?: unknown; isTranslating?: unknown; contextMenu?: unknown; openMenu?: unknown
  }
  void collaborators; void isLoading; void isResizing; void isRotating
  void isTranslating; void contextMenu; void openMenu
  return rest
}

function parseExcalidraw(raw: string, isMd: boolean): ExcalidrawData | null {
  try {
    let jsonStr = raw
    if (isMd) {
      const match = raw.match(/%%[\s\S]*?```json\s*([\s\S]*?)```[\s\S]*?%%/)
      if (!match) return null
      jsonStr = match[1].trim()
    }
    const d = JSON.parse(jsonStr || '{}') as Record<string, unknown>
    return {
      elements: (d.elements as unknown[]) ?? [],
      appState: (d.appState as Record<string, unknown>) ?? {},
      files:    (d.files as Record<string, unknown>) ?? {},
    }
  } catch {
    return null
  }
}

function serialize(data: ExcalidrawData): string {
  return JSON.stringify({
    type: 'excalidraw', version: 2, source: 'browsidian',
    elements: data.elements,
    appState: sanitizeAppState(data.appState),
    files:    data.files,
  }, null, 2)
}

function buildMdContent(original: string, json: string): string {
  const hasBlock = /%%[\s\S]*?```json[\s\S]*?```[\s\S]*?%%/.test(original)
  if (hasBlock) {
    return original.replace(
      /(%%[\s\S]*?```json\s*)([\s\S]*?)(```[\s\S]*?%%)/,
      `$1\n${json}\n$3`
    )
  }
  return (
    `---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n\n` +
    `==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==\n\n` +
    `%%\n# Drawing\n\`\`\`json\n${json}\n\`\`\`\n%%`
  )
}

export function ExcalidrawEditor() {
  const { activeFile, adapter } = useVaultStore()
  const isMd = activeFile?.name.endsWith('.excalidraw.md') ?? false

  const [data, setData]     = useState<ExcalidrawData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef    = useRef<ExcalidrawData>({ elements: [], appState: {}, files: {} })
  const rawRef        = useRef('')
  const adapterRef    = useRef(adapter)
  const activeFileRef = useRef(activeFile)
  const isMdRef       = useRef(isMd)

  useEffect(() => { adapterRef.current = adapter }, [adapter])
  useEffect(() => { activeFileRef.current = activeFile }, [activeFile])
  useEffect(() => { isMdRef.current = isMd }, [isMd])

  // Cleanup autosave timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // Load file when activeFile changes
  useEffect(() => {
    if (!activeFile || !adapter) return
    setLoaded(false)
    setError(null)
    adapter.readFile(activeFile.path).then(raw => {
      rawRef.current = raw
      const parsed = parseExcalidraw(raw, isMd)
      if (!parsed) {
        setError('Arquivo Excalidraw inválido ou corrompido.')
        setLoaded(true)
        return
      }
      setData(parsed)
      setLoaded(true)
    }).catch(() => {
      rawRef.current = ''
      setData({ elements: [], appState: {}, files: {} })
      setLoaded(true)
    })
  }, [activeFile?.path])

  const onChange = useCallback((elements: unknown, appState: unknown, files: unknown) => {
    pendingRef.current = {
      elements: elements as unknown[],
      appState: appState as Record<string, unknown>,
      files:    files as Record<string, unknown>,
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const ad = adapterRef.current
      const af = activeFileRef.current
      if (!ad || !af) return
      const json    = serialize(pendingRef.current)
      const content = isMdRef.current ? buildMdContent(rawRef.current, json) : json
      rawRef.current = content
      ad.writeFile(af.path, content).catch(console.error)
    }, AUTOSAVE_MS)
  }, [])

  if (!loaded) return <div className="canvas-error"><span>Carregando…</span></div>
  if (error)   return <div className="canvas-error"><span>{error}</span></div>
  if (!data)   return null

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={<div className="canvas-error"><span>Carregando Excalidraw…</span></div>}>
        <ExcalidrawLib
          key={activeFile?.path}
          initialData={{
            elements: data.elements as Parameters<typeof ExcalidrawLib>[0] extends { initialData?: infer D } ? D extends { elements?: infer E } ? E : never : never,
            appState: data.appState as any,
            files:    data.files as any,
          }}
          onChange={onChange as any}
        />
      </Suspense>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Common issues:
- `Type 'unknown[]' is not assignable` → the `as any` casts on `initialData` props handle this
- `Cannot find module '@excalidraw/excalidraw'` → Task 1 was not completed; run `npm install` first

- [ ] **Step 3: Commit**

```bash
git add src/components/ExcalidrawEditor/index.tsx
git commit -m "feat(excalidraw): add ExcalidrawEditor component with auto-save"
```

---

### Task 3: Wire into `EditorArea`, bump version, update README

**Files:**
- Modify: `src/components/Editor/index.tsx`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add import and `isExcalidraw` branch to `src/components/Editor/index.tsx`**

At the top of the file, add the import after the existing CanvasEditor import:

```tsx
import { ExcalidrawEditor } from '@/components/ExcalidrawEditor'
```

Then, inside `EditorArea`, add the `isExcalidraw` check **before** the canvas branch. The current canvas branch starts at:

```tsx
if (activeFile && ext === 'canvas') {
```

Insert this block immediately before it:

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

After this change, the relevant portion of `EditorArea` should look like:

```tsx
  const isMd = activeFile?.name.toLowerCase().endsWith('.md') ?? false
  const ext  = activeFile?.name.split('.').pop()?.toLowerCase() ?? ''

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

  if (activeFile && ext === 'canvas') {
    return (
      <div className="editor-wrap">
        <CanvasEditor />
      </div>
    )
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Bump version in `package.json`**

Change `"version"` from `"1.2.42"` to `"1.2.43"`.

- [ ] **Step 4: Add feature bullet to `README.md`**

In the Features section, after the `.canvas` bullet, add:

```markdown
- `.excalidraw` and `.excalidraw.md` files — Full interactive Excalidraw whiteboard editor (lazy-loaded) with auto-save. Compatible with both raw Excalidraw JSON and the Obsidian Excalidraw plugin wrapper format.
```

- [ ] **Step 5: Commit**

```bash
git add src/components/Editor/index.tsx package.json README.md
git commit -m "feat(excalidraw): wire ExcalidrawEditor into EditorArea, bump to 1.2.43"
```
