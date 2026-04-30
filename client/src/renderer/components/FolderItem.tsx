import React, { useEffect, useRef, useState } from 'react'
import { Folder, useStore } from '../store'

interface Props {
  folder: Folder
  onDropSession: (sessionId: string) => void
}

export default function FolderItem({ folder, onDropSession }: Props) {
  const toggleFolder = useStore((s) => s.toggleFolder)
  const renameFolder = useStore((s) => s.renameFolder)
  const removeFolder = useStore((s) => s.removeFolder)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const submitRename = () => {
    if (editName.trim() && editName !== folder.name) {
      renameFolder(folder.id, editName.trim())
    }
    setEditing(false)
  }

  return (
    <div
      onClick={() => toggleFolder(folder.id)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditName(folder.name)
        setEditing(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const sessionId = e.dataTransfer.getData('application/x-session-id')
        if (sessionId) onDropSession(sessionId)
      }}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-terminal-text transition-colors ${
        dragOver ? 'bg-terminal-accent/20 ring-1 ring-terminal-accent' : 'hover:bg-terminal-bg'
      }`}
    >
      <span className="text-terminal-subtext text-[10px] w-3 flex-shrink-0">
        {folder.expanded ? '▼' : '▶'}
      </span>
      <svg className="w-3.5 h-3.5 text-terminal-subtext flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-terminal-bg px-1.5 py-0.5 rounded text-xs text-terminal-text outline-none border border-terminal-accent"
        />
      ) : (
        <span className="flex-1 text-xs font-semibold truncate">{folder.name}</span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation()
          removeFolder(folder.id)
        }}
        className="opacity-0 group-hover:opacity-100 text-terminal-subtext hover:text-terminal-red transition-all text-xs leading-none"
        title="Delete folder"
      >
        ×
      </button>
    </div>
  )
}
