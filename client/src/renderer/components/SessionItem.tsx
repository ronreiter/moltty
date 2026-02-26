import React, { useState, useRef, useEffect } from 'react'
import { Session } from '../store'

interface Props {
  session: Session
  isActive: boolean
  onClick: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

export default function SessionItem({ session, isActive, onClick, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(session.name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.select()
    }
  }, [editing])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditName(session.name)
    setEditing(true)
  }

  const handleSubmitRename = () => {
    if (editName.trim() && editName !== session.name) {
      onRename(editName.trim())
    }
    setEditing(false)
  }

  const statusColor = {
    creating: 'bg-yellow-400',
    running: 'bg-terminal-green',
    stopped: 'bg-terminal-subtext',
    error: 'bg-terminal-red',
    offline: 'bg-yellow-400'
  }[session.status]

  return (
    <div
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-terminal-accent/20 text-terminal-accent' : 'hover:bg-terminal-bg text-terminal-text'
      }`}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />

      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSubmitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmitRename()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="flex-1 bg-terminal-bg px-2 py-0.5 rounded text-sm text-terminal-text outline-none border border-terminal-accent"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="flex-1 min-w-0">
          <span className="text-sm truncate block">{session.name}</span>
          {session.workDir && (
            <span className="text-[10px] text-terminal-subtext truncate block">
              {session.workDir.replace(/^\/Users\/[^/]+/, '~')}
            </span>
          )}
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 text-terminal-subtext hover:text-terminal-red transition-all text-xs"
        title="Delete session"
      >
        ×
      </button>
    </div>
  )
}
