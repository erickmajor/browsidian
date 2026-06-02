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
