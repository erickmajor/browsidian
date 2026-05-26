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

  setStatus(msg: string): void
  setTheme(theme: Theme): void
  toggleTheme(): void
  setDragging(path: string | null): void
  showContextMenu(path: string, x: number, y: number): void
  hideContextMenu(): void
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

    setStatus(msg) { set({ status: msg }) },

    setTheme(theme) {
      applyTheme(theme)
      set({ theme })
    },

    toggleTheme() {
      get().setTheme(get().theme === 'dark' ? 'light' : 'dark')
    },

    setDragging(path) { set({ draggingPath: path }) },

    showContextMenu(path, x, y) {
      set({ contextMenuPath: path, contextMenuPos: { x, y } })
    },

    hideContextMenu() {
      set({ contextMenuPath: null, contextMenuPos: null })
    },
  }
})
