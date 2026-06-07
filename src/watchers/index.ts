import type { VaultMode } from '@/stores/vault'
import type { VaultAdapter } from '@/adapters'
import { ElectronWatcher } from './electron'
import { ServerWatcher } from './server'

export interface VaultWatcher {
  start(): void
  stop(): void
  onTreeChanged(cb: () => void): void
  onFileChanged(cb: (path: string) => void): void
}

export function createWatcher(
  mode: VaultMode,
  adapter: VaultAdapter,
  vaultPath: string,
): VaultWatcher | null {
  if (mode === 'electron') return new ElectronWatcher(vaultPath)
  if (mode === 'server') return new ServerWatcher()
  return null
}
