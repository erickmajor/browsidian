/** Desativa cores automaticamente fora de um TTY (pipes, CI, redirect) */
const tty = Boolean(process.stdout.isTTY)
const esc = (code: string) => (tty ? `\x1b[${code}m` : '')
const R   = esc('0')

export const c = {
  bold:      (s: string) => `${esc('1')}${s}${R}`,
  dim:       (s: string) => `${esc('2')}${s}${R}`,
  italic:    (s: string) => `${esc('3')}${s}${R}`,
  accent:    (s: string) => `${esc('35')}${s}${R}`,    // roxo
  cyan:      (s: string) => `${esc('36')}${s}${R}`,    // ciano — caminhos
  yellow:    (s: string) => `${esc('33')}${s}${R}`,    // amarelo — match / warn
  green:     (s: string) => `${esc('32')}${s}${R}`,    // verde — sucesso
  red:       (s: string) => `${esc('31')}${s}${R}`,    // vermelho — erro
  highlight: (s: string) => `${esc('1;33')}${s}${R}`,  // amarelo bold — match
}

export const fmt = {
  ok:    (s: string) => `${c.green('✔')} ${s}`,
  fail:  (s: string) => `${c.red('✖')} ${s}`,
  warn:  (s: string) => `${c.yellow('!')} ${s}`,
  info:  (s: string) => `${c.dim(s)}`,
  path:  (s: string) => c.cyan(s),
  rule:  (label = '') => {
    const w = process.stdout.columns ?? 60
    if (!label) return c.dim('─'.repeat(w))
    return c.dim('── ') + c.bold(label) + c.dim(' ' + '─'.repeat(Math.max(0, w - label.length - 5)))
  },
  /** Spinner simples para operações longas */
  spin: (label: string) => {
    if (!tty) { process.stdout.write(`${label}…\n`); return { stop: (_ok?: string) => {} } }
    const frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
    let i = 0
    const iv = setInterval(
      () => process.stdout.write(`\r${c.accent(frames[i++ % frames.length])} ${label}  `),
      80,
    )
    return {
      stop(ok = '✔') {
        clearInterval(iv)
        process.stdout.write(`\r${c.green(ok)} ${label}\n`)
      },
    }
  },
}
