import { useEffect, useRef } from 'react'

interface Props {
  pluginId: string
  pluginName: string
  onBack: () => void
}

export function SettingsPanel({ pluginId, pluginName, onBack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tab = (globalThis as any).app?.plugins._getSettingTab?.(pluginId)

  useEffect(() => {
    const el = containerRef.current
    if (!el || !tab) return
    tab.containerEl = el
    try { tab.display() } catch (err) {
      el.textContent = `Settings error: ${(err as Error).message}`
    }
    return () => { try { tab.hide() } catch {} }
  }, [pluginId])

  return (
    <div className="plugin-settings-panel">
      <div className="plugin-settings-header">
        <button className="btn btn-ghost" onClick={onBack}>← Voltar</button>
        <span className="plugin-settings-title">{pluginName}</span>
      </div>
      {tab ? (
        <div ref={containerRef} className="plugin-settings-body" />
      ) : (
        <div className="plugin-tab-empty">Este plugin não tem configurações.</div>
      )}
    </div>
  )
}
