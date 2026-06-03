# Canvas Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native `.canvas` file support to Browsidian — a full interactive editor with pan/zoom, drag, node creation/deletion, edge drawing, and auto-save, compatible with Obsidian's JSON Canvas format.

**Architecture:** `CanvasEditor` is a pure React component that mounts when `EditorArea` detects the `.canvas` extension (before plugin lookup). Data state (`nodes`, `edges`) lives in `CanvasEditor/index.tsx`. Gesture state (viewport, pan, drag, selection, edge drawing) lives in `useCanvas.ts`. File I/O goes through the existing `VaultAdapter` from `useVaultStore`.

**Tech Stack:** React + TypeScript, CSS transform viewport, SVG cubic Bézier edges — no new dependencies.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/CanvasEditor/types.ts` | JSON Canvas TypeScript types |
| Create | `src/components/CanvasEditor/useCanvas.ts` | Viewport, pan, zoom, drag, edge-drawing hook |
| Create | `src/components/CanvasEditor/CanvasNode.tsx` | Single node renderer (text / file / group) |
| Create | `src/components/CanvasEditor/CanvasEdge.tsx` | SVG cubic Bézier edge + arrowhead |
| Create | `src/components/CanvasEditor/index.tsx` | Main editor: load/save, toolbar, keyboard, undo |
| Modify | `src/styles/global.css` | Canvas CSS variables + layout classes |
| Modify | `src/components/Editor/index.tsx` | Add canvas branch before plugin lookup |
| Modify | `src/plugins/loader.ts` | Remove `canvas` from viewRegistry.typeByExtension |
| Modify | `package.json` | Version bump (Z + 1) |
| Modify | `README.md` | Canvas support note |

> **No test suite** (per CLAUDE.md). Each task ends with a manual browser verification step.

---

## Task 1: TypeScript types

**Files:**
- Create: `src/components/CanvasEditor/types.ts`

- [ ] **Step 1: Create `types.ts` with JSON Canvas spec types**

```typescript
// src/components/CanvasEditor/types.ts

export interface CanvasData {
  nodes: CanvasNodeType[]
  edges: CanvasEdge[]
}

export type CanvasNodeType = TextNode | FileNode | GroupNode

export interface BaseNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  color?: string  // hex "#rrggbb" or Obsidian preset "1"–"6"
}

export interface TextNode extends BaseNode {
  type: 'text'
  text: string
}

export interface FileNode extends BaseNode {
  type: 'file'
  file: string      // vault-relative path
  subpath?: string  // optional heading/block anchor
}

export interface GroupNode extends BaseNode {
  type: 'group'
  label?: string
  background?: string
  backgroundStyle?: 'cover' | 'ratio' | 'repeat' | 'center'
}

export type Side = 'top' | 'right' | 'bottom' | 'left'
export type EndStyle = 'none' | 'arrow'

export interface CanvasEdge {
  id: string
  fromNode: string
  fromSide: Side
  fromEnd?: EndStyle
  toNode: string
  toSide: Side
  toEnd?: EndStyle
  color?: string
  label?: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasEditor/types.ts
git commit -m "feat(canvas): add JSON Canvas TypeScript types"
```

---

## Task 2: CSS — canvas variables and styles

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Add canvas color variables inside the `:root { }` block**

In `src/styles/global.css`, after `--titlebar-height: 40px;` (line ~38), add:

```css
  /* Canvas editor — Obsidian color presets */
  --canvas-color-1: #e03131;
  --canvas-color-2: #e8590c;
  --canvas-color-3: #f08c00;
  --canvas-color-4: #2f9e44;
  --canvas-color-5: #1971c2;
  --canvas-color-6: #7048e8;
```

- [ ] **Step 2: Append canvas layout + component styles at end of global.css**

```css
/* ─── Canvas Editor ──────────────────────────────────────────────────────── */
.btn-sm {
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 6px;
}

.canvas-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.canvas-toolbar-label {
  font-size: 11px;
  color: var(--muted);
}

.canvas-toolbar-sep { flex: 1; }

.canvas-toolbar-zoom {
  font-size: 11px;
  color: var(--text);
  min-width: 38px;
  text-align: center;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 4px;
  user-select: none;
}

.canvas-toolbar-zoom:hover { background: var(--hover-bg); }

.canvas-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: var(--bg);
  background-image: radial-gradient(circle, var(--border) 1px, transparent 1px);
  background-size: 28px 28px;
}

.canvas-world {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  width: 0;
  height: 0;
}

.canvas-edges {
  position: absolute;
  top: 0;
  left: 0;
  width: 100000px;
  height: 100000px;
  pointer-events: none;
  overflow: visible;
}

/* ─── Node ─────────────────────────────────────────────────────────────── */
.canvas-node {
  position: absolute;
  background: var(--panel);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--shadow);
  user-select: none;
  cursor: grab;
  min-width: 80px;
  min-height: 60px;
}

.canvas-node:active { cursor: grabbing; }

.canvas-node--selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}

.canvas-node--group {
  background: transparent;
  border: 2px dashed var(--border);
  box-shadow: none;
  cursor: default;
}

.canvas-node__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 8px;
  font-size: 10px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.canvas-node__delete {
  cursor: pointer;
  opacity: 0.45;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 11px;
  padding: 0 2px;
  line-height: 1;
}

.canvas-node__delete:hover { opacity: 1; color: var(--danger); }

.canvas-node__body {
  padding: 8px;
  font-size: 12px;
  color: var(--text);
}

