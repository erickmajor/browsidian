import { create } from 'zustand'

type Theme = 'dark' | 'light'

function loadTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyTheme(theme: Theme): void {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  try { localStorage.setItem('theme', theme) } catch {}
}

interface UIStore {
  status: string
  theme: Theme
  draggingPath: string | null
  contextMenuPath: string | null
  contextMenuPos: { x: number; y: number } | null
  contextMenuIsDir: boolean
  graphOpen: boolean
  externalChangeFile: string | null
  externalChangeDeleted: boolean

  setStatus(msg: string): void
  setTheme(theme: Theme): void
  toggleTheme(): void
  setDragging(path: string | null): void
  showContextMenu(path: string, x: number, y: number, isDir: boolean): void
  hideContextMenu(): void
  setGraphOpen(v: boolean): void
  setExternalChangeFile(path: string | null): void
  setExternalChangeDeleted(deleted: boolean): void
}

export const useUIStore = create<UIStore>((set, get) => {
  const initialTheme = loadTheme()
  applyTheme(initialTheme)

  return {
    status: 'Ready.',
    theme: initialTheme,
    draggingPath: null,
    contextMenuPath: null,
    contextMenuPos: null,
    contextMenuIsDir: false,
    graphOpen: false,
    externalChangeFile: null,
    externalChangeDeleted: false,

    setStatus(msg) { set({ status: msg }) },

    setTheme(theme) {
      applyTheme(theme)
      set({ theme })
    },

    toggleTheme() {
      get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
    },

    setDragging(path) { set({ draggingPath: path }) },

    showContextMenu(path, x, y, isDir) {
      set({ contextMenuPath: path, contextMenuPos: { x, y }, contextMenuIsDir: isDir })
    },

    hideContextMenu() {
      set({ contextMenuPath: null, contextMenuPos: null, contextMenuIsDir: false })
    },

    setGraphOpen(v) { set({ graphOpen: v }) },

    setExternalChangeFile(path) { set({ externalChangeFile: path }) },
    setExternalChangeDeleted(deleted) { set({ externalChangeDeleted: deleted }) },
  }
})
