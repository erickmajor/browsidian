import type { VaultAdapter, FileEntry } from './index'

const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

async function apiFetch(method: string, url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as Record<string, string>).error || `HTTP ${res.status}`)
  return data
}

export class ServerAdapter implements VaultAdapter {
  private vaultName: string

  constructor(vaultName: string) {
    this.vaultName = vaultName
  }

  async selectVault(): Promise<string | null> {
    // server mode: vault is configured server-side
    return this.vaultName
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const dir = dirPath === this.vaultName ? '' : dirPath
    const data = (await apiFetch('GET', `/api/list?dir=${encodeURIComponent(dir)}`)) as {
      entries: { name: string; path: string; type: string }[]
    }
    return data.entries
      .filter((e) => !IGNORED.has(e.name))
      .map((e) => ({ name: e.name, path: e.path, isDir: e.type === 'dir' }))
  }

  async readFile(filePath: string): Promise<string> {
    const data = (await apiFetch('GET', `/api/read?path=${encodeURIComponent(filePath)}`)) as {
      content: string
    }
    return data.content
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await apiFetch('PUT', '/api/write', { path: filePath, content })
  }

  async deleteFile(filePath: string): Promise<void> {
    await apiFetch('POST', '/api/delete', { path: filePath })
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await apiFetch('POST', '/api/move', { from: oldPath, to: newPath })
  }

  async mkdir(dirPath: string): Promise<void> {
    await apiFetch('POST', '/api/mkdir', { path: dirPath })
  }
}
