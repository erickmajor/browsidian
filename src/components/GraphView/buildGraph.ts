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
