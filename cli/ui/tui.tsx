import React, { useState, useEffect } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import type { VaultService, VaultFile } from '../service'

type Screen = 'tree' | 'read' | 'search'

interface Props { service: VaultService }

export function TuiApp({ service }: Props) {
  const { exit }  = useApp()
  const cols      = process.stdout.columns ?? 80
  const rows      = process.stdout.rows    ?? 24
  const sideW     = Math.min(38, Math.floor(cols * 0.32))

  const [files,   setFiles]   = useState<VaultFile[]>([])
  const [cursor,  setCursor]  = useState(0)
  const [content, setContent] = useState<string[]>([])
  const [screen,  setScreen]  = useState<Screen>('tree')
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<string[]>([])
  const [status,  setStatus]  = useState('Carregando…')

  useEffect(() => {
    service.flat().then((all) => {
      const md = all.filter((f) => f.name.endsWith('.md'))
      setFiles(md)
      setStatus(`${md.length} nota(s)  ·  j/k navegar  ·  Enter abrir  ·  / buscar  ·  ? ajuda  ·  q sair`)
    })
  }, [])

  useInput((input, key) => {
    if (screen === 'tree') {
      if (input === 'q' || key.escape)  return exit()
      if (input === '/')                { setScreen('search'); setQuery(''); setResults([]); return }
      if (key.downArrow || input === 'j') setCursor((c) => Math.min(files.length - 1, c + 1))
      if (key.upArrow   || input === 'k') setCursor((c) => Math.max(0, c - 1))
      if (key.return && files[cursor]) {
        service.read(files[cursor].path).then((text) => {
          setContent(text.split('\n'))
          setScreen('read')
        })
      }
    }

    if (screen === 'read') {
      if (key.escape || input === 'q' || input === 'b') {
        setScreen('tree')
        setContent([])
      }
    }

    if (screen === 'search') {
      if (key.escape)   { setScreen('tree'); return }
      if (key.return)   {
        service.search(query).then((hits) => {
          setResults(hits.map((h) =>
            `${h.file.name.replace(/\.md$/, '')} :${h.lineNumber}  ${h.lineContent.slice(0, 55)}`
          ))
        })
        return
      }
      if (key.backspace || key.delete) setQuery((q) => q.slice(0, -1))
      else if (input && input.length === 1) setQuery((q) => q + input)
    }
  })

  // ─── Tela de busca ────────────────────────────────────────────────────────
  if (screen === 'search') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold color="magenta">◆ Buscar no vault</Text>
        <Box marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1} width={Math.min(50, cols - 4)}>
          <Text>/ {query}<Text color="cyanBright">█</Text></Text>
        </Box>
        {results.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>{results.length} resultado(s)</Text>
            {results.slice(0, rows - 8).map((r, i) => (
              <Text key={i} dimColor>  {r}</Text>
            ))}
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter buscar  ·  Esc voltar</Text>
        </Box>
      </Box>
    )
  }

  // ─── Tela de leitura ──────────────────────────────────────────────────────
  if (screen === 'read') {
    const noteName = files[cursor]?.name.replace(/\.md$/, '') ?? ''
    return (
      <Box flexDirection="column">
        <Box paddingX={1} borderStyle="single" borderColor="magenta">
          <Text bold color="magenta">◆ {noteName}</Text>
          <Text dimColor>  b/Esc voltar</Text>
        </Box>
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          {content.slice(0, rows - 4).map((line, i) => {
            const color = line.startsWith('# ') ? 'magenta'
              : line.startsWith('## ') ? 'cyan'
              : line.startsWith('### ') ? 'white'
              : undefined
            return (
              <Text key={i} color={color} bold={line.startsWith('#')} dimColor={!color && line !== ''}>
                {line || ' '}
              </Text>
            )
          })}
        </Box>
      </Box>
    )
  }

  // ─── Árvore principal ─────────────────────────────────────────────────────
  const visibleFiles = files.slice(0, rows - 5)
  const activeFile   = files[cursor]

  return (
    <Box flexDirection="column" height={rows}>
      {/* Header */}
      <Box borderStyle="single" borderColor="magenta" paddingX={1}>
        <Text bold color="magenta">◆ Browsidian</Text>
        <Text dimColor>  {service.vaultPath.split('/').pop()}</Text>
      </Box>

      {/* Corpo: sidebar + preview */}
      <Box flexGrow={1}>
        {/* Sidebar */}
        <Box width={sideW} flexDirection="column" borderStyle="single" borderColor="gray">
          {visibleFiles.map((f, i) => {
            const sel = i === cursor
            const name = f.name.replace(/\.md$/, '').slice(0, sideW - 5)
            return (
              <Box key={f.path} paddingX={1}>
                <Text color={sel ? 'magentaBright' : 'gray'} bold={sel} inverse={sel}>
                  {sel ? '◆' : '◇'} {name}
                </Text>
              </Box>
            )
          })}
        </Box>

        {/* Preview */}
        <Box flexGrow={1} flexDirection="column" paddingX={2} paddingTop={1}>
          {activeFile
            ? <Preview service={service} file={activeFile} maxLines={rows - 5} />
            : <Text dimColor>Nenhuma nota selecionada</Text>
          }
        </Box>
      </Box>

      {/* Status */}
      <Box paddingX={1}>
        <Text dimColor>{status}</Text>
      </Box>
    </Box>
  )
}

function Preview({ service, file, maxLines }: { service: VaultService; file: VaultFile; maxLines: number }) {
  const [lines, setLines] = useState<string[] | null>(null)

  useEffect(() => {
    setLines(null)
    service.read(file.path).then((t) => setLines(t.split('\n')))
  }, [file.path])

  if (!lines) return <Text dimColor>Carregando…</Text>

  return (
    <>
      {lines.slice(0, maxLines).map((line, i) => {
        const color = line.startsWith('# ') ? 'magenta'
          : line.startsWith('## ') ? 'cyan'
          : line.startsWith('### ') ? 'white'
          : undefined
        return (
          <Text key={i} color={color} bold={line.startsWith('#')} dimColor={!color && line !== ''}>
            {line || ' '}
          </Text>
        )
      })}
    </>
  )
}
