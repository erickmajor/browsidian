// src/components/CanvasEditor/CanvasNode.tsx
import React from 'react'
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
