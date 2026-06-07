import { useEffect } from 'react'
import { useUIStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'

export function ExternalChangeToast() {
  const {
    externalChangeFile,
    externalChangeDeleted,
    setExternalChangeFile,
    setExternalChangeDeleted,
  } = useUIStore()
  const { activeFile, openFile } = useVaultStore()

  // Auto-dismiss deleted variant after 4 s and close the editor
  useEffect(() => {
    if (!externalChangeFile || !externalChangeDeleted) return
    const timer = setTimeout(() => {
      useVaultStore.setState({ activeFile: null, content: '', isDirty: false, showPreview: true })
      setExternalChangeFile(null)
      setExternalChangeDeleted(false)
    }, 4000)
    return () => clearTimeout(timer)
  }, [externalChangeFile, externalChangeDeleted])

  if (!externalChangeFile) return null

  // Show last two path segments to keep the toast compact
  const shortPath = externalChangeFile.replace(/\\/g, '/').split('/').slice(-2).join('/')

  if (externalChangeDeleted) {
    return (
      <div className="ext-change-toast ext-change-toast--deleted">
        <span className="ext-change-icon">✕</span>
        <div className="ext-change-body">
          <div className="ext-change-title">Arquivo removido externamente</div>
          <div className="ext-change-path">{shortPath}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="ext-change-toast">
      <span className="ext-change-icon">⚠</span>
      <div className="ext-change-body">
        <div className="ext-change-title">Arquivo modificado externamente</div>
        <div className="ext-change-path">{shortPath}</div>
      </div>
      <button
        className="btn btn-secondary ext-change-reload"
        onClick={() => {
          if (activeFile) void openFile(activeFile)
          setExternalChangeFile(null)
          setExternalChangeDeleted(false)
        }}
      >
        Recarregar
      </button>
    </div>
  )
}
