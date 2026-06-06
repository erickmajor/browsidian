# Graph View Implementation Design

**Goal:** Add a full-screen overlay that visualises relationships between markdown files as a force-directed graph (wikilinks + shared tags as edges).

**Architecture:** New `GraphView` React component lazy-loads D3 v7, builds a node/edge dataset from vault data, and renders an interactive SVG. Entry point is a button in the status bar. All four vault modes (server, browser, demo, dropbox) are supported.

**Tech Stack:** D3 v7 (force simulation, zoom, drag), React (overlay component), existing `MetadataCache` (tags), adapter `readFile` (wikilink extraction).

---

## 1. Entry Point

A new icon button is added to `StatusBar.tsx` (left of the existing plugin manager ⬡ button). Clicking it toggles `graphOpen` in `useUIStore`. The icon is a small SVG of connected nodes (3 circles joined by lines, consistent with the existing flat SVG icon style).

`src/stores/ui.ts` gains two fields:
```ts
graphOpen: boolean        // default false
setGraphOpen(v: boolean): void
```

---

## 2. New Files

### `src/components/GraphView/buildGraph.ts`

Exports one async function:

```ts
export async function buildGraph(
  adapter: VaultAdapter,
  files: VaultFile[],          // all .md files from vault tree
  metadataCache: MetadataCache
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
```

**Algorithm:**

1. Read all `.md` file contents in parallel via `Promise.all(files.map(f => adapter.readFile(f.path).catch(() => '')))`.
2. For each file, extract wikilinks with `/\[\[([^\]|#\n]+)/g` — captures the target name before any `|`, `#`, or `]`.
3. Resolve each wikilink target to a file path: exact path match first, then file index lookup (same logic as `resolveWikilink` in vault store but synchronous against a pre-built name→path map).
4. From `metadataCache`, read `tags[]` per file (already populated after vault load).
5. Build nodes:
   - One `{ id: file.path, label: basename(file.path, '.md'), type: 'file' }` per markdown file.
   - One `{ id: '#' + tag, label: '#' + tag, type: 'tag' }` per unique tag across all files (deduplicated).
6. Build edges:
   - `{ source: sourcePath, target: resolvedPath }` for each resolved wikilink (skip unresolvable links silently).
   - `{ source: filePath, target: '#' + tag }` for each file→tag association.
7. Return `{ nodes, edges }`. Nodes with no edges are included (isolated nodes).

**Types:**
```ts
export interface GraphNode {
  id: string
  label: string
  type: 'file' | 'tag'
  // D3 adds: x, y, vx, vy, fx, fy at runtime
}
export interface GraphEdge {
  source: string   // node id (D3 replaces with object reference at runtime)
  target: string
}
```

### `src/components/GraphView/index.tsx`

Full-screen overlay React component.

**Props:**
```ts
interface GraphViewProps {
  onClose: () => void
}
```

**State / refs:**
- `loading: boolean` — true while D3 + graph data are loading
- `searchQuery: string` — controlled input for node filter
- `graphDataRef: useRef<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>` — stores the D3-mutated graph data (D3 adds x/y/vx/vy to nodes in-place); needed by the search `useEffect` without re-running the simulation
- `d3Ref: useRef<typeof import('d3') | null>` — D3 module stored after lazy import so search `useEffect` can call `d3.select` without re-importing
- `svgRef: useRef<SVGSVGElement | null>` — target for D3 rendering
- `tooltipEl: useRef<HTMLDivElement | null>` — the `.graph-tooltip` div for hover labels

**Data sources (obtained via hooks at component top):**
- `adapter`, `vaultPath` — from `useVaultStore()`
- `mdFiles` — `useVaultStore(s => s.tree)` flattened to only `.md` files (`flattenTree` helper or filter on `isDir === false && name.endsWith('.md')`)
- `metadataCache` — imported directly from `src/plugins/loader.ts` (already a module singleton)

**Lifecycle (`useEffect`, runs once on mount):**
```ts
Promise.all([import('d3'), buildGraph(adapter, mdFiles, metadataCache)])
  .then(([d3, data]) => {
    graphDataRef.current = data
    setLoading(false)
    renderGraph(svgRef.current, d3, data, handleNodeClick)
  })
```

`handleNodeClick(node: GraphNode)`:
- If `node.type === 'file'`: call `openFile({ path: node.id, name: basename(node.id), isDir: false })` then `onClose()`.
- If `node.type === 'tag'`: no-op.

**Esc handler:** `window.addEventListener('keydown', e => e.key === 'Escape' && onClose())` — cleaned up on unmount.

**DOM structure:**
```
div.graph-overlay          ← semi-transparent backdrop, click → onClose
  div.graph-container      ← stopPropagation, white-box panel filling ~95vw × 95vh
    div.graph-toolbar      ← top bar: search input + close button
    svg.graph-svg          ← D3 renders here, fills remaining height
    div.graph-loading      ← spinner shown while loading=true, hidden after
    div.graph-tooltip      ← absolute-positioned, shown on node hover
```

**`renderGraph` function (inside index.tsx, not exported):**

