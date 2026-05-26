import type { Command }  from 'commander'
import { NodeAdapter }   from '../adapter'
import { VaultService }  from '../service'
import { fmt, c }        from '../ui/fmt'
import { requireVault }  from './shared'
import type { VaultFile } from '../service'

export function cmdList(program: Command) {
  program
    .command('list [vault]')
    .alias('ls')
    .description('Lista arquivos do vault')
    .option('-f, --flat',     'Lista plana em vez de árvore')
    .option('--md-only',      'Apenas arquivos .md')
    .action(async (vaultArg: string | undefined, opts) => {
      const vaultPath = requireVault(vaultArg)
      const service   = new VaultService(new NodeAdapter(), vaultPath)

      if (opts.flat) {
        const files = await service.flat()
        const list  = opts.mdOnly ? files.filter((f) => f.name.endsWith('.md')) : files
        list.forEach((f) => console.log(fmt.path(relative(f.path, vaultPath))))
        return
      }

      const tree = await service.tree()
      printTree(tree, 0, opts.mdOnly, vaultPath)
    })
}

function printTree(files: VaultFile[], depth: number, mdOnly: boolean, base: string) {
  const indent = '  '.repeat(depth)
  for (const f of files) {
    if (!f.isDir && mdOnly && !f.name.endsWith('.md')) continue
    const icon = f.isDir ? c.dim('▸') : c.accent('◆')
    const name = f.isDir ? c.bold(f.name) : c.dim(f.name.replace(/\.md$/, ''))
    console.log(`${indent}${icon} ${name}`)
    if (f.isDir && f.children) printTree(f.children, depth + 1, mdOnly, base)
  }
}

function relative(filePath: string, base: string) {
  return filePath.startsWith(base + '/') ? filePath.slice(base.length + 1) : filePath
}
