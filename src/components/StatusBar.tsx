import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/ui'
import { usePluginStore } from '@/plugins/store'

export function StatusBar() {
  const { status, theme, toggleTheme } = useUIStore()
  const { setManagerOpen } = usePluginStore()
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (typeof __IS_ELECTRON__ !== 'undefined' && __IS_ELECTRON__) {
      window.electronAPI.getVersion().then(setVersion).catch(() => {})
      return
    }
    fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => { if (cfg?.version) setVersion(String(cfg.version)) })
      .catch(() => {})
  }, [])

  return (
    <div className="statusbar">
      <span className="status-msg">{status}</span>
      <div className="status-right">
        <div className="meta">
          {version && <span className="version-badge meta-item">v{version}</span>}
          <span className="meta-sep">·</span>
          <a
            className="meta-item"
            href="https://github.com/blamouche/browsidian"
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub
          </a>
        </div>
        {typeof __IS_ELECTRON__ !== 'undefined' && __IS_ELECTRON__ && (
          <button
            className="btn btn-ghost"
            title="Toggle DevTools"
            onClick={() => window.electronAPI.toggleDevTools()}
          >
            {'</>'}
          </button>
        )}
        <button
          className="btn btn-ghost plugin-manager-btn"
          title="Plugins"
          onClick={() => setManagerOpen(true)}
        >
          ⬡
        </button>
        <label className="toggle" title="Toggle light/dark theme">
          <input
            type="checkbox"
            checked={theme === 'light'}
            onChange={toggleTheme}
          />
          <span className="toggle-track" />
        </label>
      </div>
    </div>
  )
}
