import { useEffect } from 'react'
import { useVaultStore } from '@/stores/vault'
import { useUIStore } from '@/stores/ui'

export function ContextMenu() {
  const { tree, deleteFile } = useVaultStore()
  const { contextMenuPath, contextMenuPos, hideContextMenu, setStatus } = useUIStore()

  useEffect(() => {
    const close = () => hideContextMenu()
    document.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [hideContextMenu])

  if (!contextMenuPath || !contextMenuPos) return null

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    const path = contextMenuPath
    hideContextMenu()
    const ok = window.confirm(`Delete\n\n${path}\n\nThis cannot be undone. Continue?`)
    if (!ok) return

    function findFile(items: typeof tree): typeof tree[0] | null {
      for (const item of items) {
        if (item.path === path) return item
        if (item.children) {
          const found = findFile(item.children)
          if (found) return found
        }
      }
      return null
    }

    const file = findFile(tree)
    if (!file) return
    try {
      await deleteFile(file)
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    }
  }

  const padding = 8
  const left = Math.min(contextMenuPos.x, window.innerWidth - 200 - padding)
  const top  = Math.min(contextMenuPos.y, window.innerHeight - 60 - padding)

  return (
    <div
      className="context-menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="context-item danger" onClick={handleDelete}>
        Delete
      </button>
    </div>
  )
}
