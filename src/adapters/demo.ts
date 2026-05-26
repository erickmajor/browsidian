import type { VaultAdapter, FileEntry } from './index'

const STORAGE_KEY = 'demoVaultV1'
const IGNORED = new Set(['.obsidian', '.git', 'node_modules', '.trash', '.DS_Store'])

interface DemoVaultData {
  files: Record<string, string>
  dirs: Record<string, boolean>
}

const WELCOME_PATH = 'Welcome.md'
const WELCOME_MARKER = '# Browsidian — Demo Vault'

function defaultWelcome(): string {
  return `# Browsidian — Demo Vault

Bem-vindo! Este é um **vault demo seguro e in-browser** para testar a UI sem conectar uma pasta real.

## Como começar

1. Clique em **New file**
2. Digite \`Minha primeira nota\`
3. Escreva Markdown, clique fora para visualizar
4. Crie um link: \`[[Minha primeira nota]]\` e clique no preview

## Atalhos

- **Enter** confirma o diálogo de criação
- **Ctrl+S** salva imediatamente
- Auto-save dispara após ~1.2s de inatividade
- Clique no **nome de uma pasta** para selecioná-la
- Arraste um arquivo sobre uma pasta para movê-lo

---

Have fun exploring Browsidian.`
}

function norm(p: string): string {
  return (p ?? '')
    .toString()
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function parentOf(p: string): string {
  const s = norm(p)
  const idx = s.lastIndexOf('/')
  return idx === -1 ? '' : s.slice(0, idx)
}

function baseOf(p: string): string {
  const s = norm(p)
  const idx = s.lastIndexOf('/')
  return idx === -1 ? s : s.slice(idx + 1)
}

function load(): DemoVaultData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return seed()
    const parsed = JSON.parse(raw) as DemoVaultData
    if (!parsed?.files || !parsed?.dirs) return seed()
    // upgrade welcome if needed
    const welcome = parsed.files[WELCOME_PATH] ?? ''
    if (!welcome || (welcome.startsWith('# Welcome') && !welcome.startsWith(WELCOME_MARKER))) {
      parsed.files[WELCOME_PATH] = defaultWelcome()
      save(parsed)
    }
    if (!parsed.dirs['']) parsed.dirs[''] = true
    return parsed
  } catch {
    return seed()
  }
}

function seed(): DemoVaultData {
  const data: DemoVaultData = { files: { [WELCOME_PATH]: defaultWelcome() }, dirs: { '': true } }
  save(data)
  return data
}

function save(data: DemoVaultData): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

function mkdirInData(data: DemoVaultData, dirPath: string): void {
  const p = norm(dirPath)
  if (!p) return
  const parts = p.split('/').filter(Boolean)
  let cur = ''
  for (const part of parts) {
    cur = cur ? `${cur}/${part}` : part
    data.dirs[cur] = true
  }
}

export class DemoAdapter implements VaultAdapter {
  static readonly VAULT_NAME = 'Demo (local)'

  async selectVault(): Promise<string | null> {
    return DemoAdapter.VAULT_NAME
  }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const data = load()
    const d = dirPath === DemoAdapter.VAULT_NAME ? '' : norm(dirPath)
    const entries: FileEntry[] = []

    for (const p of Object.keys(data.dirs)) {
      if (!p) continue
      if (parentOf(p) !== d) continue
      const name = baseOf(p)
      if (!name || IGNORED.has(name)) continue
      entries.push({ name, path: p, isDir: true })
    }

    for (const p of Object.keys(data.files)) {
      if (parentOf(p) !== d) continue
      const name = baseOf(p)
      if (!name || IGNORED.has(name)) continue
      entries.push({ name, path: p, isDir: false })
    }

    return entries.sort((a, b) =>
      a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)
    )
  }

  async readFile(filePath: string): Promise<string> {
    const data = load()
    const p = norm(filePath)
    if (!(p in data.files)) throw new Error('File not found')
    return data.files[p]
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const data = load()
    const p = norm(filePath)
    mkdirInData(data, parentOf(p))
    data.files[p] = content ?? ''
    save(data)
  }

  async deleteFile(filePath: string): Promise<void> {
    const data = load()
    const p = norm(filePath)
    if (!(p in data.files)) throw new Error('File not found')
    delete data.files[p]
    save(data)
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const data = load()
    const from = norm(oldPath)
    const to = norm(newPath)
    if (!(from in data.files)) throw new Error('File not found')
    if (to in data.files) throw new Error('Destination already exists')
    mkdirInData(data, parentOf(to))
    data.files[to] = data.files[from]
    delete data.files[from]
    save(data)
  }

  async mkdir(dirPath: string): Promise<void> {
    const data = load()
    mkdirInData(data, dirPath)
    save(data)
  }

  static clear(): void {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }
}
