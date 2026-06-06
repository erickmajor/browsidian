# Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen overlay graph view showing wikilink and tag relationships between markdown files, triggered from the status bar.

**Architecture:** New `GraphView` React component lazy-loads D3 v7, reads graph data synchronously from the already-populated `MetadataCache` (no extra file I/O), and renders a force-directed SVG. Entry point is a new icon button in `StatusBar`. All four vault modes work because `MetadataCache` is populated after every vault load.

**Tech Stack:** D3 v7, React, TypeScript, existing `MetadataCache` singleton from `src/plugins/loader.ts`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/GraphView/buildGraph.ts` | Create | Data extraction: flatten tree, resolve wikilinks, collect tags, return `{nodes, edges}` |
| `src/components/GraphView/index.tsx` | Create | React overlay component: D3 lazy-load, force simulation, zoom/pan, search, node click |
| `src/stores/ui.ts` | Modify | Add `graphOpen: boolean` + `setGraphOpen` |
| `src/components/StatusBar.tsx` | Modify | Add graph icon button |
| `src/App.tsx` | Modify | Import and conditionally render `<GraphView>` |
| `src/styles/global.css` | Modify | Add `.graph-overlay`, `.graph-container`, `.graph-toolbar`, `.graph-search`, `.graph-svg`, `.graph-loading`, `.graph-tooltip` |
| `package.json` | Modify | Add `d3` + `@types/d3` dependencies, bump version |
| `README.md` | Modify | Document graph view feature |

---

## Task 1: Install D3 and bump version

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install D3**

```bash
npm install d3
npm install --save-dev @types/d3
```

Expected: `node_modules/d3` present, `package.json` shows `"d3": "^7.x.x"` in dependencies and `"@types/d3"` in devDependencies.

- [ ] **Step 2: Bump version in package.json**

Open `package.json` and increment the patch version (e.g., `1.2.70` → `1.2.71`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add d3 v7 dependency for graph view"
```

---

## Task 2: Add `graphOpen` state to UI store

**Files:**
- Modify: `src/stores/ui.ts`

- [ ] **Step 1: Add `graphOpen` field to `UIStore` interface**

In `src/stores/ui.ts`, the current `UIStore` interface ends with `hideContextMenu(): void`. Add two new members:

```ts
interface UIStore {
  status: string
  theme: Theme
  draggingPath: string | null
  contextMenuPath: string | null
  contextMenuPos: { x: number; y: number } | null
  graphOpen: boolean                          // ← new

  setStatus(msg: string): void
  setTheme(theme: Theme): void
  toggleTheme(): void
  setDragging(path: string | null): void
  showContextMenu(path: string, x: number, y: number): void
  hideContextMenu(): void
  setGraphOpen(v: boolean): void              // ← new
}
```

- [ ] **Step 2: Add state value and action to the store**

Inside `create<UIStore>((set, get) => { return { ... } })`, add after `hideContextMenu`:

```ts
    graphOpen: false,
    setGraphOpen(v) { set({ graphOpen: v }) },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 4: Commit**

```bash
git add src/stores/ui.ts
git commit -m "feat(ui-store): add graphOpen state for graph view overlay"
```

---

## Task 3: Add graph CSS rules

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Append graph CSS at the end of global.css**

Open `src/styles/global.css` and append after the last rule:

```css
/* ─── Graph view overlay ─────────────────────────────────────────────────── */
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
.graph-svg-wrap { position: relative; flex: 1; }
.graph-svg { display: block; width: 100%; height: 100%; }
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

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(styles): add graph view overlay CSS"
```

---

## Task 4: Create `buildGraph.ts`

**Files:**
- Create: `src/components/GraphView/buildGraph.ts`

`buildGraph` reads entirely from the already-populated `MetadataCache` — no file I/O. Tags in `CachedMetadata` are stored as `Array<{ tag: string }>` where `tag` already has the `#` prefix (e.g. `"#map-of-contents"`). Wikilinks are stored as `Array<{ link: string; original: string }>` where `link` is the raw target text without `[[]]`.

- [ ] **Step 1: Create the file with complete implementation**

Create `src/components/GraphView/buildGraph.ts`:

