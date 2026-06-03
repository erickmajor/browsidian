import '@excalidraw/excalidraw/index.css'
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useVaultStore } from '@/stores/vault'

const ExcalidrawLib = lazy(() =>
  import('@excalidraw/excalidraw').then(m => ({ default: m.Excalidraw }))
)

const AUTOSAVE_MS = 1200

interface ExcalidrawData {
  elements: unknown[]
  appState: Record<string, unknown>
  files:    Record<string, unknown>
}

function sanitizeAppState(s: Record<string, unknown>): Record<string, unknown> {
  const { collaborators, isLoading, isResizing, isRotating,
    isTranslating, contextMenu, openMenu, ...rest } = s as Record<string, unknown> & {
    collaborators?: unknown; isLoading?: unknown; isResizing?: unknown;
    isRotating?: unknown; isTranslating?: unknown; contextMenu?: unknown; openMenu?: unknown
  }
  void collaborators; void isLoading; void isResizing; void isRotating
  void isTranslating; void contextMenu; void openMenu
  return rest
}

function parseExcalidraw(raw: string, isMd: boolean): ExcalidrawData | null {
  try {
    let jsonStr = raw
    if (isMd) {
      const match = raw.match(/%%[\s\S]*?```json\s*([\s\S]*?)```[\s\S]*?%%/)
      if (!match) return null
      jsonStr = match[1].trim()
    }
    const d = JSON.parse(jsonStr || '{}') as Record<string, unknown>
    return {
      elements: (d.elements as unknown[]) ?? [],
      appState: (d.appState as Record<string, unknown>) ?? {},
      files:    (d.files as Record<string, unknown>) ?? {},
    }
  } catch {
    return null
  }
}

function serialize(data: ExcalidrawData): string {
  return JSON.stringify({
    type: 'excalidraw', version: 2, source: 'browsidian',
    elements: data.elements,
    appState: sanitizeAppState(data.appState),
    files:    data.files,
  }, null, 2)
}

function buildMdContent(original: string, json: string): string {
  const hasBlock = /%%[\s\S]*?```json[\s\S]*?```[\s\S]*?%%/.test(original)
  if (hasBlock) {
    return original.replace(
      /(%%[\s\S]*?```json\s*)([\s\S]*?)(```[\s\S]*?%%)/,
      (_match, pre, _old, post) => `${pre}\n${json}\n${post}`
    )
  }
  return (
    `---\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n---\n\n` +
    `==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==\n\n` +
    `%%\n# Drawing\n\`\`\`json\n${json}\n\`\`\`\n%%`
  )
}

export function ExcalidrawEditor() {
  const { activeFile, adapter } = useVaultStore()
  const isMd = activeFile?.name.endsWith('.excalidraw.md') ?? false

  const [data, setData]     = useState<ExcalidrawData | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef    = useRef<ExcalidrawData>({ elements: [], appState: {}, files: {} })
  const rawRef        = useRef('')
  const adapterRef    = useRef(adapter)
  const activeFileRef = useRef(activeFile)
  const isMdRef       = useRef(isMd)

  useEffect(() => { adapterRef.current = adapter }, [adapter])
  useEffect(() => { activeFileRef.current = activeFile }, [activeFile])
  useEffect(() => { isMdRef.current = isMd }, [isMd])

  // Cleanup autosave timer on unmount
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // Load file when activeFile changes
  useEffect(() => {
    if (!activeFile || !adapter) return
    if (timerRef.current) clearTimeout(timerRef.current)  // cancel pending write from prev file
    setLoaded(false)
    setError(null)
    adapter.readFile(activeFile.path).then(raw => {
      rawRef.current = raw
      const parsed = parseExcalidraw(raw, isMd)
      if (!parsed) {
        if (isMd && raw.trim() === '') {
          setData({ elements: [], appState: {}, files: {} })
          setLoaded(true)
          return
        }
        setError('Arquivo Excalidraw inválido ou corrompido.')
        setLoaded(true)
        return
      }
      setData(parsed)
      setLoaded(true)
    }).catch(() => {
      rawRef.current = ''
      setData({ elements: [], appState: {}, files: {} })
      setLoaded(true)
    })
  }, [activeFile?.path])

  const onChange = useCallback((elements: unknown, appState: unknown, files: unknown) => {
    pendingRef.current = {
      elements: elements as unknown[],
      appState: appState as Record<string, unknown>,
      files:    files as Record<string, unknown>,
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const ad = adapterRef.current
      const af = activeFileRef.current
      if (!ad || !af) return
      const json    = serialize(pendingRef.current)
      const content = isMdRef.current ? buildMdContent(rawRef.current, json) : json
      rawRef.current = content
      ad.writeFile(af.path, content).catch(console.error)
    }, AUTOSAVE_MS)
  }, [])

  if (!loaded) return <div className="canvas-error"><span>Carregando…</span></div>
  if (error)   return <div className="canvas-error"><span>{error}</span></div>
  if (!data)   return null

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={<div className="canvas-error"><span>Carregando Excalidraw…</span></div>}>
        <ExcalidrawLib
          key={activeFile?.path}
          initialData={{
            elements: data.elements as any,
            appState: { gridSize: 20, gridModeEnabled: true, ...data.appState } as any,
            files:    data.files as any,
          }}
          onChange={onChange as any}
        />
      </Suspense>
    </div>
  )
}
