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

  useEffect(() => {
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
    }
  }, [])

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
    snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
    setNodes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...patch } as CanvasNodeType : n)
      scheduleAutosave(next, edgesRef.current)
      return next
    })
  }, [scheduleAutosave])

  const onAddEdge = useCallback((edge: CanvasEdge) => {
    snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
    setEdges(prev => {
      const next = [...prev, edge]
      scheduleAutosave(nodesRef.current, next)
      return next
    })
  }, [scheduleAutosave])

  const onDeleteNodes = useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    snapshotRef.current = { nodes: nodesRef.current, edges: edgesRef.current }
    const nextN = nodesRef.current.filter(n => !idSet.has(n.id))
    const nextE = edgesRef.current.filter(e => !idSet.has(e.fromNode) && !idSet.has(e.toNode))
    setNodes(nextN)
    setEdges(nextE)
    scheduleAutosave(nextN, nextE)
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
  }, [canvas.selected, canvas.setSelected, canvas.setPendingEdge, selectedEdge, onDeleteNodes, onDeleteEdges, onUndo])

  // ── Native wheel listener (passive: false required for preventDefault) ────
  useEffect(() => {
    const el = canvas.viewportRef.current
    if (!el) return
    el.addEventListener('wheel', canvas.handleWheelNative, { passive: false })
    return () => el.removeEventListener('wheel', canvas.handleWheelNative)
  }, [canvas.viewportRef, canvas.handleWheelNative])

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

  const effectiveNodes = nodes.map(n => {
    if (canvas.dragOverride?.nodeId === n.id) {
      return { ...n, x: canvas.dragOverride.x, y: canvas.dragOverride.y }
    }
    if (canvas.resizeOverride?.nodeId === n.id) {
      return { ...n, x: canvas.resizeOverride.x, y: canvas.resizeOverride.y, width: canvas.resizeOverride.width, height: canvas.resizeOverride.height }
    }
    return n
  })

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
                nodes={effectiveNodes}
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
                nodes={effectiveNodes}
              />
            )}
          </svg>

          {/* Group nodes — behind text/file nodes */}
          {groups.map(n => (
            <CanvasNode
              key={n.id} node={n}
              selected={canvas.selected.has(n.id)}
              dragOverride={canvas.dragOverride?.nodeId === n.id ? canvas.dragOverride : null}
              resizeOverride={canvas.resizeOverride?.nodeId === n.id ? canvas.resizeOverride : null}
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
              resizeOverride={canvas.resizeOverride?.nodeId === n.id ? canvas.resizeOverride : null}
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