```ts
import type { VaultFile } from '@/stores/vault'
import type { MetadataCache } from '@/plugins/shim/index'

export interface GraphNode {
  id: string       // file path or tag string (e.g. '#ideas')
  label: string    // file basename without .md, or tag string
  type: 'file' | 'tag'
}

export interface GraphEdge {
  source: string   // GraphNode.id  (D3 replaces with object ref at runtime)
  target: string
}

function flattenMdFiles(tree: VaultFile[]): VaultFile[] {
  const out: VaultFile[] = []
  for (const f of tree) {
    if (f.isDir) out.push(...flattenMdFiles(f.children ?? []))
    else if (f.name.toLowerCase().endsWith('.md')) out.push(f)
  }
  return out
}

export function buildGraph(
  tree: VaultFile[],
  metadataCache: MetadataCache,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const files = flattenMdFiles(tree)

  // Build name→path lookup for wikilink resolution (case-insensitive basename without .md)
  const nameMap = new Map<string, string>()
  const pathSet = new Set<string>()
  for (const f of files) {
    pathSet.add(f.path)
    const key = f.name.replace(/\.md$/i, '').toLowerCase()
    if (!nameMap.has(key)) nameMap.set(key, f.path)
  }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const tagNodeIds = new Set<string>()

  for (const f of files) {
    nodes.push({ id: f.path, label: f.name.replace(/\.md$/i, ''), type: 'file' })

    const cached = metadataCache.getCache(f.path)
    if (!cached) continue

    // Wikilink edges: link text → resolved path
    for (const { link } of cached.links ?? []) {
      const raw = link.split('#')[0].trim()
      if (!raw) continue
      let target: string | undefined
      if (pathSet.has(raw)) {
        target = raw
      } else {
        target = nameMap.get(raw.replace(/\.md$/i, '').toLowerCase())
      }
      if (target && target !== f.path) {
        edges.push({ source: f.path, target })
      }
    }

    // Tag edges: file → tag node
    for (const { tag } of cached.tags ?? []) {
      if (!tagNodeIds.has(tag)) {
        tagNodeIds.add(tag)
        nodes.push({ id: tag, label: tag, type: 'tag' })
      }
      edges.push({ source: f.path, target: tag })
    }
  }

  return { nodes, edges }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/GraphView/buildGraph.ts
git commit -m "feat(graph): add buildGraph data extraction from MetadataCache"
```

---

## Task 5: Create `GraphView` component

**Files:**
- Create: `src/components/GraphView/index.tsx`

The component lazy-loads D3, calls `buildGraph` synchronously, then calls `renderGraph` (a module-level function defined in the same file but not exported). The `renderGraph` function builds the D3 force simulation and SVG elements.

Key details:
- `d3Ref` stores the D3 module for use in the search `useEffect` (avoids re-importing)
- `tooltipRef` points to `.graph-tooltip` div — passed to `renderGraph` so D3 handlers can show/hide it directly (avoids React re-render on every mousemove)
- `handleNodeClick` uses `useCallback` so it has a stable reference
- `svgRef` must be non-null when `renderGraph` is called (it is, because `useEffect` runs after mount)

- [ ] **Step 1: Create the component file**

