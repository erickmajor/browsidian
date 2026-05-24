import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Vault
  selectVault: ()                              => ipcRenderer.invoke('vault:select'),
  listFiles:   (dirPath: string)               => ipcRenderer.invoke('vault:list',   dirPath),
  readFile:    (filePath: string)              => ipcRenderer.invoke('vault:read',   filePath),
  writeFile:   (filePath: string, content: string) => ipcRenderer.invoke('vault:write',  filePath, content),
  deleteFile:  (filePath: string)              => ipcRenderer.invoke('vault:delete', filePath),
  renameFile:  (oldPath: string, newPath: string)  => ipcRenderer.invoke('vault:rename', oldPath, newPath),
  mkdir:       (dirPath: string)                    => ipcRenderer.invoke('vault:mkdir',  dirPath),
  // App
  getVersion:  ()                              => ipcRenderer.invoke('app:version'),
  // Plugins
  loadPlugin:  (pluginDir: string)             => ipcRenderer.invoke('plugin:load',  pluginDir),
})
