import type { Command } from 'commander'
import { NodeAdapter }  from '../adapter'
import { VaultService } from '../service'
import { requireVault } from './shared'

export function cmdOpen(program: Command) {
  program
    .command('open [vault]')
    .description('Abre o vault na TUI interativa')
    .action(async (vaultArg?: string) => {
      const vaultPath = requireVault(vaultArg)
      const service   = new VaultService(new NodeAdapter(), vaultPath)

      const { render }   = await import('ink')
      const React        = await import('react')
      const { TuiApp }   = await import('../ui/tui')

      render(React.default.createElement(TuiApp, { service }))
    })
}
