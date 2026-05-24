import { useEffect, useMemo, useState } from 'react'
import { usePluginStore } from '@/plugins/store'
import { fetchCommunityList, installPlugin } from '@/plugins/registry'
import { discoverPlugins } from '@/plugins/loader'
import { useUIStore } from '@/stores/ui'
import { CommunityPluginCard } from './PluginCard'

const PAGE_SIZE = 30

export function CommunityTab() {
  const { communityList, communityFetched, installing, loaded } = usePluginStore()
  const { setStatus } = useUIStore()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [discoveredIds, setDiscoveredIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    discoverPlugins().then(list => setDiscoveredIds(new Set(list.map(p => p.manifest.id))))
  }, [loaded.size])

  useEffect(() => {
    if (communityFetched) return
    setLoading(true)
    fetchCommunityList()
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }, [communityFetched])

  // Reset page when search query changes
  useEffect(() => { setPage(1) }, [query])

  const filtered = useMemo(() => {
    if (!query.trim()) return communityList
    const q = query.toLowerCase()
    return communityList.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q)
    )
  }, [communityList, query])

  const visible = filtered.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < filtered.length

  if (loading) return <div className="plugin-tab-empty">Loading community plugins…</div>
  if (error)   return <div className="plugin-tab-empty plugin-tab-error">Error: {error}</div>

  return (
    <div className="plugin-community">
      <input
        className="plugin-search"
        type="search"
        placeholder="Search plugins…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoFocus
      />
      <div className="plugin-list">
        {visible.map(plugin => (
          <CommunityPluginCard
            key={plugin.id}
            plugin={plugin}
            installed={loaded.has(plugin.id) || discoveredIds.has(plugin.id)}
            installing={installing.has(plugin.id)}
            onInstall={async () => {
              try {
                await installPlugin(plugin)
                setStatus(`${plugin.name} installed. Enable it in the Installed tab.`)
              } catch (err) {
                setStatus(`Install failed: ${(err as Error).message}`)
              }
            }}
          />
        ))}
        {filtered.length === 0 && (
          <div className="plugin-tab-empty">No plugins match "{query}".</div>
        )}
      </div>
      {hasMore && (
        <button className="btn btn-secondary plugin-load-more" onClick={() => setPage(p => p + 1)}>
          Load more ({filtered.length - visible.length} remaining)
        </button>
      )}
    </div>
  )
}