Create `src/components/GraphView/index.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { useVaultStore } from '@/stores/vault'
import { metadataCache } from '@/plugins/loader'
import { buildGraph } from './buildGraph'
import type { GraphNode, GraphEdge } from './buildGraph'

interface GraphViewProps {
  onClose: () => void
}

function renderGraph(
  d3: any,
  svg: SVGSVGElement,
  tooltip: HTMLDivElement,
  data: { nodes: GraphNode[]; edges: GraphEdge[] },
  onNodeClick: (node: GraphNode) => void,
): void {
  const { width, height } = svg.getBoundingClientRect()

  // Glow filter for file nodes
  const defs = d3.select(svg).append('defs')
  const filter = defs.append('filter').attr('id', 'node-glow')
  filter.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'coloredBlur')
  const merge = filter.append('feMerge')
  merge.append('feMergeNode').attr('in', 'coloredBlur')
  merge.append('feMergeNode').attr('in', 'SourceGraphic')

  // Zoom + pan: all rendered elements go inside <g> that zoom transforms
  const g = d3.select(svg).append('g')
  d3.select(svg).call(
    d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (e: any) => g.attr('transform', e.transform)),
  )

  // D3 mutates node objects in-place (adds x, y, vx, vy) — clone to avoid mutating props
  const nodes: any[] = data.nodes.map(n => ({ ...n }))
  const edges: any[] = data.edges.map(e => ({ ...e }))

  const sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(90).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-250))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(22))

  const link = g.append('g')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('stroke', '#89b4fa')
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.25)

  const node = g.append('g')
    .selectAll<SVGCircleElement, GraphNode>('circle')
    .data(nodes)
    .join('circle')
    .attr('r', (d: GraphNode) => d.type === 'file' ? 10 : 6)
    .attr('fill', (d: GraphNode) => d.type === 'file' ? '#89b4fa' : '#a6e3a1')
    .attr('fill-opacity', (d: GraphNode) => d.type === 'file' ? 0.9 : 0.75)
    .attr('filter', (d: GraphNode) => d.type === 'file' ? 'url(#node-glow)' : null)
    .attr('stroke', 'none')
    .style('cursor', (d: GraphNode) => d.type === 'file' ? 'pointer' : 'default')
    .on('click', (_: any, d: GraphNode) => onNodeClick(d))
    .on('mouseover', (event: MouseEvent, d: GraphNode) => {
      tooltip.style.left = (event.clientX + 12) + 'px'
      tooltip.style.top  = (event.clientY - 6) + 'px'
      tooltip.textContent = d.label
      tooltip.style.display = 'block'
    })
    .on('mouseout', () => { tooltip.style.display = 'none' })
    .call(
      d3.drag<SVGCircleElement, any>()
        .on('start', (e: any, d: any) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (e: any, d: any) => { d.fx = e.x; d.fy = e.y })
        .on('end',   (e: any, d: any) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }),
    )

  const label = g.append('g')
    .selectAll<SVGTextElement, GraphNode>('text')
    .data(nodes.filter((d: GraphNode) => d.type === 'file'))
    .join('text')
    .text((d: GraphNode) => d.label)
    .attr('font-size', 10)
    .attr('fill', '#cdd6f4')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')

  sim.on('tick', () => {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)
    node
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)
    label
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y - 14)
  })
}

export function GraphView({ onClose }: GraphViewProps) {
  const tree     = useVaultStore(s => s.tree)
  const openFile = useVaultStore(s => s.openFile)

  const svgRef     = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const d3Ref      = useRef<any>(null)

  const [loading,     setLoading]     = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (node.type !== 'file') return
    void openFile({ name: node.id.split('/').pop() ?? node.id, path: node.id, isDir: false })
    onClose()
  }, [openFile, onClose])

  // Build graph + load D3 on mount
  useEffect(() => {
    const graphData = buildGraph(tree, metadataCache)
    import('d3').then(d3 => {
      d3Ref.current = d3
      setLoading(false)
      if (svgRef.current && tooltipRef.current) {
        renderGraph(d3, svgRef.current, tooltipRef.current, graphData, handleNodeClick)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Search: fade non-matching nodes
  useEffect(() => {
    if (!d3Ref.current || !svgRef.current) return
    const d3 = d3Ref.current
    const q = searchQuery.toLowerCase()
    d3.select(svgRef.current).selectAll<SVGCircleElement, GraphNode>('circle')
      .attr('fill-opacity', (d: GraphNode) =>
        !q || d.label.toLowerCase().includes(q) ? (d.type === 'file' ? 0.9 : 0.75) : 0.1)
    d3.select(svgRef.current).selectAll<SVGTextElement, GraphNode>('text')
      .attr('fill-opacity', (d: GraphNode) =>
        !q || d.label.toLowerCase().includes(q) ? 1 : 0.1)
  }, [searchQuery])

  return (
    <div className="graph-overlay" onClick={onClose}>
      <div className="graph-container" onClick={e => e.stopPropagation()}>
        <div className="graph-toolbar">
          <input
            className="graph-search"
            placeholder="Buscar arquivo ou tag…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
          <button className="btn btn-ghost" onClick={onClose} title="Fechar (Esc)">✕</button>
        </div>
        <div className="graph-svg-wrap">
          {loading && <div className="graph-loading">Construindo grafo…</div>}
          <svg ref={svgRef} className="graph-svg" />
        </div>
        <div ref={tooltipRef} className="graph-tooltip" style={{ display: 'none' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/GraphView/index.tsx src/components/GraphView/buildGraph.ts
git commit -m "feat(graph): add GraphView overlay component with D3 force simulation"
```

---

## Task 6: Add graph button to StatusBar

**Files:**
- Modify: `src/components/StatusBar.tsx`

- [ ] **Step 1: Add GraphIcon SVG component**

In `src/components/StatusBar.tsx`, after the `PluginIcon` component definition (around line 30), add:

```tsx
const GraphIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="2" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="19" r="2" />
    <line x1="12" y1="7" x2="5" y2="17" />
    <line x1="12" y1="7" x2="19" y2="17" />
    <line x1="5" y1="19" x2="19" y2="19" />
  </svg>
)
```

