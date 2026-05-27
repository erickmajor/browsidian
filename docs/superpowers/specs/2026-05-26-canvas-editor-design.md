# Canvas Editor — Implementation Design

## Goal

Add native `.canvas` file support to Browsidian: a full interactive canvas editor with pan, zoom, drag, node creation/deletion, and edge drawing. Compatible with Obsidian's `.canvas` (JSON Canvas) format.

## Architecture

The `CanvasEditor` is a native React component — not a plugin. `EditorArea` detects the `.canvas` extension and renders it directly before any plugin lookup. File I/O goes through the existing vault adapter (works in all modes: server, browser, electron, demo).

### New files

```
src/components/CanvasEditor/
  index.tsx       — top-level component; loads/saves JSON, owns canvas state
  CanvasNode.tsx  — renders a single node (text | file | group)
  CanvasEdge.tsx  — SVG cubic Bézier path + arrowhead between two nodes
  useCanvas.ts    — hook: viewport (pan/zoom), drag, selection, edge-drawing state
  types.ts        — TypeScript types matching the JSON Canvas spec
```

### Modified files

| File | Change |
|------|--------|
| `src/components/Editor/index.tsx` | Add `if (ext === 'canvas') return <CanvasEditor />` before plugin lookup |
| `src/plugins/shim/index.ts` | Remove `['canvas', 'canvas']` from `typeByExtension` (now handled natively) |

## Data Model — JSON Canvas spec

