import React, { useState, useRef, useEffect } from 'react'
import { Session, useStore, COLOR_HEX } from '../store'
import SessionContextMenu from './SessionContextMenu'

interface Props {
  session: Session
  isActive: boolean
  onClick: () => void
  onRename: (name: string) => void
  onDelete: () => void
}

export default function SessionItem({ session, isActive, onClick, onRename, onDelete }: Props) {
  const isLoaded = useStore((s) => s.loadedSessionIds.has(session.id))
  const isBusy = useStore((s) => s.busySessionIds.has(session.id))
  const hasActivity = useStore((s) => s.activeTabIds.has(session.id))
  const setSessionColor = useStore((s) => s.setSessionColor)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(session.name)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
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

  // grey=dead, orange=starting, blue=attention, green=ok
  const statusColor = session.status !== 'open'
    ? 'bg-terminal-subtext'
    : !isLoaded
      ? 'bg-orange-400'
      : hasActivity
        ? 'bg-blue-400'
        : 'bg-terminal-green'

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const tintBg = session.colorLabel
    ? `color-mix(in srgb, ${COLOR_HEX[session.colorLabel]} 25%, transparent)`
    : undefined
  const borderColor = session.colorLabel ? COLOR_HEX[session.colorLabel] : undefined

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-session-id', session.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={onClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      style={{
        ...(tintBg && !isActive ? { backgroundColor: tintBg } : {}),
        ...(borderColor ? { border: `1px solid ${borderColor}` } : {})
      }}
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
        borderColor ? '' : 'border border-transparent'
      } ${
        isActive ? 'bg-terminal-bg text-terminal-accent' : 'hover:bg-terminal-bg text-terminal-text'
      }`}
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor} ${isBusy ? 'animate-pulse-dot' : ''}`} />

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
          <span className="text-sm truncate block" title={session.name}>{session.name}</span>
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
      {menuPos && (
        <SessionContextMenu
          x={menuPos.x}
          y={menuPos.y}
          current={session.colorLabel}
          onPick={(color) => setSessionColor(session.id, color)}
          onClose={() => setMenuPos(null)}
        />
      )}
    </div>
  )
}
