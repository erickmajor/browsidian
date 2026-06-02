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
