import { useEffect, useRef, useState } from 'react'
import { normRoot } from '@/adapters/dropbox'

interface Folder { name: string; path: string }

interface DropboxPathPickerProps {
  accessToken: string
  initialPath: string
  onSelect: (path: string) => void
  onCancel: () => void
}

function displayPath(p: string): string {
  return p === '' ? '/' : p
}

async function listFolders(token: string, path: string): Promise<Folder[]> {
  const res = await fetch('/api/dropbox/files/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-dropbox-access-token': token,
    },
    body: JSON.stringify({ path }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to list folders')
  return ((data.entries ?? []) as Array<Record<string, unknown>>)
    .filter((e) => e['.tag'] === 'folder')
    .map((e) => ({
      name: String(e.name ?? ''),
      path: normRoot(String(e.path_display ?? e.path_lower ?? '')),
    }))
    .filter((e) => e.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

function Breadcrumb({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path === '' ? [] : path.split('/').filter(Boolean)
  const crumbs: { label: string; path: string }[] = [{ label: 'Dropbox', path: '' }]
  for (let i = 0; i < parts.length; i++) {
    crumbs.push({ label: parts[i], path: '/' + parts.slice(0, i + 1).join('/') })
  }
  return (
    <div className="dbx-breadcrumb">
      {crumbs.map((c, idx) => (
        <button
          key={c.path}
          className="dbx-crumb"
          disabled={idx === crumbs.length - 1}
          onClick={() => onNavigate(c.path)}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}

export function DropboxPathPicker({ accessToken, initialPath, onSelect, onCancel }: DropboxPathPickerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  const [currentPath, setCurrentPath] = useState(() => normRoot(initialPath))
  const [selectedPath, setSelectedPath] = useState(() => normRoot(initialPath))
  const [folders, setFolders] = useState<Folder[]>([])
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState('Loading…')

  useEffect(() => {
    dialogRef.current?.showModal()
    if (inputRef.current) {
      inputRef.current.value = displayPath(normRoot(initialPath))
    }
  }, [])

  useEffect(() => {
    load(currentPath)
  }, [currentPath])

  async function load(path: string) {
    setBusy(true)
    setHelp('Loading folders…')
    try {
      const items = await listFolders(accessToken, path)
      setFolders(items)
      setHelp('Select a folder for your Dropbox vault.')
    } catch (err) {
      setFolders([])
      setHelp(`Error: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function navigate(path: string) {
    if (busy) return
    const norm = normRoot(path)
    setCurrentPath(norm)
    setSelectedPath(norm)
    if (inputRef.current) inputRef.current.value = displayPath(norm)
  }

  function selectFolder(path: string) {
    const norm = normRoot(path)
    setSelectedPath(norm)
    if (inputRef.current) inputRef.current.value = displayPath(norm)
  }

  function handleConfirm() {
    if (busy) return
    const raw = inputRef.current?.value ?? ''
    const path = normRoot(raw === '/' ? '' : raw)
    onSelect(path)
    dialogRef.current?.close()
  }

  function handleCancel() {
    dialogRef.current?.close()
    onCancel()
  }

  return (
    <dialog ref={dialogRef} className="dialog" onCancel={handleCancel}>
      <div className="dialog-form">
        <div className="dialog-title">Choose Dropbox folder</div>

        <Breadcrumb path={currentPath} onNavigate={navigate} />

        <input
          ref={inputRef}
          className="dialog-input"
          type="text"
          placeholder="/ (root)"
          defaultValue={displayPath(normRoot(initialPath))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm() }}
          autoComplete="off"
        />

        <div className="dbx-list">
          {busy && <div className="dbx-item dbx-muted">Loading…</div>}
          {!busy && folders.length === 0 && (
            <div className="dbx-item dbx-muted">No subfolders.</div>
          )}
          {!busy && folders.map((f) => (
            <div
              key={f.path}
              className={`dbx-item${f.path === selectedPath ? ' selected' : ''}`}
              role="option"
              aria-selected={f.path === selectedPath}
              onClick={() => selectFolder(f.path)}
              onDoubleClick={() => navigate(f.path)}
            >
              <span style={{ opacity: 0.5 }}>▸</span>
              <span className="dbx-item-name">{f.name}</span>
            </div>
          ))}
        </div>

        <p className="dialog-help">{help}</p>

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={busy}>
            Select
          </button>
        </div>
      </div>
    </dialog>
  )
}
