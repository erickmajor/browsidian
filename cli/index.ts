#!/usr/bin/env node
import { Command }   from 'commander'
import { cmdOpen }   from './commands/open'
import { cmdList }   from './commands/list'
import { cmdRead }   from './commands/read'
import { cmdCreate } from './commands/create'
import { cmdSearch } from './commands/search'
import { cmdDelete, cmdRename } from './commands/fileops'
import { cmdExport } from './commands/export'

const program = new Command()

program
  .name('browsidian')
  .description('Editor de vaults Obsidian — CLI')
  .version('0.1.0')

cmdOpen(program)
cmdList(program)
cmdRead(program)
cmdCreate(program)
cmdSearch(program)
cmdDelete(program)
cmdRename(program)
cmdExport(program)

// Sem subcomando: abre TUI se vault fornecido, senão exibe ajuda
program.action(() => {
  const vault = process.env.BROWSIDIAN_VAULT
  if (vault) {
    program.parseAsync(['', '', 'open', vault])
  } else {
    program.help()
  }
})

program.parse()
