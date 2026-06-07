import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'

const DEV = process.env.NODE_ENV === 'development'

let _vaultFsWatcher: fsSync.FSWatcher | null = null

// ─── Janela ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../../public/img/browsidian.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (DEV) {
    const devUrl = process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173'
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Vault ───────────────────────────────────────────────────────────────

ipcMain.handle('vault:select', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Selecionar Vault',
    properties: ['openDirectory'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('vault:list', async (_e, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries.map((e) => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      isDir: e.isDirectory(),
    }))
  } catch (err: any) {
    if (err.code === 'ENOENT') return []
    throw err
  }
})

ipcMain.handle('vault:read', async (_e, filePath: string) => {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch (err: any) {
    if (err.code === 'ENOENT') return null
    throw err
  }
})

ipcMain.handle('vault:write', async (_e, filePath: string, content: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
})

ipcMain.handle('vault:delete', async (_e, filePath: string) => {
  await fs.rm(filePath, { recursive: true, force: true })
})

ipcMain.handle('vault:rename', async (_e, oldPath: string, newPath: string) => {
  await fs.mkdir(path.dirname(newPath), { recursive: true })
  await fs.rename(oldPath, newPath)
})

ipcMain.handle('vault:mkdir', async (_e, dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true })
})

ipcMain.handle('app:version', () => app.getVersion())

ipcMain.handle('devtools:toggle', (e) => {
  const wc = e.sender
  if (wc.isDevToolsOpened()) wc.closeDevTools()
  else wc.openDevTools()
})

// ─── IPC: Plugins ─────────────────────────────────────────────────────────────

ipcMain.handle('plugin:load', async (_e, pluginDir: string) => {
  const manifestPath = path.join(pluginDir, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
  const mainFile = path.join(pluginDir, manifest.main ?? 'main.js')
  const code = await fs.readFile(mainFile, 'utf-8')
  return { manifest, code }
})

// ─── IPC: File watching ───────────────────────────────────────────────────────

ipcMain.on('vault:watch:start', (e, vaultPath: string) => {
  _vaultFsWatcher?.close()
  _vaultFsWatcher = null
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  try {
    _vaultFsWatcher = fsSync.watch(vaultPath, { recursive: true }, (eventType, filename) => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        win.webContents.send('vault:changed', { eventType, filename })
      }, 500)
    })
    _vaultFsWatcher.on('error', (err) => console.error('[watcher]', err))
  } catch (err) {
    console.error('[watcher] failed to start', err)
  }
})

ipcMain.on('vault:watch:stop', () => {
  _vaultFsWatcher?.close()
  _vaultFsWatcher = null
})
