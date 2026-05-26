import type { VaultAdapter, FileEntry } from './index'

const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

export interface DropboxAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number
  accountId: string
  rootPath: string
}

function normRoot(input: string): string {
  const s = (input ?? '').trim()
  if (!s || s === '/') return ''
  const cleaned = s.replaceAll('\\', '/').replace(/\/+$/, '')
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`
}

function dropboxPathFor(relPath: string, rootPath: string): string {
  const rel = (relPath ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
  const root = normRoot(rootPath)
  if (!root) return rel ? `/${rel}` : ''
  return rel ? `${root}/${rel}` : root
}

async function apiPost(
  endpoint: string,
  payload: unknown,
  token: string
): Promise<unknown> {
  const res = await fetch(`/api/dropbox/files/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-dropbox-access-token': token },
    body: JSON.stringify(payload),
  })
  const raw = await res.text().catch(() => '')
  let data: Record<string, string> = {}
  try { data = raw ? JSON.parse(raw) : {} } catch {}
  if (!res.ok) throw new Error(data.error || data.error_summary || raw || `Dropbox HTTP ${res.status}`)
  return data
}

export class DropboxAdapter implements VaultAdapter {
  private auth: DropboxAuth
  private rootPath: string

  constructor(auth: DropboxAuth) {
    this.auth = { ...auth }
    this.rootPath = normRoot(auth.rootPath)
  }

  get vaultLabel(): string {
    return `Dropbox${this.rootPath ? `: ${this.rootPath}` : ''}`
  }

  async ensureToken(
    onRefreshed: (auth: DropboxAuth) => void
  ): Promise<string> {
    if (Date.now() < this.auth.expiresAt - 30_000) return this.auth.accessToken

    const res = await fetch('/api/dropbox/oauth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.auth.refreshToken }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      accessToken?: string; expiresIn?: number
    }
    if (!res.ok || !data.accessToken) throw new Error('Failed to refresh Dropbox token')
    this.auth.accessToken = data.accessToken
    this.auth.expiresAt = Date.now() + (data.expiresIn ?? 0) * 1000
    onRefreshed(this.auth)
    return this.auth.accessToken
  }

  async selectVault(): Promise<string | null> {
    return this.vaultLabel
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const token = this.auth.accessToken
    const dbxPath = dropboxPathFor(
      dirPath === this.vaultLabel ? '' : dirPath,
      this.rootPath
    )
    const data = (await apiPost('list', { path: dbxPath }, token)) as {
      entries?: { '.tag': string; name: string; path_display?: string; path_lower?: string }[]
    }
    const entries: FileEntry[] = []
    for (const ent of data.entries ?? []) {
      const name = ent.name
      if (!name || IGNORED.has(name)) continue
      const tag = ent['.tag']
      if (tag !== 'folder' && tag !== 'file') continue
      const absPath = normRoot(ent.path_display ?? ent.path_lower ?? '')
      const relPath = this.rootPath
        ? absPath.slice(this.rootPath.length).replace(/^\//, '')
        : absPath.replace(/^\//, '')
      entries.push({ name, path: relPath, isDir: tag === 'folder' })
    }
    return entries.sort((a, b) =>
      a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)
    )
  }

  async readFile(filePath: string): Promise<string> {
    const token = this.auth.accessToken
    const dbxPath = dropboxPathFor(filePath, this.rootPath)
    const data = (await apiPost('read', { path: dbxPath }, token)) as { content?: string }
    return (data.content ?? '').toString()
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const token = this.auth.accessToken
    const dbxPath = dropboxPathFor(filePath, this.rootPath)
    await apiPost('write', { path: dbxPath, content }, token)
  }

  async deleteFile(filePath: string): Promise<void> {
    const token = this.auth.accessToken
    const dbxPath = dropboxPathFor(filePath, this.rootPath)
    await apiPost('delete', { path: dbxPath }, token)
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const token = this.auth.accessToken
    const fromPath = dropboxPathFor(oldPath, this.rootPath)
    const toPath = dropboxPathFor(newPath, this.rootPath)
    await apiPost('move', { fromPath, toPath }, token)
  }

  async mkdir(dirPath: string): Promise<void> {
    const token = this.auth.accessToken
    const dbxPath = dropboxPathFor(dirPath, this.rootPath)
    await apiPost('mkdir', { path: dbxPath }, token)
  }
}

// ─── Dropbox OAuth helpers ─────────────────────────────────────────────────

export function base64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function sha256Base64Url(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return base64Url(new Uint8Array(hash))
}

export function randomString(len = 64): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

export { normRoot, dropboxPathFor }
