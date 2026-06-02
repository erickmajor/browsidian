// src/components/CanvasEditor/useCanvas.ts
import { useState, useRef, useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'
import type { CanvasNodeType, CanvasEdge, Side } from './types'

export interface Viewport { x: number; y: number; zoom: number }
export interface DragOverride { nodeId: string; x: number; y: number }
export interface ResizeOverride { nodeId: string; x: number; y: number; width: number; height: number }
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
  resizeOverride: ResizeOverride | null
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
  const [viewport, setViewport]           = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const [selected, setSelected]           = useState<Set<string>>(new Set())
  const [pendingEdge, setPendingEdge]     = useState<PendingEdge | null>(null)
  const [dragOverride, setDragOverride]   = useState<DragOverride | null>(null)
  const [resizeOverride, setResizeOverride] = useState<ResizeOverride | null>(null)
  const [isPanning, setIsPanning]         = useState(false)

  const viewportRef    = useRef<HTMLDivElement>(null)
  const vpRef          = useRef(viewport)
  const panRef         = useRef<PanRef | null>(null)
  const dragRef        = useRef<DragRef | null>(null)
  const resizeRef      = useRef<ResizeRef | null>(null)
  const portRef        = useRef<{ fromNode: string; fromSide: Side } | null>(null)
  const dragOverRef    = useRef<DragOverride | null>(null)
  const resizeOverRef  = useRef<ResizeOverride | null>(null)

  // Fix 2 — store callbacks in refs so dep arrays don't need them
  const onUpdateNodeRef = useRef(onUpdateNode)
  const onAddEdgeRef    = useRef(onAddEdge)
  useEffect(() => { onUpdateNodeRef.current = onUpdateNode }, [onUpdateNode])
  useEffect(() => { onAddEdgeRef.current    = onAddEdge    }, [onAddEdge])

  useEffect(() => { vpRef.current         = viewport      }, [viewport])
  useEffect(() => { dragOverRef.current   = dragOverride  }, [dragOverride])
  useEffect(() => { resizeOverRef.current = resizeOverride }, [resizeOverride])

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
    onAddEdgeRef.current(edge)
    portRef.current = null
    setPendingEdge(null)
  }, [])

  const handleResizeMouseDown = useCallback((
    nodeId: string,
    handle: 'nw' | 'ne' | 'sw' | 'se',
    e: React.MouseEvent,
  ) => {
    e.stopPropagation()
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    const origX = node.x, origY = node.y, origW = node.width, origH = node.height
    resizeRef.current = {
      nodeId, handle,
      startMX: e.clientX, startMY: e.clientY,
      origX, origY, origW, origH,
    }
    setResizeOverride({ nodeId, x: origX, y: origY, width: origW, height: origH })
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
      setResizeOverride({ nodeId, x, y, width: w, height: h })
      return
    }

    if (portRef.current) {
      const world = screenToWorld(e.clientX, e.clientY)
      setPendingEdge(prev => prev ? { ...prev, currentX: world.x, currentY: world.y } : null)
    }
  }, [screenToWorld])

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    if (dragRef.current && dragOverRef.current) {
      const { x, y } = dragOverRef.current
      onUpdateNodeRef.current(dragRef.current.nodeId, { x, y })
    }
    if (resizeRef.current && resizeOverRef.current) {
      const { nodeId } = resizeRef.current
      const { x, y, width, height } = resizeOverRef.current
      onUpdateNodeRef.current(nodeId, { x, y, width, height })
    }
    if (portRef.current) {
      portRef.current = null
      setPendingEdge(null)
    }
    panRef.current    = null
    dragRef.current   = null
    resizeRef.current = null
    setDragOverride(null)
    setResizeOverride(null)
    setIsPanning(false)
  }, [])

  return {
    viewport, setViewport,
    selected, setSelected,
    pendingEdge, setPendingEdge,
    dragOverride, resizeOverride, isPanning, viewportRef,
    handleWheel, handleBackgroundMouseDown, handleBackgroundClick,
    handleNodeMouseDown, handlePortMouseDown, handlePortMouseUp,
    handleResizeMouseDown, handleMouseMove, handleMouseUp,
  }
}
