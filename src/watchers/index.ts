import type { VaultMode } from '@/stores/vault'
import type { VaultAdapter } from '@/adapters'

export interface VaultWatcher {
  start(): void
  stop(): void
  onTreeChanged(cb: () => void): void
  onFileChanged(cb: (path: string) => void): void
}

export function createWatcher(
  _mode: VaultMode,
  _adapter: VaultAdapter,
  _vaultPath: string,
): VaultWatcher | null {
  return null  // implementations added per task
}
