import { create } from 'zustand'
import type { PluginManifest } from './shim/types'

export interface LoadedPlugin {
  id:       string
  manifest: PluginManifest
  instance: any // Plugin instance; null when load failed
  error?:   string
  requiresElectron?: boolean
}

export interface CommunityPlugin {
  id:          string
  name:        string
  author:      string
  description: string
  repo:        string
}

interface PluginStoreState {
  loaded:              Map<string, LoadedPlugin>
  enabled:             Set<string>
  installing:          Set<string>
  communityList:       CommunityPlugin[]
  communityFetched:    boolean
  managerOpen:         boolean

  setLoaded(id: string, plugin: LoadedPlugin): void
  removeLoaded(id: string): void
  setEnabled(id: string, value: boolean): void
  setInstalling(id: string, value: boolean): void
  setCommunityList(list: CommunityPlugin[]): void
  setManagerOpen(open: boolean): void
}

export const usePluginStore = create<PluginStoreState>((set) => ({
  loaded:           new Map(),
  enabled:          new Set(),
  installing:       new Set(),
  communityList:    [],
  communityFetched: false,
  managerOpen:      false,

  setLoaded: (id, plugin) => set(s => {
    const loaded = new Map(s.loaded); loaded.set(id, plugin); return { loaded }
  }),

  removeLoaded: (id) => set(s => {
    const loaded = new Map(s.loaded); loaded.delete(id); return { loaded }
  }),

  setEnabled: (id, value) => set(s => {
    const enabled = new Set(s.enabled)
    if (value) enabled.add(id); else enabled.delete(id)
    return { enabled }
  }),

  setInstalling: (id, value) => set(s => {
    const installing = new Set(s.installing)
    if (value) installing.add(id); else installing.delete(id)
    return { installing }
  }),

  setCommunityList: (list) => set({ communityList: list, communityFetched: true }),
  setManagerOpen:   (open) => set({ managerOpen: open }),
}))
