import type { VaultMode } from '@/stores/vault'
import type { VaultAdapter } from '@/adapters'
import { ElectronWatcher } from './electron'

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
  return null
}