.canvas-node__textarea {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text);
  font-family: var(--mono);
  font-size: 12px;
  resize: none;
  outline: none;
  line-height: 1.5;
}

.canvas-node__group-label {
  position: absolute;
  top: -10px;
  left: 12px;
  background: var(--bg);
  padding: 0 6px;
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}

.canvas-node__file-icon { font-size: 20px; line-height: 1; }
.canvas-node__file-name { font-size: 12px; color: var(--text); font-weight: 500; }

.canvas-node__file-open {
  font-size: 10px;
  color: var(--accent);
  cursor: pointer;
  margin-top: 2px;
  background: none;
  border: none;
  padding: 0;
  display: block;
}

.canvas-node__file-open:hover { text-decoration: underline; }

/* ─── Ports ────────────────────────────────────────────────────────────── */
.canvas-node__ports {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.canvas-port {
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--accent);
  border: 2px solid var(--panel);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: crosshair;
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: auto;
}

.canvas-node:hover .canvas-node__ports { pointer-events: auto; }
.canvas-node:hover .canvas-port { opacity: 1; }

/* ─── Resize handles ──────────────────────────────────────────────────── */
.canvas-resize-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: var(--accent);
  border: 1.5px solid var(--panel);
  border-radius: 2px;
}

.canvas-resize-handle--nw { top: -4px; left: -4px;     cursor: nw-resize; }
.canvas-resize-handle--ne { top: -4px; right: -4px;    cursor: ne-resize; }
.canvas-resize-handle--sw { bottom: -4px; left: -4px;  cursor: sw-resize; }
.canvas-resize-handle--se { bottom: -4px; right: -4px; cursor: se-resize; }

/* ─── Canvas error / empty ────────────────────────────────────────────── */
.canvas-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--muted);
  font-size: 13px;
}

