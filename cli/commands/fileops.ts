import type { Command }        from 'commander'
import { createInterface }     from 'readline/promises'
import { NodeAdapter }         from '../adapter'
import { VaultService }        from '../service'
import { fmt }                 from '../ui/fmt'
import { requireVault }        from './shared'

export function cmdDelete(program: Command) {
  program
    .command('delete <note>')
    .alias('rm')
    .description('Remove uma nota')
    .option('-v, --vault <path>', 'Caminho do vault')
    .option('-y, --yes',          'Não pede confirmação')
    .action(async (note: string, opts) => {
      const vaultPath = requireVault(opts.vault)
      const service   = new VaultService(new NodeAdapter(), vaultPath)
      const filePath  = service.resolve(note)
      const display   = filePath.replace(vaultPath + '/', '')

      if (!opts.yes) {
        const rl  = createInterface({ input: process.stdin, output: process.stdout })
        const ans = await rl.question(`Deletar "${display}"? (s/N) `)
        rl.close()
        if (ans.toLowerCase() !== 's') {
          console.log(fmt.info('Cancelado.'))
          return
        }
      }

      await service.delete(filePath)
      console.log(fmt.ok(display))
    })
}

export function cmdRename(program: Command) {
  program
    .command('rename <note> <newname>')
    .alias('mv')
    .description('Renomeia uma nota')
    .option('-v, --vault <path>', 'Caminho do vault')
    .action(async (note: string, newName: string, opts) => {
      const vaultPath = requireVault(opts.vault)
      const service   = new VaultService(new NodeAdapter(), vaultPath)
      const filePath  = service.resolve(note)
      const newPath   = await service.rename(filePath, newName)
      const from      = filePath.replace(vaultPath + '/', '')
      const to        = newPath.replace(vaultPath + '/', '')
      console.log(fmt.ok(`${from} → ${to}`))
    })
}
