import { useEffect, useState } from 'react'
import { useUIStore } from '@/stores/ui'
import { usePluginStore } from '@/plugins/store'

const MoonIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
)

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
)

const PluginIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const GraphIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="2" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="19" r="2" />
    <line x1="12" y1="7" x2="5" y2="17" />
    <line x1="12" y1="7" x2="19" y2="17" />
    <line x1="5" y1="19" x2="19" y2="19" />
  </svg>
)

export function StatusBar() {
  const { status, theme, toggleTheme, setGraphOpen } = useUIStore()
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
          className="btn btn-ghost"
          title="Graph view"
          onClick={() => setGraphOpen(true)}
        >
          <GraphIcon />
        </button>
        <button
          className="btn btn-ghost plugin-manager-btn"
          title="Plugins"
          onClick={() => setManagerOpen(true)}
        >
          <PluginIcon />
        </button>
        <label className="toggle" title="Toggle light/dark theme">
          <input
            type="checkbox"
            checked={theme === 'light'}
            onChange={toggleTheme}
          />
          <span className="toggle-side toggle-side-left"><MoonIcon /></span>
          <span className="toggle-track" />
          <span className="toggle-side toggle-side-right"><SunIcon /></span>
        </label>
      </div>
    </div>
  )
}
