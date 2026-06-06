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
    d3.zoom()
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
    .selectAll('circle')
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
      d3.drag()
        .on('start', (e: any, d: any) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag',  (e: any, d: any) => { d.fx = e.x; d.fy = e.y })
        .on('end',   (e: any, d: any) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null }),
    )

  const label = g.append('g')
    .selectAll('text')
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
    d3.select(svgRef.current).selectAll('circle')
      .attr('fill-opacity', (d: GraphNode) =>
        !q || d.label.toLowerCase().includes(q) ? (d.type === 'file' ? 0.9 : 0.75) : 0.1)
    d3.select(svgRef.current).selectAll('text')
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
