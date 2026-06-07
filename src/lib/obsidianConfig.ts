import picomatch from 'picomatch'
import type { VaultAdapter } from '@/adapters'

export async function loadUserIgnorePatterns(
  adapter: VaultAdapter,
  vaultPath: string
): Promise<string[]> {
  try {
    const raw = await adapter.readFile(`${vaultPath}/.obsidian/app.json`)
    const config = JSON.parse(raw) as Record<string, unknown>
    return Array.isArray(config.userIgnoreFilters)
      ? (config.userIgnoreFilters as unknown[]).filter((p): p is string => typeof p === 'string')
      : []
  } catch {
    return []
  }
}

export function isIgnoredByUser(relativePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false
  const normalized = relativePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return patterns.some((pattern) => {
    if (!pattern) return false
    try {
      const isMatch = picomatch(pattern, { dot: true })
      return isMatch(normalized) || parts.some((part) => isMatch(part))
    } catch {
      console.warn('[obsidianConfig] invalid ignore pattern:', pattern)
      return false
    }
  })
}
