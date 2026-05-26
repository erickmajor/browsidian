import { c } from '../ui/fmt'

/** Resolve o path do vault a partir do argumento ou da variável de ambiente */
export function requireVault(arg?: string): string {
  const vaultPath = arg ?? process.env.BROWSIDIAN_VAULT
  if (!vaultPath) {
    console.error(c.red('Vault não especificado.'))
    console.error(c.dim('  Use: browsidian <comando> <caminho-do-vault>'))
    console.error(c.dim('  Ou:  export BROWSIDIAN_VAULT=~/meu-vault'))
    process.exit(1)
  }
  return vaultPath.replace(/\/$/, '')
}
