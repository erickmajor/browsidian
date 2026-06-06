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

// Rebuild relative path from e.name pieces (forward-slash, same as MetadataCache's flattenTree).
// This avoids adapter-specific paths (absolute on Electron, backslash on Windows) diverging
// from MetadataCache keys which always use relative forward-slash paths.
function flattenMdFiles(
  tree: VaultFile[],
  prefix = '',
): Array<{ file: VaultFile; cachePath: string }> {
  const out: Array<{ file: VaultFile; cachePath: string }> = []
  for (const f of tree) {
    const rel = prefix ? `${prefix}/${f.name}` : f.name
    if (f.isDir) out.push(...flattenMdFiles(f.children ?? [], rel))
    else if (f.name.toLowerCase().endsWith('.md')) out.push({ file: f, cachePath: rel })
  }
  return out
}

export function buildGraph(
  tree: VaultFile[],
  metadataCache: MetadataCache,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const fileEntries = flattenMdFiles(tree)

  // Build name→path lookup for wikilink resolution (case-insensitive basename without .md)
  // Node IDs use f.path (adapter path) so openFile works; cache lookups use cachePath.
  const nameMap = new Map<string, string>()
  const pathSet = new Set<string>()
  for (const { file: f } of fileEntries) {
    pathSet.add(f.path)
    const key = f.name.replace(/\.md$/i, '').toLowerCase()
    if (!nameMap.has(key)) nameMap.set(key, f.path)
  }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const tagNodeIds = new Set<string>()

  for (const { file: f, cachePath } of fileEntries) {
    nodes.push({ id: f.path, label: f.name.replace(/\.md$/i, ''), type: 'file' })

    const cached = metadataCache.getCache(cachePath)
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
