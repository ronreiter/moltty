import { useEffect, useRef, useState } from 'react'
import Editor, { loader, OnMount } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useStore } from '../store'

;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', md: 'markdown', html: 'html', css: 'css', scss: 'scss', less: 'less',
  py: 'python', go: 'go', rs: 'rust', rb: 'ruby', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
  yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini',
  sql: 'sql', php: 'php', xml: 'xml', svg: 'xml', vue: 'html', dockerfile: 'dockerfile'
}

function detectLanguage(path: string): string {
  const base = path.split('/').pop() || ''
  if (base.toLowerCase() === 'dockerfile') return 'dockerfile'
  const ext = base.includes('.') ? base.split('.').pop()?.toLowerCase() ?? '' : ''
  return EXT_TO_LANG[ext] || 'plaintext'
}

export default function CodeEditor() {
  const filePath = useStore((s) => s.editorFilePath)
  const targetLine = useStore((s) => s.editorLine)
  const setEditorFile = useStore((s) => s.setEditorFile)
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)

  useEffect(() => {
    if (!filePath) return
    setLoading(true)
    setError(null)
    setContent('')
    setOriginalContent('')
    window.electronAPI.readFile(filePath).then((res) => {
      setLoading(false)
      if (res.ok && res.content !== undefined) {
        setContent(res.content)
        setOriginalContent(res.content)
      } else if (res.isDirectory) {
        setError('Cannot open a directory.')
      } else {
        setError(res.error || 'Failed to read file.')
      }
    })
  }, [filePath])

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    jumpToTargetLine()
  }

  const jumpToTargetLine = () => {
    const ed = editorRef.current
    if (!ed || !targetLine) return
    ed.revealLineInCenter(targetLine)
    ed.setPosition({ lineNumber: targetLine, column: 1 })
    ed.focus()
  }

  // Re-jump when target line or file changes (after content loads)
  useEffect(() => {
    if (loading || error) return
    jumpToTargetLine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetLine, filePath, loading, error])

  const dirty = content !== originalContent

  const save = async () => {
    if (!filePath || !dirty || saving) return
    setSaving(true)
    const res = await window.electronAPI.writeFile(filePath, content)
    setSaving(false)
    if (res.ok) {
      setOriginalContent(content)
    } else {
      setError(res.error || 'Failed to save.')
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && filePath) {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  if (!filePath) return null

  const displayPath = filePath.replace(/^\/Users\/[^/]+/, '~')
  const language = detectLanguage(filePath)

  return (
    <div className="h-full w-full flex flex-col bg-terminal-bg border-l border-terminal-border">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-terminal-surface border-b border-terminal-border">
        <span className="text-xs text-terminal-text font-mono truncate flex-1" title={filePath}>
          {displayPath}{dirty ? ' •' : ''}
        </span>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="text-xs px-2 py-0.5 rounded text-terminal-accent border border-terminal-accent/50 hover:border-terminal-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Save (Cmd+S)"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={() => setEditorFile(null)}
          className="text-terminal-subtext hover:text-terminal-red text-sm leading-none px-1"
          title="Close editor"
        >
          ×
        </button>
      </div>
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10">
            <div className="w-5 h-5 border-2 border-terminal-accent/30 border-t-terminal-accent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-terminal-bg z-10 px-6">
            <p className="text-sm text-terminal-red text-center">{error}</p>
          </div>
        )}
        {!loading && !error && (
          <Editor
            theme="vs-dark"
            language={language}
            value={content}
            onChange={(v) => setContent(v ?? '')}
            onMount={handleMount}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on'
            }}
          />
        )}
      </div>
    </div>
  )
}
