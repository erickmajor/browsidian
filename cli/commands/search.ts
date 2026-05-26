import type { Command } from 'commander'
import { NodeAdapter }  from '../adapter'
import { VaultService } from '../service'
import { fmt, c }       from '../ui/fmt'
import { requireVault } from './shared'

export function cmdSearch(program: Command) {
  program
    .command('search <query> [vault]')
    .alias('find')
    .description('Busca texto em todas as notas')
    .option('-v, --vault <path>',  'Caminho do vault')
    .option('-l, --files-only',    'Exibe apenas nomes de arquivo')
    .option('--json',              'Saída em JSON')
    .action(async (query: string, vaultArg: string | undefined, opts) => {
      const vaultPath = requireVault(opts.vault ?? vaultArg)
      const service   = new VaultService(new NodeAdapter(), vaultPath)
      const spin      = fmt.spin(`Buscando "${query}"`)

      const hits = await service.search(query)
      spin.stop()

      if (hits.length === 0) {
        console.log(fmt.info('Nenhum resultado.'))
        return
      }

      if (opts.json) {
        console.log(JSON.stringify(hits, null, 2))
        return
      }

      if (opts.filesOnly) {
        const unique = [...new Set(hits.map((h) => h.file.path))]
        unique.forEach((p) => console.log(fmt.path(p.replace(vaultPath + '/', ''))))
        console.log(fmt.info(`\n${unique.length} arquivo(s)`))
        return
      }

      // Agrupa por arquivo
      const byFile = new Map<string, typeof hits>()
      for (const h of hits) {
        if (!byFile.has(h.file.path)) byFile.set(h.file.path, [])
        byFile.get(h.file.path)!.push(h)
      }

      for (const [filePath, fileHits] of byFile) {
        console.log(c.accent('◆ ') + fmt.path(filePath.replace(vaultPath + '/', '')))
        for (const h of fileHits) {
          const before = h.lineContent.slice(0, h.matchStart)
          const match  = h.lineContent.slice(h.matchStart, h.matchEnd)
          const after  = h.lineContent.slice(h.matchEnd)
          console.log(`  ${c.dim('L' + h.lineNumber)}  ${before}${c.highlight(match)}${after}`)
        }
        console.log()
      }

      console.log(fmt.info(`${hits.length} resultado(s) em ${byFile.size} arquivo(s)`))
    })
}