```ts
function renderGraph(svg, d3, data, onNodeClick) {
  const { width, height } = svg.getBoundingClientRect()

  // Zoom + pan
  const zoom = d3.zoom().scaleExtent([0.1, 8]).on('zoom', e => g.attr('transform', e.transform))
  d3.select(svg).call(zoom)

  const g = d3.select(svg).append('g')  // zoomable group

  // Force simulation
  const sim = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.edges).id(d => d.id).distance(90).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-250))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(20))

  // Edges
  const link = g.append('g').selectAll('line')
    .data(data.edges).join('line')
    .attr('stroke', '#89b4fa').attr('stroke-width', 1).attr('stroke-opacity', 0.25)

  // File nodes: circles with glow filter
  // Tag nodes: smaller circles without glow
  const node = g.append('g').selectAll('circle')
    .data(data.nodes).join('circle')
    .attr('r', d => d.type === 'file' ? 10 : 6)
    .attr('fill', d => d.type === 'file' ? '#89b4fa' : '#a6e3a1')
    .attr('fill-opacity', d => d.type === 'file' ? 0.9 : 0.75)
    .attr('filter', d => d.type === 'file' ? 'url(#glow)' : null)
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end',   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }))
    .on('click', (_, d) => onNodeClick(d))
    .on('mouseover', (event, d) => {
      // position tooltip div near cursor, set textContent to d.label
      tooltipEl.style.left = (event.clientX + 12) + 'px'
      tooltipEl.style.top  = (event.clientY - 6) + 'px'
      tooltipEl.textContent = d.label
      tooltipEl.style.display = 'block'
    })
    .on('mouseout', () => { tooltipEl.style.display = 'none' })
    .style('cursor', d => d.type === 'file' ? 'pointer' : 'default')

  // Labels (file name only, hidden for tag nodes to reduce noise)
  const label = g.append('g').selectAll('text')
    .data(data.nodes.filter(d => d.type === 'file')).join('text')
    .text(d => d.label)
    .attr('font-size', 10).attr('fill', '#cdd6f4').attr('text-anchor', 'middle')
    .attr('dy', d => -14).attr('pointer-events', 'none')

  // SVG defs: glow filter
  d3.select(svg).append('defs').append('filter').attr('id', 'glow')
    // feGaussianBlur + feMerge for glow effect

  sim.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
    node.attr('cx', d => d.x).attr('cy', d => d.y)
    label.attr('x', d => d.x).attr('y', d => d.y)
  })
}
```

---

## 3. Search / Filter

`searchQuery` state is bound to the `<input>` in `.graph-toolbar`. On change, a `useEffect` updates SVG node opacity:

```ts
useEffect(() => {
  if (!svgRef.current || !graphDataRef.current) return
  const q = searchQuery.toLowerCase()
  // d3 must be kept in a ref (d3Ref) so the search effect can call d3.select without re-importing
  d3Ref.current.select(svgRef.current).selectAll('circle')
    .attr('fill-opacity', (d: GraphNode) =>
      !q || d.label.toLowerCase().includes(q) ? (d.type === 'file' ? 0.9 : 0.75) : 0.1)
  d3Ref.current.select(svgRef.current).selectAll('text')
    .attr('fill-opacity', (d: GraphNode) => !q || d.label.toLowerCase().includes(q) ? 1 : 0.1)
}, [searchQuery])
```

---

## 4. CSS

New rules in `src/styles/global.css`:

```css
/* Graph overlay */
.graph-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0, 0, 0, 0.75);
  display: flex; align-items: center; justify-content: center;
}
.graph-container {
  width: 95vw; height: 95vh;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-dialog);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.graph-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.graph-search {
  flex: 1;
  background: var(--control-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  padding: 4px 10px;
  color: var(--text);
  font-size: 13px;
}
.graph-search:focus { border-color: var(--focus-border); outline: none; }
.graph-svg { flex: 1; width: 100%; display: block; }
.graph-loading {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--muted); font-size: 13px; pointer-events: none;
}
.graph-tooltip {
  position: fixed; z-index: 210;
  background: var(--panel); border: 1px solid var(--border);
  border-radius: var(--radius-control);
  padding: 4px 8px; font-size: 11px; color: var(--text);
  pointer-events: none; white-space: nowrap;
}
```

---

## 5. Modified Files Summary

| File | Change |
|------|--------|
| `src/stores/ui.ts` | Add `graphOpen`, `setGraphOpen` |
| `src/components/StatusBar.tsx` | Add graph toggle button (SVG icon) |
| `src/components/GraphView/index.tsx` | New — overlay component |
| `src/components/GraphView/buildGraph.ts` | New — data extraction |
| `src/styles/global.css` | New graph CSS rules |
| `src/App.tsx` | Render `<GraphView>` when `graphOpen` is true |
| `package.json` | Add `d3` dependency, bump version |

---

## 6. Behaviour Summary

| Scenario | Result |
|----------|--------|
| No wikilinks in vault | All file nodes shown as isolated; tag edges shown if tags exist |
| Unresolvable wikilink target | Edge silently dropped |
| File read error during graph build | File's edges skipped; node still shown |
| Click file node | File opens in editor, overlay closes |
| Click tag node | No action |
| Press Esc / click backdrop | Overlay closes |
| Type in search | Non-matching nodes fade to 10% opacity |
| Zoom / pan | Standard D3 zoom behaviour (scroll wheel, drag canvas) |
| Drag node | Node repositioned; simulation resumes when released |