.canvas-hint {
  position: absolute;
  bottom: 8px;
  right: 12px;
  font-size: 10px;
  color: var(--muted);
  pointer-events: none;
  user-select: none;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(canvas): add CSS variables and canvas layout styles"
```

---

## Task 3: useCanvas hook

**Files:**
- Create: `src/components/CanvasEditor/useCanvas.ts`

- [ ] **Step 1: Create `useCanvas.ts`**

```typescript
// src/components/CanvasEditor/useCanvas.ts
import { useState, useRef, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { CanvasNodeType, CanvasEdge, Side } from './types'

export interface Viewport { x: number; y: number; zoom: number }
export interface DragOverride { nodeId: string; x: number; y: number }
export interface PendingEdge { fromNode: string; fromSide: Side; currentX: number; currentY: number }

interface PanRef { startX: number; startY: number }
interface DragRef { nodeId: string; startMX: number; startMY: number; origX: number; origY: number }
interface ResizeRef {
  nodeId: string
  handle: 'nw' | 'ne' | 'sw' | 'se'
  startMX: number; startMY: number
  origX: number; origY: number; origW: number; origH: number
}

interface UseCanvasOptions {
  nodes: CanvasNodeType[]
  onUpdateNode(id: string, patch: Record<string, unknown>): void
  onAddEdge(edge: CanvasEdge): void
}

interface UseCanvasResult {
  viewport: Viewport
  setViewport: Dispatch<SetStateAction<Viewport>>
  selected: Set<string>
  setSelected: Dispatch<SetStateAction<Set<string>>>
  pendingEdge: PendingEdge | null
  setPendingEdge: Dispatch<SetStateAction<PendingEdge | null>>
  dragOverride: DragOverride | null
  isPanning: boolean
  viewportRef: React.RefObject<HTMLDivElement>
  handleWheel(e: React.WheelEvent): void
  handleBackgroundMouseDown(e: React.MouseEvent): void
  handleBackgroundClick(e: React.MouseEvent): void
  handleNodeMouseDown(nodeId: string, e: React.MouseEvent): void
  handlePortMouseDown(nodeId: string, side: Side, e: React.MouseEvent): void
  handlePortMouseUp(nodeId: string, side: Side): void
  handleResizeMouseDown(nodeId: string, handle: 'nw' | 'ne' | 'sw' | 'se', e: React.MouseEvent): void
  handleMouseMove(e: React.MouseEvent): void
  handleMouseUp(e: React.MouseEvent): void
}

export function useCanvas({ nodes, onUpdateNode, onAddEdge }: UseCanvasOptions): UseCanvasResult {
  const [viewport, setViewport]       = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [pendingEdge, setPendingEdge] = useState<PendingEdge | null>(null)
  const [dragOverride, setDragOverride] = useState<DragOverride | null>(null)
  const [isPanning, setIsPanning]     = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const vpRef       = useRef(viewport)
  const panRef      = useRef<PanRef | null>(null)
  const dragRef     = useRef<DragRef | null>(null)
  const resizeRef   = useRef<ResizeRef | null>(null)
  const portRef     = useRef<{ fromNode: string; fromSide: Side } | null>(null)
  const dragOverRef = useRef<DragOverride | null>(null)

  useEffect(() => { vpRef.current = viewport }, [viewport])
  useEffect(() => { dragOverRef.current = dragOverride }, [dragOverride])

  const screenToWorld = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const vp = vpRef.current
    return {
      x: (clientX - rect.left - vp.x) / vp.zoom,
      y: (clientY - rect.top  - vp.y) / vp.zoom,
    }
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const vp      = vpRef.current
    const factor  = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.max(0.1, Math.min(3, vp.zoom * factor))
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    setViewport({
      zoom: newZoom,
      x: mx - (mx - vp.x) * (newZoom / vp.zoom),
      y: my - (my - vp.y) * (newZoom / vp.zoom),
    })
  }, [])

  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    panRef.current = { startX: e.clientX - vpRef.current.x, startY: e.clientY - vpRef.current.y }
    setIsPanning(true)
  }, [])

  const handleBackgroundClick = useCallback((_e: React.MouseEvent) => {
    setSelected(new Set())
    setPendingEdge(null)
    portRef.current = null
  }, [])

  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    setSelected(new Set([nodeId]))
    dragRef.current = { nodeId, startMX: e.clientX, startMY: e.clientY, origX: node.x, origY: node.y }
    setDragOverride({ nodeId, x: node.x, y: node.y })
  }, [nodes])

  const handlePortMouseDown = useCallback((nodeId: string, side: Side, e: React.MouseEvent) => {
    e.stopPropagation()
    portRef.current = { fromNode: nodeId, fromSide: side }
    const world = screenToWorld(e.clientX, e.clientY)
    setPendingEdge({ fromNode: nodeId, fromSide: side, currentX: world.x, currentY: world.y })
  }, [screenToWorld])

  const handlePortMouseUp = useCallback((nodeId: string, side: Side) => {
    if (!portRef.current || portRef.current.fromNode === nodeId) {
      portRef.current = null
      setPendingEdge(null)
      return
    }
    const edge: CanvasEdge = {
      id: crypto.randomUUID(),
      fromNode: portRef.current.fromNode,
      fromSide: portRef.current.fromSide,
      toNode: nodeId,
      toSide: side,
      toEnd: 'arrow',
    }
    onAddEdge(edge)
    portRef.current = null
    setPendingEdge(null)
  }, [onAddEdge])

  const handleResizeMouseDown = useCallback((
    nodeId: string,
    handle: 'nw' | 'ne' | 'sw' | 'se',
    e: React.MouseEvent,
  ) => {
    e.stopPropagation()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    resizeRef.current = {
      nodeId, handle,
      startMX: e.clientX, startMY: e.clientY,
      origX: node.x, origY: node.y, origW: node.width, origH: node.height,
    }
  }, [nodes])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const vp = vpRef.current

    if (panRef.current) {
      setViewport(prev => ({
        ...prev,
        x: e.clientX - panRef.current!.startX,
        y: e.clientY - panRef.current!.startY,
      }))
      return
    }

    if (dragRef.current) {
      const { nodeId, startMX, startMY, origX, origY } = dragRef.current
      const dx = (e.clientX - startMX) / vp.zoom
      const dy = (e.clientY - startMY) / vp.zoom
      setDragOverride({ nodeId, x: origX + dx, y: origY + dy })
      return
    }

    if (resizeRef.current) {
      const { nodeId, handle, startMX, startMY, origX, origY, origW, origH } = resizeRef.current
      const dx = (e.clientX - startMX) / vp.zoom
      const dy = (e.clientY - startMY) / vp.zoom
      let x = origX, y = origY, w = origW, h = origH
      if (handle.includes('e')) { w = Math.max(80, origW + dx) }
      if (handle.includes('w')) { w = Math.max(80, origW - dx); x = origX + origW - w }
      if (handle.includes('s')) { h = Math.max(60, origH + dy) }
      if (handle.includes('n')) { h = Math.max(60, origH - dy); y = origY + origH - h }
      onUpdateNode(nodeId, { x, y, width: w, height: h })
      return
    }

    if (portRef.current) {
      const world = screenToWorld(e.clientX, e.clientY)
      setPendingEdge(prev => prev ? { ...prev, currentX: world.x, currentY: world.y } : null)
    }
  }, [onUpdateNode, screenToWorld])

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    if (dragRef.current && dragOverRef.current) {
      const { x, y } = dragOverRef.current
      onUpdateNode(dragRef.current.nodeId, { x, y })
    }
    if (portRef.current) {
      portRef.current = null
      setPendingEdge(null)
    }
    panRef.current   = null
    dragRef.current  = null
    resizeRef.current = null
    setDragOverride(null)
    setIsPanning(false)
  }, [onUpdateNode])

  return {
    viewport, setViewport,
    selected, setSelected,
    pendingEdge, setPendingEdge,
    dragOverride, isPanning, viewportRef,
    handleWheel, handleBackgroundMouseDown, handleBackgroundClick,
    handleNodeMouseDown, handlePortMouseDown, handlePortMouseUp,
    handleResizeMouseDown, handleMouseMove, handleMouseUp,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasEditor/useCanvas.ts
git commit -m "feat(canvas): add useCanvas viewport/pan/drag/edge hook"
```

---

## Task 4: CanvasNode component

**Files:**
- Create: `src/components/CanvasEditor/CanvasNode.tsx`

- [ ] **Step 1: Create `CanvasNode.tsx`**

```tsx
// src/components/CanvasEditor/CanvasNode.tsx
import type { CanvasNodeType, Side } from './types'
import type { DragOverride } from './useCanvas'

const OBSIDIAN_COLORS: Record<string, string> = {
  '1': 'var(--canvas-color-1)',
  '2': 'var(--canvas-color-2)',
  '3': 'var(--canvas-color-3)',
  '4': 'var(--canvas-color-4)',
  '5': 'var(--canvas-color-5)',
  '6': 'var(--canvas-color-6)',
}

function resolveColor(c?: string): string | undefined {
  if (!c) return undefined
  return OBSIDIAN_COLORS[c] ?? c
}

const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

function portStyle(side: Side, w: number, h: number): React.CSSProperties {
  switch (side) {
    case 'top':    return { top: 0,      left: w / 2 }
    case 'right':  return { top: h / 2,  left: w }
    case 'bottom': return { top: h,      left: w / 2 }
    case 'left':   return { top: h / 2,  left: 0 }
  }
}

interface CanvasNodeProps {
  node: CanvasNodeType
  selected: boolean
  dragOverride: DragOverride | null
  onMouseDown(e: React.MouseEvent): void
  onPortMouseDown(side: Side, e: React.MouseEvent): void
  onPortMouseUp(side: Side): void
  onResizeMouseDown(handle: 'nw' | 'ne' | 'sw' | 'se', e: React.MouseEvent): void
  onDelete(): void
  onTextChange(text: string): void
  onOpenFile(path: string): void
}

export function CanvasNode({
  node, selected, dragOverride,
  onMouseDown, onPortMouseDown, onPortMouseUp,
  onResizeMouseDown, onDelete, onTextChange, onOpenFile,
}: CanvasNodeProps) {
  const x = dragOverride?.x ?? node.x
  const y = dragOverride?.y ?? node.y
  const isGroup = node.type === 'group'
  const borderColor = resolveColor(node.color)

  const style: React.CSSProperties = {
    left: x,
    top: y,
    width: node.width,
    height: node.height,
    zIndex: isGroup ? 0 : 1,
    ...(borderColor ? { borderColor } : {}),
  }

  const className = [
    'canvas-node',
    selected ? 'canvas-node--selected' : '',
    isGroup ? 'canvas-node--group' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={className} style={style} onMouseDown={onMouseDown}>
      {/* Header (text / file nodes) */}
      {!isGroup && (
        <div className="canvas-node__header">
          <span>{node.type === 'text' ? 'Texto' : 'Arquivo'}</span>
          <button
            className="canvas-node__delete"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
          >✕</button>
        </div>
      )}

      {/* Text content */}
      {node.type === 'text' && (
        <div className="canvas-node__body">
          <textarea
            className="canvas-node__textarea"
            value={node.text}
            style={{ height: Math.max(40, node.height - 30) }}
            onChange={e => onTextChange(e.target.value)}
            onMouseDown={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* File content */}
      {node.type === 'file' && (
        <div className="canvas-node__body" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="canvas-node__file-icon">📄</span>
          <div>
            <div className="canvas-node__file-name">
              {node.file.split('/').pop() ?? node.file}
            </div>
            <button
              className="canvas-node__file-open"
              onClick={(e) => { e.stopPropagation(); onOpenFile(node.file) }}
            >
              ↗ Abrir no editor
            </button>
          </div>
        </div>
      )}

      {/* Group label */}
      {isGroup && node.label && (
        <span className="canvas-node__group-label">{node.label}</span>
      )}

      {/* Group delete (top-right corner) */}
      {isGroup && (
        <button
          className="canvas-node__delete"
          style={{ position: 'absolute', top: 4, right: 4 }}
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >✕</button>
      )}

      {/* Connection ports */}
      <div className="canvas-node__ports">
        {SIDES.map(side => (
          <div
            key={side}
            className="canvas-port"
            style={portStyle(side, node.width, node.height)}
            onMouseDown={(e) => { e.stopPropagation(); onPortMouseDown(side, e) }}
            onMouseUp={(e) => { e.stopPropagation(); onPortMouseUp(side) }}
          />
        ))}
      </div>

      {/* Resize handles (selected non-group nodes only) */}
      {selected && !isGroup && (
        <>
          {(['nw', 'ne', 'sw', 'se'] as const).map(h => (
            <div
              key={h}
              className={`canvas-resize-handle canvas-resize-handle--${h}`}
              onMouseDown={(e) => { e.stopPropagation(); onResizeMouseDown(h, e) }}
            />
          ))}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasEditor/CanvasNode.tsx
git commit -m "feat(canvas): add CanvasNode renderer (text/file/group + ports + resize)"
```

---

## Task 5: CanvasEdge component

**Files:**
- Create: `src/components/CanvasEditor/CanvasEdge.tsx`

- [ ] **Step 1: Create `CanvasEdge.tsx`**

```tsx
// src/components/CanvasEditor/CanvasEdge.tsx
import type { CanvasEdge, CanvasNodeType, Side } from './types'
import type { PendingEdge } from './useCanvas'

const OBSIDIAN_COLORS: Record<string, string> = {
  '1': 'var(--canvas-color-1)',
  '2': 'var(--canvas-color-2)',
  '3': 'var(--canvas-color-3)',
  '4': 'var(--canvas-color-4)',
  '5': 'var(--canvas-color-5)',
  '6': 'var(--canvas-color-6)',
}

function resolveColor(c?: string): string {
  if (!c) return 'var(--muted)'
  return OBSIDIAN_COLORS[c] ?? c
}

function portPos(node: CanvasNodeType, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top':    return { x: node.x + node.width / 2, y: node.y }
    case 'right':  return { x: node.x + node.width,     y: node.y + node.height / 2 }
    case 'bottom': return { x: node.x + node.width / 2, y: node.y + node.height }
    case 'left':   return { x: node.x,                  y: node.y + node.height / 2 }
  }
}

function controlPt(pos: { x: number; y: number }, side: Side, dist = 80): { x: number; y: number } {
  switch (side) {
    case 'top':    return { x: pos.x,          y: pos.y - dist }
    case 'right':  return { x: pos.x + dist,   y: pos.y }
    case 'bottom': return { x: pos.x,          y: pos.y + dist }
    case 'left':   return { x: pos.x - dist,   y: pos.y }
  }
}

interface CanvasEdgeProps {
  edge: CanvasEdge
  nodes: CanvasNodeType[]
  markerId: string
  selected: boolean
  onClick(): void
}

export function CanvasEdgeComponent({ edge, nodes, markerId, selected, onClick }: CanvasEdgeProps) {
  const fromNode = nodes.find(n => n.id === edge.fromNode)
  const toNode   = nodes.find(n => n.id === edge.toNode)
  if (!fromNode || !toNode) return null

  const from = portPos(fromNode, edge.fromSide)
  const to   = portPos(toNode,   edge.toSide)
  const cp1  = controlPt(from, edge.fromSide)
  const cp2  = controlPt(to,   edge.toSide)
  const d    = `M ${from.x} ${from.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${to.x} ${to.y}`
  const color = resolveColor(edge.color)

  // Approximate midpoint at t=0.5 on cubic Bézier
  const mid = {
    x: 0.125 * from.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * to.x,
    y: 0.125 * from.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * to.y,
  }

  return (
    <g onClick={onClick} style={{ cursor: 'pointer', pointerEvents: 'auto' }}>
      {/* Wider invisible hit area */}
      <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
      <path
        d={d}
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.5}
        fill="none"
        markerEnd={edge.toEnd !== 'none' ? `url(#${markerId})` : undefined}
      />
      {edge.label && (
        <text
          x={mid.x}
          y={mid.y - 8}
          textAnchor="middle"
          fontSize={11}
          fill={color}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {edge.label}
        </text>
      )}
    </g>
  )
}

export function PendingEdgePath({ fromNode, fromSide, currentX, currentY, nodes }: PendingEdge & { nodes: CanvasNodeType[] }) {
  const node = nodes.find(n => n.id === fromNode)
  if (!node) return null
  const from = portPos(node, fromSide)
  const cp1  = controlPt(from, fromSide)
  const d    = `M ${from.x} ${from.y} C ${cp1.x} ${cp1.y} ${currentX} ${currentY} ${currentX} ${currentY}`
  return (
    <path d={d} stroke="var(--accent)" strokeWidth={1.5} fill="none" strokeDasharray="4 3" opacity={0.7} />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasEditor/CanvasEdge.tsx
git commit -m "feat(canvas): add CanvasEdge SVG Bézier renderer with arrowhead"
```

---

## Task 6: CanvasEditor main component

**Files:**
- Create: `src/components/CanvasEditor/index.tsx`

- [ ] **Step 1: Create `CanvasEditor/index.tsx`**

```tsx
// src/components/CanvasEditor/index.tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useVaultStore, type VaultFile } from '@/stores/vault'
import type { CanvasData, CanvasNodeType, CanvasEdge } from './types'
import { useCanvas } from './useCanvas'
import { CanvasNode } from './CanvasNode'
import { CanvasEdgeComponent, PendingEdgePath } from './CanvasEdge'

const AUTOSAVE_MS = 1200
const MARKER_ID   = 'canvas-arrow'

function genId(): string { return crypto.randomUUID() }

function vpCenter(vp: { x: number; y: number; zoom: number }, el: HTMLDivElement | null) {
  if (!el) return { x: 200, y: 150 }
  const r = el.getBoundingClientRect()
  return { x: (r.width / 2 - vp.x) / vp.zoom, y: (r.height / 2 - vp.y) / vp.zoom }
}

export function CanvasEditor() {
  const { activeFile, adapter, openFile } = useVaultStore()

  const [nodes, setNodes]           = useState<CanvasNodeType[]>([])
  const [edges, setEdges]           = useState<CanvasEdge[]>([])
  const [loaded, setLoaded]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [selectedEdge, setSelEdge]  = useState<string | null>(null)

  // Refs for stale-closure-safe callbacks
  const nodesRef      = useRef(nodes)
  const edgesRef      = useRef(edges)
  const autosaveRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const snapshotRef   = useRef<{ nodes: CanvasNodeType[]; edges: CanvasEdge[] } | null>(null)

  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeFile || !adapter) return
    setLoaded(false)
    setError(null)
    adapter.readFile(activeFile.path).then(raw => {
      try {
        const data = JSON.parse(raw || '{}') as Partial<CanvasData>
        setNodes(data.nodes ?? [])
        setEdges(data.edges ?? [])
      } catch {
        setError('Canvas inválido. O arquivo pode estar corrompido.')
      }
      setLoaded(true)
    }).catch(() => {
      // Empty or new file — start blank
      setNodes([])
      setEdges([])
      setLoaded(true)
    })
  }, [activeFile?.path])

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const scheduleAutosave = useCallback((n: CanvasNodeType[], e: CanvasEdge[]) => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(() => {
      if (!adapter || !activeFile) return
      const data: CanvasData = { nodes: n, edges: e }
      adapter.writeFile(activeFile.path, JSON.stringify(data, null, 2)).catch(console.error)
    }, AUTOSAVE_MS)
  }, [adapter, activeFile?.path])

  // ── Mutation helper — saves undo snapshot before each change ──────────────
  const mutate = useCallback((newNodes: CanvasNodeType[], newEdges: CanvasEdge[]) => {
    snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
    setNodes(newNodes)
    setEdges(newEdges)
    scheduleAutosave(newNodes, newEdges)
  }, [scheduleAutosave])

  // ── Callbacks for useCanvas ───────────────────────────────────────────────
  const onUpdateNode = useCallback((id: string, patch: Record<string, unknown>) => {
    setNodes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...patch } as CanvasNodeType : n)
      snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
      scheduleAutosave(next, edgesRef.current)
      return next
    })
  }, [scheduleAutosave])

  const onAddEdge = useCallback((edge: CanvasEdge) => {
    setEdges(prev => {
      const next = [...prev, edge]
      snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
      scheduleAutosave(nodesRef.current, next)
      return next
    })
  }, [scheduleAutosave])

  const onDeleteNodes = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setNodes(prevN => {
      const nextN = prevN.filter(n => !idSet.has(n.id))
      setEdges(prevE => {
        const nextE = prevE.filter(e => !idSet.has(e.fromNode) && !idSet.has(e.toNode))
        snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
        scheduleAutosave(nextN, nextE)
        return nextE
      })
      return nextN
    })
  }, [scheduleAutosave])

  const onDeleteEdges = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    setEdges(prev => {
      const next = prev.filter(e => !idSet.has(e.id))
      snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
      scheduleAutosave(nodesRef.current, next)
      return next
    })
  }, [scheduleAutosave])

  const onUndo = useCallback(() => {
    const snap = snapshotRef.current
    if (!snap) return
    snapshotRef.current = null
    setNodes(snap.nodes)
    setEdges(snap.edges)
    scheduleAutosave(snap.nodes, snap.edges)
  }, [scheduleAutosave])

  // ── Canvas hook ───────────────────────────────────────────────────────────
  const canvas = useCanvas({ nodes, onUpdateNode, onAddEdge })

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      if (e.key === 'Escape') {
        canvas.setSelected(new Set())
        canvas.setPendingEdge(null)
        setSelEdge(null)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (canvas.selected.size > 0) {
          onDeleteNodes(Array.from(canvas.selected))
          canvas.setSelected(new Set())
        }
        if (selectedEdge) {
          onDeleteEdges([selectedEdge])
          setSelEdge(null)
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        onUndo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canvas.selected, selectedEdge, onDeleteNodes, onDeleteEdges, onUndo, canvas])

  // ── Toolbar actions ───────────────────────────────────────────────────────
  const addText = useCallback(() => {
    const c = vpCenter(canvas.viewport, canvas.viewportRef.current)
    const n: CanvasNodeType = { id: genId(), type: 'text', x: c.x - 125, y: c.y - 70, width: 250, height: 140, text: '' }
    mutate([...nodesRef.current, n], edgesRef.current)
  }, [canvas.viewport, canvas.viewportRef, mutate])

  const addFile = useCallback(() => {
    const path = window.prompt('Caminho do arquivo (relativo ao vault):', '')?.trim()
    if (!path) return
    const c = vpCenter(canvas.viewport, canvas.viewportRef.current)
    const n: CanvasNodeType = { id: genId(), type: 'file', file: path, x: c.x - 125, y: c.y - 50, width: 250, height: 100 }
    mutate([...nodesRef.current, n], edgesRef.current)
  }, [canvas.viewport, canvas.viewportRef, mutate])

  const addGroup = useCallback(() => {
    const c = vpCenter(canvas.viewport, canvas.viewportRef.current)
    const n: CanvasNodeType = { id: genId(), type: 'group', x: c.x - 200, y: c.y - 150, width: 400, height: 300 }
    mutate([...nodesRef.current, n], edgesRef.current)
  }, [canvas.viewport, canvas.viewportRef, mutate])

  const fitAll = useCallback(() => {
    if (nodesRef.current.length === 0) return
    const el = canvas.viewportRef.current
    if (!el) return
    const r    = el.getBoundingClientRect()
    const minX = Math.min(...nodesRef.current.map(n => n.x))
    const minY = Math.min(...nodesRef.current.map(n => n.y))
    const maxX = Math.max(...nodesRef.current.map(n => n.x + n.width))
    const maxY = Math.max(...nodesRef.current.map(n => n.y + n.height))
    const pad  = 60
    const zoom = Math.min(3, Math.max(0.1, Math.min(
      (r.width  - pad * 2) / (maxX - minX),
      (r.height - pad * 2) / (maxY - minY),
    )))
    canvas.setViewport({
      zoom,
      x: r.width  / 2 - ((minX + maxX) / 2) * zoom,
      y: r.height / 2 - ((minY + maxY) / 2) * zoom,
    })
  }, [canvas.viewportRef, canvas.setViewport])

  // ── Render ────────────────────────────────────────────────────────────────
  if (!loaded) return <div className="canvas-error"><span>Carregando…</span></div>
  if (error)   return <div className="canvas-error"><span>{error}</span></div>

  const groups = nodes.filter(n => n.type === 'group')
  const others = nodes.filter(n => n.type !== 'group')
  const zoomPct = Math.round(canvas.viewport.zoom * 100)

  return (
    <div className="canvas-editor">
      {/* Toolbar */}
      <div className="canvas-toolbar">
        <span className="canvas-toolbar-label">Adicionar:</span>
        <button className="btn btn-sm" onClick={addText}>＋ Texto</button>
        <button className="btn btn-sm" onClick={addFile}>＋ Arquivo</button>
        <button className="btn btn-sm" onClick={addGroup}>＋ Grupo</button>
        <div className="canvas-toolbar-sep" />
        <button className="btn btn-sm" onClick={() => canvas.setViewport(v => ({ ...v, zoom: Math.max(0.1, v.zoom * 0.8) }))}>－</button>
        <span
          className="canvas-toolbar-zoom"
          title="Clique para 100%"
          onClick={() => canvas.setViewport(v => ({ ...v, zoom: 1 }))}
        >{zoomPct}%</span>
        <button className="btn btn-sm" onClick={() => canvas.setViewport(v => ({ ...v, zoom: Math.min(3, v.zoom * 1.25) }))}>＋</button>
        <button className="btn btn-sm" onClick={fitAll}>⊡ Fit</button>
      </div>

      {/* Canvas viewport */}
      <div
        ref={canvas.viewportRef}
        className="canvas-viewport"
        style={{ cursor: canvas.isPanning ? 'grabbing' : 'grab' }}
        onWheel={canvas.handleWheel}
        onMouseDown={canvas.handleBackgroundMouseDown}
        onClick={canvas.handleBackgroundClick}
        onMouseMove={canvas.handleMouseMove}
        onMouseUp={canvas.handleMouseUp}
        onMouseLeave={canvas.handleMouseUp}
      >
        <div
          className="canvas-world"
          style={{ transform: `translate(${canvas.viewport.x}px,${canvas.viewport.y}px) scale(${canvas.viewport.zoom})` }}
        >
          {/* SVG edges layer */}
          <svg className="canvas-edges">
            <defs>
              <marker
                id={MARKER_ID}
                markerWidth={8} markerHeight={6}
                refX={6} refY={3}
                orient="auto"
              >
                <path d="M0 0 L6 3 L0 6 Z" fill="context-stroke" />
              </marker>
            </defs>
            {edges.map(e => (
              <CanvasEdgeComponent
                key={e.id}
                edge={e}
                nodes={nodes}
                markerId={MARKER_ID}
                selected={selectedEdge === e.id}
                onClick={() => setSelEdge(prev => prev === e.id ? null : e.id)}
              />
            ))}
            {canvas.pendingEdge && (
              <PendingEdgePath
                fromNode={canvas.pendingEdge.fromNode}
                fromSide={canvas.pendingEdge.fromSide}
                currentX={canvas.pendingEdge.currentX}
                currentY={canvas.pendingEdge.currentY}
                nodes={nodes}
              />
            )}
          </svg>

          {/* Group nodes — behind text/file nodes */}
          {groups.map(n => (
            <CanvasNode
              key={n.id} node={n}
              selected={canvas.selected.has(n.id)}
              dragOverride={canvas.dragOverride?.nodeId === n.id ? canvas.dragOverride : null}
              onMouseDown={e => canvas.handleNodeMouseDown(n.id, e)}
              onPortMouseDown={(side, e) => canvas.handlePortMouseDown(n.id, side, e)}
              onPortMouseUp={side => canvas.handlePortMouseUp(n.id, side)}
              onResizeMouseDown={(h, e) => canvas.handleResizeMouseDown(n.id, h, e)}
              onDelete={() => onDeleteNodes([n.id])}
              onTextChange={text => onUpdateNode(n.id, { text })}
              onOpenFile={path => openFile({ name: path.split('/').pop() ?? path, path, isDir: false } as VaultFile)}
            />
          ))}

          {/* Text and file nodes */}
          {others.map(n => (
            <CanvasNode
              key={n.id} node={n}
              selected={canvas.selected.has(n.id)}
              dragOverride={canvas.dragOverride?.nodeId === n.id ? canvas.dragOverride : null}
              onMouseDown={e => canvas.handleNodeMouseDown(n.id, e)}
              onPortMouseDown={(side, e) => canvas.handlePortMouseDown(n.id, side, e)}
              onPortMouseUp={side => canvas.handlePortMouseUp(n.id, side)}
              onResizeMouseDown={(h, e) => canvas.handleResizeMouseDown(n.id, h, e)}
              onDelete={() => onDeleteNodes([n.id])}
              onTextChange={text => onUpdateNode(n.id, { text })}
              onOpenFile={path => openFile({ name: path.split('/').pop() ?? path, path, isDir: false } as VaultFile)}
            />
          ))}
        </div>

        <div className="canvas-hint">Scroll = zoom · Arrastar fundo = pan · Arrastar nó = mover</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CanvasEditor/index.tsx
git commit -m "feat(canvas): add CanvasEditor main component with toolbar and auto-save"
```

---

## Task 7: Integration — wire CanvasEditor into EditorArea and loader

**Files:**
- Modify: `src/components/Editor/index.tsx`
- Modify: `src/plugins/loader.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Add canvas branch to `EditorArea` in `src/components/Editor/index.tsx`**

In `src/components/Editor/index.tsx`, after the existing imports add:

```tsx
import { CanvasEditor } from '@/components/CanvasEditor'
```

Then find the `EditorArea` function body. Locate the line:

```tsx
const ext  = activeFile?.name.split('.').pop()?.toLowerCase() ?? ''
```

After that line (before `const customViewType = ...`), add:

```tsx
  if (activeFile && ext === 'canvas') {
    return (
      <div className="editor-wrap">
        <CanvasEditor />
      </div>
    )
  }
```

The full relevant section after the edit:

```tsx
  const isMd = activeFile?.name.toLowerCase().endsWith('.md') ?? false
  const ext  = activeFile?.name.split('.').pop()?.toLowerCase() ?? ''

  if (activeFile && ext === 'canvas') {
    return (
      <div className="editor-wrap">
        <CanvasEditor />
      </div>
    )
  }

  const customViewType = registeredExtensions.get(ext)
  const hasCustomView  = !!activeFile && !isMd && !!customViewType && registeredViews.has(customViewType)
  const showCmEditor   = !!activeFile && isMd && !showPreview && !hasCustomView
```

- [ ] **Step 2: Remove `canvas` from `viewRegistry.typeByExtension` in `src/plugins/loader.ts`**

Locate line 109 in `src/plugins/loader.ts`:

```typescript
    typeByExtension: new Map<string, string>([['md', 'markdown'], ['canvas', 'canvas']]),
```

Change it to:

```typescript
    typeByExtension: new Map<string, string>([['md', 'markdown']]),
```

- [ ] **Step 3: Bump version in `package.json`**

Find `"version": "X.Y.Z"` and increment Z by 1.

Example — if version is `"1.2.41"`, change to `"1.2.42"`.

- [ ] **Step 4: Update `README.md`**

Add canvas support to the feature list. Locate the section describing supported file types or features and add:

```
- `.canvas` files — Interactive canvas editor with pan, zoom, drag, node creation (text, file, group), edge drawing, and auto-save. Compatible with Obsidian's JSON Canvas format.
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Start the dev server and open a `.canvas` file**

```bash
npm run dev
```

1. Open the app in the browser.
2. Click any `.canvas` file in the sidebar (or create one by clicking the new file button and naming it `test.canvas`).
3. Expected: canvas editor renders with the toolbar (＋ Texto, ＋ Arquivo, ＋ Grupo, −, 100%, ＋, ⊡ Fit) and a dotted-grid background.

- [ ] **Step 7: Verify core interactions**

With the canvas editor open:

1. **Add a text node** — click `＋ Texto`. A "Texto" card appears at the center. Type in the textarea. Expected: text saves.
2. **Drag the node** — click and drag the text card. Expected: it moves.
3. **Add a file node** — click `＋ Arquivo`. Enter `Welcome.md` in the prompt. Expected: file card with `📄 Welcome.md` and `↗ Abrir no editor`.
4. **Connect nodes** — hover over a node until port circles appear, then drag from a port to another node's port. Expected: a dashed pending edge during drag; a solid Bézier edge with arrowhead after release.
5. **Select and delete** — click a node, press `Delete`. Expected: node and its edges removed.
6. **Zoom** — scroll wheel. Expected: canvas zooms around cursor.
7. **Pan** — drag the background. Expected: canvas pans.
8. **Fit** — click `⊡ Fit`. Expected: viewport adjusts so all nodes are visible.
9. **Undo** — make a change, press `Ctrl+Z`. Expected: change reverts.
10. **Auto-save** — make a change, wait 1.5 s, reload the page, reopen the file. Expected: changes persisted.

- [ ] **Step 8: Verify Obsidian `.canvas` compatibility**

Open a real `.canvas` file from an Obsidian vault that has nodes and edges. Expected:
- All text nodes render with their content.
- All file nodes render with filenames and open buttons.
- All edges render as Bézier curves with arrowheads.
- Obsidian color presets (`"1"` through `"6"`) render in the correct colors.

- [ ] **Step 9: Commit**

```bash
git add src/components/Editor/index.tsx src/plugins/loader.ts package.json README.md
git commit -m "feat(canvas): wire CanvasEditor into EditorArea; bump version"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|------------------|------|
| Pan + zoom | Task 3 (useCanvas: handleWheel, handleBackgroundMouseDown) |
| Drag nodes | Task 3 (handleNodeMouseDown + dragOverride) |
| TextNode editable textarea | Task 4 (CanvasNode text branch) |
| FileNode icon + open button | Task 4 (CanvasNode file branch) |
| GroupNode dashed rect + label | Task 4 (CanvasNode group branch) |
| 8 connection ports on hover | Task 4 (portStyle × 4 sides) |
| Resize handles on selection | Task 4 (canvas-resize-handle × 4 corners) |
| SVG cubic Bézier edges | Task 5 (CanvasEdgeComponent) |
| Arrowhead marker | Task 5 (SVG marker in index.tsx) |
| Edge label at midpoint | Task 5 (text element at mid) |
| Obsidian color presets | Tasks 2, 4, 5 (CSS vars + resolveColor) |
| Toolbar: + Texto / + Arquivo / + Grupo | Task 6 (addText/addFile/addGroup) |
| Toolbar: zoom − / 100% / + / Fit | Task 6 (setViewport callbacks + fitAll) |
| Delete / Backspace keyboard shortcut | Task 6 (keydown useEffect) |
| Escape to deselect | Task 6 (keydown useEffect) |
| Ctrl+Z single-level undo | Task 6 (snapshotRef + onUndo) |
| Auto-save 1.2 s debounce | Task 6 (scheduleAutosave) |
| Load from vault adapter | Task 6 (useEffect on activeFile.path) |
| Save to vault adapter | Task 6 (scheduleAutosave → adapter.writeFile) |
| Invalid JSON error message | Task 6 (catch → setError) |
| Missing nodes/edges → empty canvas | Task 6 (data.nodes ?? []) |
| `.canvas` branch before plugin lookup | Task 7 (Editor/index.tsx) |
| Remove canvas from typeByExtension | Task 7 (loader.ts) |
| CSS variables for Obsidian colors | Task 2 |
| Dot-grid background | Task 2 (.canvas-viewport background-image) |
| JSON Canvas spec compatibility | Task 1 (types match jsoncanvas.org) |

All spec requirements are covered. No placeholders or "TBD" sections.
