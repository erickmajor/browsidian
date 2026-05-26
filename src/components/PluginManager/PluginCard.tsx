import type { LoadedPlugin, CommunityPlugin } from '@/plugins/store'

interface InstalledCardProps {
  plugin: LoadedPlugin
  enabled: boolean
  onToggle: (enable: boolean) => void
  onUninstall: () => void
  onSettings?: () => void
}

export function InstalledPluginCard({ plugin, enabled, onToggle, onUninstall, onSettings }: InstalledCardProps) {
  return (
    <div className="plugin-card">
      <div className="plugin-card-info">
        <div className="plugin-card-title">
          {plugin.manifest.name}
          {plugin.requiresElectron && (
            <span className="plugin-badge plugin-badge-warn">⚠ Requires Electron</span>
          )}
          {plugin.error && (
            <span className="plugin-badge plugin-badge-error" title={plugin.error}>Error</span>
          )}
        </div>
        <div className="plugin-card-meta">
          by {plugin.manifest.author ?? 'Unknown'} · v{plugin.manifest.version}
        </div>
        {plugin.error && (
          <div className="plugin-card-error">{plugin.error}</div>
        )}
        {plugin.manifest.description && (
          <div className="plugin-card-desc">{plugin.manifest.description}</div>
        )}
      </div>
      <div className="plugin-card-actions">
        {onSettings && (
          <button className="btn btn-ghost plugin-settings-btn" title="Configurações" onClick={onSettings}>
            ⚙
          </button>
        )}
        <label className="toggle" title={enabled ? 'Disable plugin' : 'Enable plugin'}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="toggle-track" />
        </label>
        {!enabled && (
          <button className="btn btn-ghost plugin-uninstall" onClick={onUninstall}>
            Uninstall
          </button>
        )}
      </div>
    </div>
  )
}

interface CommunityCardProps {
  plugin: CommunityPlugin
  installed: boolean
  installing: boolean
  onInstall: () => void
}

export function CommunityPluginCard({ plugin, installed, installing, onInstall }: CommunityCardProps) {
  return (
    <div className="plugin-card">
      <div className="plugin-card-info">
        <div className="plugin-card-title">{plugin.name}</div>
        <div className="plugin-card-meta">by {plugin.author}</div>
        <div className="plugin-card-desc">{plugin.description}</div>
      </div>
      <div className="plugin-card-actions">
        {installed ? (
          <span className="plugin-badge plugin-badge-ok">Installed</span>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={onInstall}
            disabled={installing}
          >
            {installing ? 'Installing…' : 'Install'}
          </button>
        )}
      </div>
    </div>
  )
}
