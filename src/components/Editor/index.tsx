import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { useVaultStore } from '@/stores/vault'
import { Preview } from '@/components/Preview'
import { registeredViews, registeredExtensions } from '@/plugins/processorRegistry'
import { TFile } from '@/plugins/shim/types'

function PluginView({ viewType, filePath }: { viewType: string; filePath: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const containerEl = containerRef.current
    if (!containerEl) return
    const creator = registeredViews.get(viewType)
    if (!creator) return

    const contentEl = document.createElement('div')
    contentEl.className = 'plugin-view-content'
    contentEl.style.cssText = 'height:100%;overflow:auto'
    containerEl.appendChild(contentEl)

    const leaf: any = {
      containerEl,
      contentEl,
      view: null as any,
      app: (globalThis as any).app,
      open: (v: any) => { leaf.view = v; return Promise.resolve() },
      setViewState: (state: any) => { try { leaf.view?.setState?.(state) } catch {}; return Promise.resolve() },
      getViewState: () => ({ type: viewType, state: { file: filePath } }),
      getDisplayText: () => filePath.split('/').pop() ?? filePath,
      getRoot: () => leaf,
      getEphemeralState: () => ({}),
      setEphemeralState: () => {},
    }

    let view: any
    try {
      view = creator(leaf)
      leaf.view = view
      if (!view.file) view.file = new TFile(filePath)
      view.load()
      void leaf.setViewState({ type: viewType, state: { file: filePath } })
    } catch (err) {
      console.warn(`[plugin-view:${viewType}] mount error:`, err)
      contentEl.textContent = `Plugin view error: ${(err as Error).message}`
    }

    return () => {
      try { view?.unload() } catch {}
      containerEl.innerHTML = ''
    }
  }, [viewType, filePath])

  return <div ref={containerRef} className="plugin-view-container" style={{ height: '100%', overflow: 'hidden' }} />
}

export function EditorArea() {
  const { activeFile, content, isDirty, showPreview, setContent, saveFile, setShowPreview } = useVaultStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef      = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const view = new EditorView({
      parent: containerRef.current,
      state: makeState('', setContent, saveFile),
    })
    viewRef.current = view
    return () => { view.destroy(); viewRef.current = null }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() !== content) {
      view.setState(makeState(content, setContent, saveFile))
    }
  }, [activeFile?.path])

  useEffect(() => {
    if (!showPreview && viewRef.current) {
      viewRef.current.focus()
    }
  }, [showPreview])

  const handleBlur = () => {
    if (isDirty) void saveFile()
  }

  const switchToSource = () => setShowPreview(false)
  const switchToPreview = () => { if (isDirty) void saveFile(); setShowPreview(true) }

  const isMd = activeFile?.name.toLowerCase().endsWith('.md') ?? false
  const ext  = activeFile?.name.split('.').pop()?.toLowerCase() ?? ''
  const customViewType = registeredExtensions.get(ext)
  const hasCustomView  = !!activeFile && !isMd && !!customViewType && registeredViews.has(customViewType)
  const showCmEditor   = !!activeFile && isMd && !showPreview && !hasCustomView

  return (
    <div className="editor-wrap">
      {activeFile && isMd && !hasCustomView && (
        <div className="editor-mode-tabs">
          <button
            className={`editor-mode-tab${showCmEditor ? ' active' : ''}`}
            onClick={switchToSource}
          >
            Código
          </button>
          <button
            className={`editor-mode-tab${!showCmEditor ? ' active' : ''}`}
            onClick={switchToPreview}
          >
            Visualização
          </button>
        </div>
      )}
      <div className="editor-content">
        {/*
          CodeMirror container is always in the DOM so useEffect([], []) reliably
          creates the EditorView on mount. Visibility is toggled via display:none.
        */}
        <div
          className="cm-editor-outer"
          onBlur={handleBlur}
          style={showCmEditor ? undefined : { display: 'none' }}
        >
          <div ref={containerRef} style={{ height: '100%' }} />
        </div>

        {!showCmEditor && (
          !activeFile ? (
            <div className="preview">
              <span className="muted">Select a file on the left…</span>
            </div>
          ) : hasCustomView ? (
            <PluginView viewType={customViewType!} filePath={activeFile.path} />
          ) : (
            <Preview />
          )
        )}
      </div>
    </div>
  )
}

function makeState(
  doc:      string,
  onChange: (v: string) => void,
  onSave:   () => Promise<void>,
) {
  return EditorState.create({
    doc,
    extensions: [
      oneDark,
      markdown(),
      history(),
      lineNumbers(),
      highlightActiveLine(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        { key: 'Mod-s', run() { void onSave(); return true } },
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange(u.state.doc.toString())
      }),
      EditorView.theme({
        '&':            { height: '100%', fontSize: '14px', background: 'var(--panel)' },
        '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.65', padding: '14px 0' },
        '.cm-content':  { padding: '0 28px' },
        '.cm-gutters':  { background: 'transparent', border: 'none', color: 'var(--muted)' },
      }),
    ],
  })
}
