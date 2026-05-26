import type { Command } from 'commander'
import { NodeAdapter }  from '../adapter'
import { VaultService } from '../service'
import { fmt }          from '../ui/fmt'
import { requireVault } from './shared'

export function cmdExport(program: Command) {
  program
    .command('export [vault]')
    .description('Exporta o vault para HTML')
    .option('-v, --vault <path>',  'Caminho do vault')
    .option('-o, --out <dir>',     'Diretório de saída', './browsidian-export')
    .action(async (vaultArg: string | undefined, opts) => {
      const vaultPath = requireVault(opts.vault ?? vaultArg)
      const service   = new VaultService(new NodeAdapter(), vaultPath)
      const spin      = fmt.spin('Exportando…')

      const exported = await service.exportHtml(opts.out)
      spin.stop()

      exported.forEach((p) =>
        console.log(fmt.ok(fmt.path(p.replace(opts.out + '/', ''))))
      )
      console.log(fmt.info(`\n${exported.length} arquivo(s) → ${opts.out}`))
    })
}
