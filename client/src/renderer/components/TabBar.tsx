import React, { useRef } from 'react'
import { useStore } from '../store'

export default function TabBar() {
  const openTabs = useStore((s) => s.openTabs)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessions = useStore((s) => s.sessions)
  const openTab = useStore((s) => s.openTab)
  const closeTab = useStore((s) => s.closeTab)
  const reorderTabs = useStore((s) => s.reorderTabs)
  const dragIndex = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)

  const handleDragStart = (index: number) => {
    dragIndex.current = index
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    dragOverIndex.current = index
  }

  const handleDrop = () => {
    if (dragIndex.current !== null && dragOverIndex.current !== null && dragIndex.current !== dragOverIndex.current) {
      reorderTabs(dragIndex.current, dragOverIndex.current)
    }
    dragIndex.current = null
    dragOverIndex.current = null
  }

  return (
    <div className="titlebar-drag flex-shrink-0 h-10 flex items-end bg-terminal-surface border-b border-terminal-border overflow-x-auto">
      {openTabs.map((tabId, index) => {
        const session = sessions.find((s) => s.id === tabId)
        if (!session) return null
        const isActive = tabId === activeSessionId
        return (
          <div
            key={tabId}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onClick={() => openTab(tabId)}
            className={`titlebar-no-drag group flex items-center gap-1.5 pl-2 pr-3 py-1.5 cursor-pointer border-r border-terminal-border text-xs font-medium whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-terminal-bg text-terminal-accent'
                : 'text-terminal-subtext hover:text-terminal-text hover:bg-terminal-bg/50'
            }`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tabId)
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-terminal-red transition-opacity text-[10px] leading-none w-3 text-center"
            >
              ×
            </button>
            <span className="truncate max-w-[140px]">{session.name}</span>
          </div>
        )
      })}
    </div>
  )
}
