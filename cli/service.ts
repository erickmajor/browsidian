import * as path from 'path'
import type { VaultAdapter, FileEntry } from '../src/adapters'

export interface VaultFile extends FileEntry {
  children?: VaultFile[]
}

export interface SearchMatch {
  file:        VaultFile
  lineNumber:  number
  lineContent: string
  matchStart:  number
  matchEnd:    number
}

export class VaultService {
  constructor(
    public readonly adapter: VaultAdapter,
    public readonly vaultPath: string,
  ) {}

  // ─── Leitura ──────────────────────────────────────────────────────────────

  /** Árvore completa de arquivos, excluindo entradas que começam com '.' */
  async tree(dirPath = this.vaultPath): Promise<VaultFile[]> {
    const entries = await this.adapter.listFiles(dirPath)
    return Promise.all(
      entries
        .filter((e) => !e.name.startsWith('.'))
        .map(async (e): Promise<VaultFile> =>
          e.isDir
            ? { ...e, children: await this.tree(e.path) }
            : e
        )
    )
  }

  /** Lista plana somente com arquivos (sem diretórios) */
  async flat(dirPath = this.vaultPath): Promise<VaultFile[]> {
    const t = await this.tree(dirPath)
    return flatten(t).filter((f) => !f.isDir)
  }

  async read(filePath: string): Promise<string> {
    return this.adapter.readFile(filePath)
  }

  // ─── Escrita ──────────────────────────────────────────────────────────────

  async create(name: string, parentPath?: string, content?: string): Promise<string> {
    const base     = parentPath ?? this.vaultPath
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const filePath = path.join(base, fileName)
    const body     = content ?? `# ${fileName.replace(/\.md$/, '')}\n\n`
    await this.adapter.writeFile(filePath, body)
    return filePath
  }

  async write(filePath: string, content: string): Promise<void> {
    await this.adapter.writeFile(filePath, content)
  }

  async delete(filePath: string): Promise<void> {
    await this.adapter.deleteFile(filePath)
  }

  async rename(filePath: string, newName: string): Promise<string> {
    const dir      = path.dirname(filePath)
    const fileName = newName.endsWith('.md') ? newName : `${newName}.md`
    const newPath  = path.join(dir, fileName)
    await this.adapter.renameFile(filePath, newPath)
    return newPath
  }

  // ─── Busca ────────────────────────────────────────────────────────────────

  async search(query: string): Promise<SearchMatch[]> {
    const files   = await this.flat()
    const mdFiles = files.filter((f) => f.name.endsWith('.md'))
    const regex   = new RegExp(query, 'gi')
    const results: SearchMatch[] = []

    for (const file of mdFiles) {
      const lines = (await this.adapter.readFile(file.path)).split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        regex.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = regex.exec(line)) !== null) {
          results.push({
            file,
            lineNumber:  i + 1,
            lineContent: line.trim(),
            matchStart:  m.index,
            matchEnd:    m.index + m[0].length,
          })
        }
      }
    }

    return results
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  async exportHtml(outDir: string): Promise<string[]> {
    const { mkdir, writeFile } = await import('fs/promises')
    await mkdir(outDir, { recursive: true })

    const files   = await this.flat()
    const mdFiles = files.filter((f) => f.name.endsWith('.md'))
    const exported: string[] = []

    for (const file of mdFiles) {
      const md      = await this.adapter.readFile(file.path)
      const title   = file.name.replace(/\.md$/, '')
      const html    = toHtml(md, title)
      const outPath = path.join(outDir, file.name.replace(/\.md$/, '.html'))
      await writeFile(outPath, html, 'utf-8')
      exported.push(outPath)
    }

    return exported
  }

  // ─── Utilitários ─────────────────────────────────────────────────────────

  /** Resolve um nome ou caminho para o path absoluto no vault */
  resolve(nameOrPath: string): string {
    if (path.isAbsolute(nameOrPath)) return nameOrPath
    const withExt = nameOrPath.endsWith('.md') ? nameOrPath : `${nameOrPath}.md`
    return path.join(this.vaultPath, withExt)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flatten(files: VaultFile[]): VaultFile[] {
  return files.flatMap((f) => (f.isDir && f.children ? [f, ...flatten(f.children)] : [f]))
}

function toHtml(md: string, title: string): string {
  const body = md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>')
    .replace(/\[\[(.+?)\]\]/g, '<a href="$1.html">$1</a>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n')

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body{font-family:Georgia,serif;max-width:700px;margin:2rem auto;padding:0 1rem;line-height:1.75;color:#222}
    h1,h2,h3{font-weight:600;margin:1.5rem 0 .5rem}
    code{background:#f4f4f4;padding:2px 5px;border-radius:3px;font-family:monospace}
    a{color:#6c5ce7}
  </style>
</head>
<body>${body}</body>
</html>`
}
