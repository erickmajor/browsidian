import type { Command } from 'commander'
import { NodeAdapter }  from '../adapter'
import { VaultService } from '../service'
import { fmt, c }       from '../ui/fmt'
import { requireVault } from './shared'

export function cmdRead(program: Command) {
  program
    .command('read <note>')
    .alias('cat')
    .description('Exibe o conteúdo de uma nota')
    .option('-v, --vault <path>', 'Caminho do vault')
    .option('--raw',              'Markdown sem colorização')
    .action(async (note: string, opts) => {
      const vaultPath = requireVault(opts.vault)
      const service   = new VaultService(new NodeAdapter(), vaultPath)
      const filePath  = service.resolve(note)

      let text: string
      try {
        text = await service.read(filePath)
      } catch {
        console.error(fmt.fail(`Nota não encontrada: ${filePath}`))
        process.exit(1)
      }

      const display = filePath.replace(vaultPath + '/', '')
      console.log(fmt.rule(display))
      console.log()
      console.log(opts.raw ? text : colorize(text))
    })
}

function colorize(md: string): string {
  return md.split('\n').map((line) => {
    if (line.startsWith('# '))   return c.bold(c.accent(line))
    if (line.startsWith('## '))  return c.bold(c.cyan(line))
    if (line.startsWith('### ')) return c.bold(line)
    if (line.startsWith('> '))   return c.dim('│ ') + c.dim(line.slice(2))
    if (line.startsWith('- ') || line.startsWith('* '))
      return '  ' + c.accent('·') + line.slice(1)
    return line
      .replace(/\*\*(.+?)\*\*/g, (_, t) => c.bold(t))
      .replace(/`(.+?)`/g,       (_, t) => `\x1b[7m ${t} \x1b[0m`)
      .replace(/\[\[(.+?)\]\]/g, (_, t) => c.accent(`[[${t}]]`))
  }).join('\n')
}
