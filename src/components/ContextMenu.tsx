import { useEffect } from 'react'
import { useVaultStore } from '@/stores/vault'
import { useUIStore } from '@/stores/ui'
import { obsidianApp } from '@/plugins/loader'
import { Menu, TFile, TFolder } from '@/plugins/shim'

export function ContextMenu() {
  const { tree, deleteFile, vaultPath } = useVaultStore()
  const {
    contextMenuPath, contextMenuPos, contextMenuIsDir,
    hideContextMenu, setStatus,
  } = useUIStore()

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

  // Collect plugin contributions synchronously — listeners are always sync
  const menu = new Menu()
  // Plugins expect vault-relative paths with forward slashes (Obsidian convention)
  const obsRelPath = vaultPath && contextMenuPath.startsWith(vaultPath)
    ? contextMenuPath.slice(vaultPath.length + 1).replace(/\\/g, '/')
    : contextMenuPath
  const obsFile = contextMenuIsDir
    ? new TFolder(obsRelPath)
    : new TFile(obsRelPath)
  obsidianApp.workspace._emit('file-menu', menu, obsFile, 'more-options', null)
  const pluginItems = menu.getItems()
  console.debug(`[ContextMenu] '${obsRelPath}' isDir=${contextMenuIsDir} → ${pluginItems.length} plugin item(s):`, pluginItems.map(i => i.title))

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
  const top  = Math.min(contextMenuPos.y, window.innerHeight - 120 - padding)

  return (
    <div
      className="context-menu"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {pluginItems.map((item, i) => (
        <button
          key={i}
          className={`context-item${item.warning ? ' danger' : ''}`}
          disabled={item.disabled}
          onClick={(e) => { hideContextMenu(); item.onClick(e.nativeEvent) }}
        >
          {item.title}
        </button>
      ))}
      <button className="context-item danger" onClick={handleDelete}>
        Delete
      </button>
    </div>
  )
}