- [ ] **Step 2: Destructure `setGraphOpen` from `useUIStore`**

Change the existing destructuring at the top of `StatusBar`:

```tsx
// Before:
const { status, theme, toggleTheme } = useUIStore()

// After:
const { status, theme, toggleTheme, setGraphOpen } = useUIStore()
```

- [ ] **Step 3: Add the graph button before the plugin manager button**

In the JSX, locate the `<button>` with `className="btn btn-ghost plugin-manager-btn"` and insert the graph button immediately before it:

```tsx
        <button
          className="btn btn-ghost"
          title="Graph view"
          onClick={() => setGraphOpen(true)}
        >
          <GraphIcon />
        </button>
        <button
          className="btn btn-ghost plugin-manager-btn"
          title="Plugins"
          onClick={() => setManagerOpen(true)}
        >
          <PluginIcon />
        </button>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/StatusBar.tsx
git commit -m "feat(statusbar): add graph view toggle button"
```

---

## Task 7: Wire GraphView into App + update README

**Files:**
- Modify: `src/App.tsx`
- Modify: `README.md`

- [ ] **Step 1: Import GraphView in App.tsx**

In `src/App.tsx`, add this import after the existing component imports (e.g., after the `PluginManager` import line):

```tsx
import { GraphView } from '@/components/GraphView'
```

- [ ] **Step 2: Destructure `graphOpen` and `setGraphOpen` from `useUIStore`**

Change the existing destructuring:

```tsx
// Before:
const { setStatus } = useUIStore()

// After:
const { setStatus, graphOpen, setGraphOpen } = useUIStore()
```

- [ ] **Step 3: Render GraphView inside the vault-open section**

In the `return` block (the one that renders when `vaultPath` is set), add `<GraphView>` after `<PluginManager />`:

```tsx
      <PluginManager />
      {graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}
```

The full updated section looks like:

```tsx
      <ContextMenu />
      <PluginManager />
      {graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}

      <PromptDialog
```

- [ ] **Step 4: Update README.md**

In `README.md`, inside the Features list (which starts with `- Browse vault folders...`), add after the Dataview fix bullet:

```markdown
- **Graph view:** Click the graph icon in the status bar to open a full-screen force-directed graph showing wikilink connections and shared tags between markdown files. Supports zoom, pan, drag, node click to open file, and search/filter.
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx README.md
git commit -m "feat(graph): wire GraphView into App and document in README"
```

---

## Task 8: Manual verification

No automated test suite exists. Verify these scenarios by running the app:

```bash
npm run dev:electron
# or for web mode:
npm start
```

- [ ] **Scenario 1: Graph opens**
  - Load a vault with at least 2 markdown files
  - Click the graph icon (connected nodes icon) in the status bar
  - Expected: full-screen dark overlay appears, "Construindo grafo…" shown briefly, then nodes appear

- [ ] **Scenario 2: Nodes appear correctly**
  - File nodes: blue circles (larger, with glow)
  - Tag nodes: green circles (smaller, no glow)
  - Node labels show file names without `.md`
  - Lines connect linked files and files to their tags

- [ ] **Scenario 3: Close behaviour**
  - Press `Esc` → overlay closes
  - Click the backdrop (outside the white panel) → overlay closes
  - Click the `✕` button → overlay closes

- [ ] **Scenario 4: Node click opens file**
  - Click a file node → overlay closes → that file opens in the editor

- [ ] **Scenario 5: Search filter**
  - Type a partial filename in the search box
  - Matching nodes stay visible; non-matching nodes fade to nearly invisible
  - Clear the search → all nodes return to full opacity

- [ ] **Scenario 6: Zoom and pan**
  - Scroll wheel over the graph → zooms in/out
  - Click and drag on empty space → pans the graph
  - Drag a node → it moves; releasing lets the simulation resume

- [ ] **Scenario 7: Demo vault (no wikilinks)**
  - Open demo vault
  - Open graph view
  - Expected: file nodes appear as isolated circles (no edges); no crash

- [ ] **Scenario 8: Light theme**
  - Toggle to light theme, open graph view
  - Expected: overlay background and container use light theme CSS variables; no visual glitches

- [ ] **Step: Final version bump and commit**

```bash
# In package.json, increment version once more for the final state
git add package.json
git commit -m "chore: bump version to x.x.x for graph view release"
```
