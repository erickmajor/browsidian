import { useEffect, useRef, useState } from 'react'
import { usePluginStore } from '@/plugins/store'
import { InstalledTab } from './InstalledTab'
import { CommunityTab } from './CommunityTab'

type Tab = 'installed' | 'community'

export function PluginManager() {
  const { managerOpen, setManagerOpen } = usePluginStore()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>('installed')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (managerOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
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
          <span className="plugin-manager-title">Plugins</span>
          <button className="btn btn-ghost plugin-manager-close" onClick={() => setManagerOpen(false)}>
            ✕
          </button>
        </div>

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
          {activeTab === 'installed' ? <InstalledTab /> : <CommunityTab />}
        </div>
      </div>
    </dialog>
  )
}
