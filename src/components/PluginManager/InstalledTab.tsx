import { useEffect, useState } from 'react'
import { usePluginStore } from '@/plugins/store'
import { discoverPlugins, togglePlugin } from '@/plugins/loader'
import { uninstallPlugin } from '@/plugins/registry'
import { useUIStore } from '@/stores/ui'
import { InstalledPluginCard } from './PluginCard'
import type { PluginManifest } from '@/plugins/shim/types'

interface InstalledTabProps {
  onOpenSettings: (id: string, name: string) => void
}

export function InstalledTab({ onOpenSettings }: InstalledTabProps) {
  const { loaded, enabled, removeLoaded } = usePluginStore()
  const { setStatus } = useUIStore()
  const [discovered, setDiscovered] = useState<Array<{ id: string; manifest: PluginManifest }>>([])

  useEffect(() => {
    discoverPlugins().then(list =>
      setDiscovered(list.map(p => ({ id: p.manifest.id, manifest: p.manifest })))
    )
  }, [loaded.size])

  if (discovered.length === 0) {
    return (
      <div className="plugin-tab-empty">
        No plugins found in <code>.obsidian/plugins/</code>. Install one from the Community tab.
      </div>
    )
  }

  return (
    <div className="plugin-list">
      {discovered.map(({ id, manifest }) => {
        const loadedPlugin = loaded.get(id) ?? { id, manifest, instance: null }
        const isEnabled = enabled.has(id)
        return (
          <InstalledPluginCard
            key={id}
            plugin={loadedPlugin}
            enabled={isEnabled}
            onToggle={async (enable) => {
              try {
                await togglePlugin(id, enable)
              } catch (err) {
                setStatus(`Plugin error: ${(err as Error).message}`)
              }
            }}
            onUninstall={async () => {
              if (!confirm(`Uninstall "${manifest.name}"?`)) return
              try {
                await uninstallPlugin(id)
                removeLoaded(id)
                setDiscovered(d => d.filter(p => p.id !== id))
              } catch (err) {
                setStatus(`Uninstall failed: ${(err as Error).message}`)
              }
            }}
            onSettings={isEnabled ? () => onOpenSettings(id, manifest.name) : undefined}
          />
        )
      })}
    </div>
  )
}
