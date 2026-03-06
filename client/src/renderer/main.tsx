import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// File drag-and-drop: prevent default navigation, send paths to active PTY
document.addEventListener('dragover', (e) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}, true)
document.addEventListener('drop', (e) => {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const p = window.electronAPI?.getPathForFile(files[i]) || ''
    if (p) paths.push(p.includes(' ') ? `'${p.replace(/'/g, "'\\''")}'` : p)
  }
  if (paths.length > 0) {
    window.electronAPI?.sendFileDrop(paths.join(' '))
  }
}, true)


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
