import { useEffect, useRef, useState } from 'react'
import { usePluginStore } from '@/plugins/store'
import { InstalledTab } from './InstalledTab'
import { CommunityTab } from './CommunityTab'
import { SettingsPanel } from './SettingsPanel'

type Tab = 'installed' | 'community'

interface SettingsTarget { id: string; name: string }

export function PluginManager() {
  const { managerOpen, setManagerOpen } = usePluginStore()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>('installed')
  const [settingsPlugin, setSettingsPlugin] = useState<SettingsTarget | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (managerOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
      setSettingsPlugin(null)
    }
  }, [managerOpen])

  return (
    <dialog
      ref={dialogRef}
      className="plugin-manager-dialog"
      onCancel={(e) => { e.preventDefault(); setManagerOpen(false) }}
    >
      <div className="plugin-manager">
        <div className="plugin-manager-header">
          <span className="plugin-manager-title">
            {settingsPlugin ? settingsPlugin.name : 'Plugins'}
          </span>
          <button className="btn btn-ghost plugin-manager-close" onClick={() => setManagerOpen(false)}>
            ✕
          </button>
        </div>

        {settingsPlugin ? (
          <div className="plugin-manager-body">
            <SettingsPanel
              pluginId={settingsPlugin.id}
              pluginName={settingsPlugin.name}
              onBack={() => setSettingsPlugin(null)}
            />
          </div>
        ) : (
          <>
            <div className="plugin-manager-tabs">
              <button
                className={`plugin-tab-btn${activeTab === 'installed' ? ' active' : ''}`}
                onClick={() => setActiveTab('installed')}
              >
                Installed
              </button>
              <button
                className={`plugin-tab-btn${activeTab === 'community' ? ' active' : ''}`}
                onClick={() => setActiveTab('community')}
              >
                Community
              </button>
            </div>

            <div className="plugin-manager-body">
              {activeTab === 'installed' ? (
                <InstalledTab onOpenSettings={(id, name) => setSettingsPlugin({ id, name })} />
              ) : (
                <CommunityTab />
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
