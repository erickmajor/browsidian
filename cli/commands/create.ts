import type { Command } from 'commander'
import { NodeAdapter }  from '../adapter'
import { VaultService } from '../service'
import { fmt }          from '../ui/fmt'
import { requireVault } from './shared'

export function cmdCreate(program: Command) {
  program
    .command('create <name>')
    .alias('new')
    .description('Cria uma nova nota')
    .option('-v, --vault <path>',    'Caminho do vault')
    .option('-p, --parent <path>',   'Pasta pai dentro do vault')
    .option('-c, --content <text>',  'Conteúdo inicial')
    .option('--template <note>',     'Nome de uma nota existente para usar como template')
    .action(async (name: string, opts) => {
      const vaultPath = requireVault(opts.vault)
      const service   = new VaultService(new NodeAdapter(), vaultPath)

      let content: string | undefined = opts.content

      if (opts.template) {
        try {
          const raw  = await service.read(service.resolve(opts.template))
          const date = new Date().toISOString().split('T')[0]
          content    = raw
            .replace(/\{\{title\}\}/g, name)
            .replace(/\{\{date\}\}/g,  date)
        } catch {
          console.error(fmt.fail(`Template não encontrado: ${opts.template}`))
          process.exit(1)
        }
      }

      const filePath = await service.create(name, opts.parent, content)
      console.log(fmt.ok(fmt.path(filePath.replace(vaultPath + '/', ''))))
    })
}