Follows [jsoncanvas.org](https://jsoncanvas.org/) exactly for Obsidian compatibility.

```typescript
// src/components/CanvasEditor/types.ts

export interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export type CanvasNode = TextNode | FileNode | GroupNode

export interface BaseNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  color?: string   // hex or Obsidian preset ("1"–"6")
}

export interface TextNode extends BaseNode {
  type: 'text'
  text: string
}

export interface FileNode extends BaseNode {
  type: 'file'
  file: string     // vault-relative path
  subpath?: string // optional heading/block anchor
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

## Component Design

### `index.tsx` — CanvasEditor

Responsibilities:
- Load `.canvas` JSON from vault adapter on mount (parse, show error on invalid JSON)
- Own `nodes`, `edges`, `isDirty` state
- Schedule auto-save 1.2 s after last mutation (same interval as markdown editor)
- Render: toolbar + viewport div + `<CanvasNode>` per node + SVG overlay with `<CanvasEdge>` per edge

```tsx
// Simplified structure
<div className="canvas-editor">
  <CanvasToolbar onAddText={...} onAddFile={...} zoom={vp.zoom} onZoomReset={...} onFit={...} />
  <div
    className="canvas-viewport"
    onWheel={handleWheel}
    onMouseDown={handleBackgroundMouseDown}
    style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
  >
    <div
      className="canvas-world"
      style={{ transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` }}
    >
      {/* Group nodes first (behind everything) */}
      {groups.map(n => <CanvasNode key={n.id} ... />)}
      {/* Text and file nodes */}
      {otherNodes.map(n => <CanvasNode key={n.id} ... />)}
      {/* SVG edges overlay — same coordinate space as nodes */}
      <svg className="canvas-edges">
        {edges.map(e => <CanvasEdge key={e.id} edge={e} nodes={nodes} ... />)}
        {pendingEdge && <PendingEdgePath ... />}
      </svg>
    </div>
  </div>
</div>
```

### `useCanvas.ts` — Viewport & interaction hook

State managed by this hook:
- `viewport: { x, y, zoom }` — pan/zoom transform
- `dragging: { nodeId, startX, startY, origX, origY } | null`
- `selected: Set<string>` — selected node/edge IDs
- `pendingEdge: { fromNode, fromSide, currentX, currentY } | null` — in-progress connection

Key handlers:
- `handleWheel(e)` — zoom around cursor point: `newZoom = clamp(zoom * factor, 0.1, 3)`, adjust `x/y` to keep cursor fixed
- `handleBackgroundMouseDown(e)` — start pan
- `handleNodeMouseDown(nodeId, e)` — start drag; stops propagation (no pan)
- `handleEdgePortMouseDown(nodeId, side, e)` — start edge drawing
- `handleMouseMove(e)` — update pan / drag / pendingEdge
- `handleMouseUp(e)` — commit drag, finalize edge if dropped on a port

### `CanvasNode.tsx`

Props: `node`, `selected`, `onSelect`, `onDragStart`, `onPortMouseDown`, `onDelete`, `onTextChange`, `onOpenFile`

Renders based on `node.type`:

**TextNode**: bordered card with a `<textarea>` (auto-resize, edits call `onTextChange`). Double-click to focus.

**FileNode**: bordered card with file icon + filename + "↗ Abrir no editor" link (calls `onOpenFile(node.file)`). Missing file shows broken icon.

**GroupNode**: transparent rectangle with dashed border + optional label. Rendered behind other nodes via z-index.

All nodes: 8 connection ports (one per side, center of each edge) shown on hover as small circles. Dragging a port starts edge creation.

Resize: 4-corner handles on selected nodes. Drag resizes `width`/`height` (minimum 80×60).

### `CanvasEdge.tsx`

Computes connection point from `fromSide` on source node and `toSide` on target node (center of the specified edge). Draws a cubic Bézier: control points offset 80px in the direction of the side.

```
fromSide=right  → control point: (nodeRight + 80, nodeCenterY)
toSide=left     → control point: (nodeLeft  - 80, nodeCenterY)
```

Arrowhead rendered as SVG `<marker>` at the `to` end. Optional `label` drawn at midpoint of curve using `<textPath>`.

Color resolves: Obsidian preset `"1"–"6"` → CSS variable (`--canvas-color-1` etc), hex `#rrggbb` → direct, absent → `--muted`.

## Toolbar

| Control | Action |
|---------|--------|
| `+ Texto` | Add TextNode at viewport center, 250×140, empty text |
| `+ Arquivo` | Open sidebar file picker; selecting a file adds a FileNode |
| `+ Grupo` | Add GroupNode at viewport center, 400×300 |
| `−` / `+` | Zoom out / in by 25% |
| `100%` label | Shows current zoom; click resets to 100% |
| `⊡ Fit` | Fit all nodes into viewport (compute bounding box, adjust zoom + pan) |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete selected nodes/edges |
| `Escape` | Deselect all; cancel pending edge |
| `Ctrl+Z` | Undo (single level — store previous state snapshot) |

## Auto-save

Same pattern as markdown editor: 1.2 s debounce after any mutation. Serializes `{ nodes, edges }` to JSON (2-space indent) and calls `adapter.writeFile(activeFile.path, json)`.

## Error States

| Situation | Behavior |
|-----------|----------|
| Invalid / empty JSON | Show centered error message: "Canvas inválido. O arquivo pode estar corrompido." |
| `nodes`/`edges` missing | Treat as empty canvas `{ nodes: [], edges: [] }` |
| FileNode references missing file | Show broken icon + italic filename; "Abrir" button disabled |
| Save fails | Show toast via existing `setStatus()` |

## CSS

New variables added to `global.css` under both dark and light themes:

```css
--canvas-bg: <dot-grid background>
--canvas-node-bg: var(--panel)
--canvas-node-border: var(--border)
--canvas-color-1: #e03131   /* Obsidian red */
--canvas-color-2: #e8590c   /* orange */
--canvas-color-3: #f08c00   /* yellow */
--canvas-color-4: #2f9e44   /* green */
--canvas-color-5: #1971c2   /* blue */
--canvas-color-6: #7048e8   /* purple */
```

All other canvas styling uses existing tokens (`--bg`, `--panel`, `--border`, `--accent`, `--text`, `--muted`).

## Out of Scope

- Embedding rendered markdown inside file nodes (Option A — declined)
- Image/video/URL embed nodes
- Canvas-to-image export
- Collaborative editing
- Undo beyond single level
