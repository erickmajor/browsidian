// src/plugins/shim/metadata-parser.ts

export interface CachedMetadata {
  frontmatter?: Record<string, any>
  tags?: Array<{ tag: string }>
  links?: Array<{ link: string; original: string }>
}

function parseScalar(v: string): any {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~') return null
  const n = Number(v)
  if (!isNaN(n) && v.trim() !== '') return n
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    return v.slice(1, -1)
  return v
}

function parseFrontmatterYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {}
  const lines = yaml.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const keyMatch = line.match(/^([\w][\w-]*)\s*:\s*(.*)$/)
    if (!keyMatch) { i++; continue }
    const [, key, rest] = keyMatch
    const trimmed = rest.trim()

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      // Inline array: [a, b, c]
      const inner = trimmed.slice(1, -1)
      result[key] = inner
        ? inner.split(',').map(s => parseScalar(s.trim())).filter(s => s !== '')
        : []
    } else if (trimmed === '') {
      // Block sequence — collect indented `- value` lines
      const items: any[] = []
      i++
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        items.push(parseScalar(lines[i].replace(/^\s+-\s+/, '').trim()))
        i++
      }
      result[key] = items
      continue
    } else {
      result[key] = parseScalar(trimmed)
    }
    i++
  }
  return result
}

export function parseFileCache(content: string, _path: string): CachedMetadata {
  const result: CachedMetadata = {}

  // Step 1: extract frontmatter
  let body = content
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)(?:\r?\n)?---/)
  if (fmMatch) {
    try {
      result.frontmatter = parseFrontmatterYaml(fmMatch[1])
    } catch {
      result.frontmatter = {}
    }
    body = content.slice(fmMatch[0].length)
  }

  // Step 2: inline tags (body only, skip code blocks, tag must not be inside [[...]])
  const seen = new Set<string>()
  const tags: Array<{ tag: string }> = []

  // Frontmatter `tags:` field → add with # prefix
  const fmTags = result.frontmatter?.tags
  if (fmTags) {
    const arr = Array.isArray(fmTags) ? fmTags : [fmTags]
    for (const t of arr) {
      const s = String(t ?? '').replace(/^#/, '').trim()
      if (s) { const tag = `#${s}`; if (!seen.has(tag)) { seen.add(tag); tags.push({ tag }) } }
    }
  }

  // Inline #tags in body, strip code blocks first
  const noCode = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '')

  for (const m of noCode.matchAll(/(?<![[\w])#([A-Za-zÀ-￿][A-Za-z0-9À-￿/_-]*)/g)) {
    const tag = `#${m[1]}`
    if (!seen.has(tag)) { seen.add(tag); tags.push({ tag }) }
  }

  if (tags.length) result.tags = tags

  // Step 3: wikilinks [[target]] or [[target|alias]]
  const links: Array<{ link: string; original: string }> = []
  for (const m of body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    links.push({ link: m[1].trim(), original: m[0] })
  }
  if (links.length) result.links = links

  return result
}
