// File System Access API
type FileSystemPermissionMode = 'read' | 'readwrite'

interface FileSystemPermissionDescriptor {
  mode?: FileSystemPermissionMode
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>
  queryPermission(desc?: FileSystemPermissionDescriptor): Promise<PermissionState>
  requestPermission(desc?: FileSystemPermissionDescriptor): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker(options?: { mode?: FileSystemPermissionMode }): Promise<FileSystemDirectoryHandle>
}

interface ElectronAPI {
  selectVault(): Promise<string | null>
  listFiles(dirPath: string): Promise<{ name: string; path: string; isDir: boolean }[]>
  readFile(filePath: string): Promise<string | null>
  writeFile(filePath: string, content: string): Promise<void>
  deleteFile(filePath: string): Promise<void>
  renameFile(oldPath: string, newPath: string): Promise<void>
  mkdir(dirPath: string): Promise<void>
  getVersion(): Promise<string>
  loadPlugin(pluginDir: string): Promise<{ manifest: Record<string, string>; code: string }>
}

declare interface Window {
  electronAPI: ElectronAPI
}

declare const __IS_ELECTRON__: boolean
