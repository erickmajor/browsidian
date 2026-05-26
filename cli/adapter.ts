import * as fs   from 'fs/promises'
import * as path from 'path'
import type { VaultAdapter, FileEntry } from '../src/adapters'

/**
 * NodeVaultAdapter
 * Implementação do VaultAdapter para o CLI.
 * Usa fs do Node.js diretamente — sem IPC, sem browser.
 */
export class NodeAdapter implements VaultAdapter {
  // No CLI o vault é passado como argumento; selectVault() não é chamado
  async selectVault(): Promise<string | null> { return null }

  async listFiles(dirPath: string): Promise<FileEntry[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .map((e) => ({
        name:  e.name,
        path:  path.join(dirPath, e.name),
        isDir: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async deleteFile(filePath: string): Promise<void> {
    await fs.rm(filePath, { recursive: true, force: true })
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    await fs.mkdir(path.dirname(newPath), { recursive: true })
    await fs.rename(oldPath, newPath)
  }

  async mkdir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }
}
