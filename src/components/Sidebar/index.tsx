import { useState } from 'react'
import { useVaultStore } from '@/stores/vault'
import { useUIStore } from '@/stores/ui'
import type { VaultFile } from '@/stores/vault'

interface SidebarProps {
  onNewFile: () => void
  onNewFolder: () => void
  onDisconnect: () => void
}

export function Sidebar({ onNewFile, onNewFolder, onDisconnect }: SidebarProps) {
  const { vaultPath, tree, activeFile, selectedDir, openFile, moveFile, setSelectedDir } = useVaultStore()
  const { setDragging, draggingPath, showContextMenu, setStatus } = useUIStore()
  const [filter, setFilter] = useState('')

  if (!vaultPath) return null

  const vaultName = vaultPath.split('/').pop() ?? vaultPath

  const handleDrop = async (targetDir: string, e: React.DragEvent) => {
    e.preventDefault()
    const from = draggingPath
    if (!from) return
    const filename = from.split('/').pop()!
    const to = targetDir ? `${targetDir}/${filename}` : filename
    if (to === from) return
    const ok = window.confirm(`Move\n\n${from}\n\n→ ${to}\n\nConfirm?`)
    if (!ok) return
    try {
      setStatus('Moving…')
      await moveFile(from, to)
      setStatus('Moved.')
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    } finally {
      setDragging(null)
    }
  }

  const passesFilter = (entry: VaultFile): boolean => {
    if (!filter) return true
    return entry.path.toLowerCase().includes(filter.toLowerCase())
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-title">
            <img className="brand-logo" src="/img/browsidian.png" alt="" aria-hidden />
            <span>Browsidian</span>
          </div>
          <div className="vault-header">
            <span className="vault-name" title={vaultPath}>{vaultName}</span>
            <div className="vault-actions">
              <button className="icon-btn" onClick={onDisconnect} title="Disconnect">
                ✕ <span style={{ fontSize: 11 }}>Disconnect</span>
              </button>
            </div>
          </div>
        </div>
        <input
          className="search"
          placeholder="Search files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoComplete="off"
        />
        <div className="actions">
          <button className="btn btn-primary" onClick={onNewFile}>＋ New file</button>
          <button className="btn btn-secondary" onClick={onNewFolder}>⊕ New folder</button>
        </div>
      </div>

      <div
        className="tree"
        onDragOver={(e) => { if (draggingPath) e.preventDefault() }}
        onDrop={(e) => handleDrop(selectedDir ?? '', e)}
      >
        {tree.map((item) => (
          <TreeNode
            key={item.path}
            item={item}
            depth={0}
            activeFile={activeFile}
            selectedDir={selectedDir}
            filter={filter}
            passesFilter={passesFilter}
            onOpen={openFile}
            onSelectDir={setSelectedDir}
            onDragStart={(path) => setDragging(path)}
            onDrop={handleDrop}
            onContextMenu={(path, x, y, isDir) => showContextMenu(path, x, y, isDir)}
          />
        ))}
      </div>
    </aside>
  )
}

interface TreeNodeProps {
  item:         VaultFile
  depth:        number
  activeFile:   VaultFile | null
  selectedDir:  string | null
  filter:       string
  passesFilter: (e: VaultFile) => boolean
  onOpen:       (f: VaultFile) => Promise<void>
  onSelectDir:  (dir: string) => void
  onDragStart:  (path: string) => void
  onDrop:       (targetDir: string, e: React.DragEvent) => Promise<void>
  onContextMenu:(path: string, x: number, y: number, isDir: boolean) => void
}

function hasMatch(item: VaultFile, passesFilter: (e: VaultFile) => boolean): boolean {
  if (passesFilter(item)) return true
  if (item.isDir && item.children) return item.children.some((c) => hasMatch(c, passesFilter))
  return false
}

function TreeNode({
  item, depth, activeFile, selectedDir, filter, passesFilter,
  onOpen, onSelectDir, onDragStart, onDrop, onContextMenu,
}: TreeNodeProps) {
  const [open, setOpen] = useState(depth === 0)
  const [dropTarget, setDropTarget] = useState(false)
  const indent = depth * 18

  if (filter && !hasMatch(item, passesFilter)) return null

  if (item.isDir) {
    const isSelected = item.path === (selectedDir ?? '')
    return (
      <div>
        <div
          className={`tree-item${isSelected ? ' selected' : ''}${dropTarget ? ' drop-target' : ''}`}
          data-path={item.path}
          style={{ paddingLeft: 8 + indent }}
          onClick={() => { onSelectDir(item.path) }}
          onDragOver={(e) => { e.preventDefault(); setDropTarget(true) }}
          onDragLeave={() => setDropTarget(false)}
          onDrop={async (e) => { setDropTarget(false); await onDrop(item.path, e) }}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(item.path, e.clientX, e.clientY, true) }}
        >
          <span
            className="icon"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          >
            {open ? '▾' : '▸'}
          </span>
          <span className="name">{item.name}</span>
        </div>
        {open && item.children && (
          <div className="tree-children">
            {item.children.map((child) => (
              <TreeNode
                key={child.path}
                item={child}
                depth={depth + 1}
                activeFile={activeFile}
                selectedDir={selectedDir}
                filter={filter}
                passesFilter={passesFilter}
                onOpen={onOpen}
                onSelectDir={onSelectDir}
                onDragStart={onDragStart}
                onDrop={onDrop}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (filter && !passesFilter(item)) return null

  const isActive = item.path === activeFile?.path

  return (
    <div>
      <div
        className={`tree-item${isActive ? ' active' : ''}`}
        data-path={item.path}
        style={{ paddingLeft: 8 + indent }}
        draggable
        onClick={() => void onOpen(item)}
        onDragStart={() => onDragStart(item.path)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(item.path, e.clientX, e.clientY, false) }}
        title={item.name}
      >
        <span className="icon" style={{ fontSize: 9 }}>◆</span>
        <span className="name">{item.name.replace(/\.md$/, '')}</span>
      </div>
    </div>
  )
}
