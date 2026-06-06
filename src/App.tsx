import { useEffect, useRef, useState } from 'react'
import { useVaultStore } from '@/stores/vault'
import { useUIStore } from '@/stores/ui'
import { useDropboxStore } from '@/stores/dropbox'
import { Sidebar } from '@/components/Sidebar'
import { EditorArea } from '@/components/Editor'
import { StatusBar } from '@/components/StatusBar'
import { ContextMenu } from '@/components/ContextMenu'
import { Toasts } from '@/components/Toasts'
import { PromptDialog } from '@/components/Dialogs/PromptDialog'
import { DropboxPathPicker } from '@/components/Dialogs/DropboxPathPicker'
import { PluginManager } from '@/components/PluginManager'
import { GraphView } from '@/components/GraphView'
import { loadEnabledPlugins, unloadPlugin } from '@/plugins/loader'
import { usePluginStore } from '@/plugins/store'

declare const __IS_ELECTRON__: boolean

interface PromptState {
  open: boolean
  title: string
  placeholder: string
  callback: ((v: string) => void) | null
}

export default function App() {
  const {
    vaultPath, initServerMode, initBrowserMode, initDemoMode, initDropboxMode,
    initElectronMode, restoreElectronMode, restoreBrowserMode, restoreLastFile,
    newFile, newFolder, disconnect,
  } = useVaultStore()
  const { setStatus, graphOpen, setGraphOpen } = useUIStore()
  const { startOAuth, finishOAuth, setRootPath, clear: clearDropbox } = useDropboxStore()

  const [ready, setReady] = useState(false)
  const [prompt, setPrompt] = useState<PromptState>({ open: false, title: '', placeholder: '', callback: null })
  const [dbxPicker, setDbxPicker] = useState<{ token: string } | null>(null)
  const bootedRef = useRef(false)

  // Boot: detect mode and restore session
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    async function boot() {
      try {
        if (typeof __IS_ELECTRON__ !== 'undefined' && __IS_ELECTRON__) {
          const restored = await restoreElectronMode().catch(() => false)
          if (!restored) {
            await initElectronMode().catch(() => {})
          }
        } else {
          await initServerMode().catch(() => {})
          if (!useVaultStore.getState().vaultPath) {
            await restoreBrowserMode().catch(() => {})
          }
        }
        await restoreLastFile().catch(() => {})
      } finally {
        setReady(true)
      }
    }
    boot()
  }, [])

  // Plugin lifecycle: load on vault connect, unload on vault change/disconnect
  useEffect(() => {
    if (!vaultPath) return

    loadEnabledPlugins().catch(() => {})

    return () => {
      const ids = Array.from(usePluginStore.getState().loaded.keys())
      for (const id of ids) {
        unloadPlugin(id).catch(() => {})
      }
    }
  }, [vaultPath])

  // Dropbox OAuth callback from popup
  useEffect(() => {
    async function handleMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return
      const data = (ev.data ?? {}) as Record<string, unknown>
      if (data.type !== 'dropbox-oauth') return
      if (data.error) {
        setStatus(`Dropbox auth error: ${data.errorDescription ?? data.error}`)
        return
      }
      try {
        const cfg = await fetch('/api/dropbox/oauth/config')
          .then((r) => r.json())
          .catch(() => null) as Record<string, string> | null
        const redirectUri = cfg?.redirectUri ?? `${window.location.origin}/dropbox-oauth.html`
        const code = String(data.code ?? '')
        const auth = await finishOAuth(code, redirectUri)
        setDbxPicker({ token: auth.accessToken })
      } catch (err) {
        setStatus(`Dropbox connect failed: ${(err as Error).message}`)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  function openPrompt(title: string, placeholder: string, cb: (v: string) => void) {
    setPrompt({ open: true, title, placeholder, callback: cb })
  }

  function closePrompt() {
    setPrompt((p) => ({ ...p, open: false, callback: null }))
  }

  const handleNewFile = () => openPrompt('New file', 'filename.md', async (name) => {
    if (!name.trim()) return
    closePrompt()
    try { await newFile(name) } catch (err) { setStatus(`Error: ${(err as Error).message}`) }
  })

  const handleNewFolder = () => openPrompt('New folder', 'folder-name', async (name) => {
    if (!name.trim()) return
    closePrompt()
    try { await newFolder(name) } catch (err) { setStatus(`Error: ${(err as Error).message}`) }
  })

  const handleBrowserVault = async () => {
    try { await initBrowserMode() } catch (err) { setStatus(`Error: ${(err as Error).message}`) }
  }

  const handleDropboxConnect = async () => {
    try {
      const cfg = await fetch('/api/dropbox/oauth/config')
        .then((r) => r.json())
        .catch(() => null) as Record<string, string> | null
      if (!cfg?.appKey) { alert('Dropbox is not configured on this server.'); return }
      const redirectUri = cfg.redirectUri ?? `${window.location.origin}/dropbox-oauth.html`
      const authorizeUrl = await startOAuth(cfg.appKey, redirectUri)
      const w = 520, h = 680
      const left = Math.round(window.screenX + (window.outerWidth - w) / 2)
      const top  = Math.round(window.screenY + (window.outerHeight - h) / 2)
      const popup = window.open(authorizeUrl, 'dropbox-oauth', `width=${w},height=${h},left=${left},top=${top}`)
      if (!popup) setStatus('Popup blocked. Please allow popups and try again.')
    } catch (err) {
      setStatus(`Dropbox error: ${(err as Error).message}`)
    }
  }

  const handleDbxSelect = async (path: string) => {
    setDbxPicker(null)
    setRootPath(path)
    const auth = useDropboxStore.getState().auth
    if (!auth) return
    setStatus('Connecting to Dropbox…')
    try {
      await initDropboxMode(auth)
      setStatus('Ready.')
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    }
  }

  const handleDbxCancel = () => {
    setDbxPicker(null)
    clearDropbox()
  }

  if (!ready) return null

  if (!vaultPath) {
    const fsa = 'showDirectoryPicker' in window
    const showDropbox = new URLSearchParams(window.location.search).has('dropbox')

    return (
      <div className="app">
        <div className="welcome" style={{ gridColumn: '1 / -1', minHeight: '100%' }}>
          <img className="welcome-logo" src="/img/browsidian.png" alt="" aria-hidden />
          <div className="welcome-title">Browsidian</div>
          <div className="welcome-sub">Obsidian vault editor · web</div>
          <div className="welcome-actions">
            <button
              className="btn btn-primary"
              onClick={handleBrowserVault}
              disabled={!fsa}
              title={!fsa ? 'Requires Chrome, Edge, or Brave' : undefined}
            >
              Choose local vault
            </button>
            <button className="btn btn-secondary" onClick={() => void initDemoMode()}>
              Try demo
            </button>
            {showDropbox && (
              <button className="btn btn-secondary" onClick={handleDropboxConnect}>
                Connect Dropbox
              </button>
            )}
          </div>
          {!fsa && (
            <p className="welcome-note">Local vault requires Chrome, Edge, or Brave.</p>
          )}
        </div>

        {dbxPicker && (
          <DropboxPathPicker
            accessToken={dbxPicker.token}
            initialPath=""
            onSelect={handleDbxSelect}
            onCancel={handleDbxCancel}
          />
        )}

        <Toasts />
      </div>
    )
  }

  return (
    <div className="app">
      {typeof __IS_ELECTRON__ !== 'undefined' && __IS_ELECTRON__ && (
        <div className="titlebar">
          <div className="titlebar-spacer" />
          <span className="titlebar-name">{vaultPath.split('/').pop() ?? vaultPath}</span>
        </div>
      )}

      <Sidebar
        onNewFile={handleNewFile}
        onNewFolder={handleNewFolder}
        onDisconnect={() => void disconnect()}
      />

      <div className="main">
        <EditorArea />
        <StatusBar />
      </div>

      <ContextMenu />
      <PluginManager />
      {graphOpen && <GraphView onClose={() => setGraphOpen(false)} />}

      <PromptDialog
        open={prompt.open}
        title={prompt.title}
        placeholder={prompt.placeholder}
        onConfirm={(v) => prompt.callback?.(v)}
        onCancel={closePrompt}
      />

      <Toasts />
    </div>
  )
}
