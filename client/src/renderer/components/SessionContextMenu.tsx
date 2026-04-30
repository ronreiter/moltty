import { useEffect, useRef, useState } from 'react'
import { ColorLabel, COLOR_LABELS, COLOR_HEX } from '../store'

interface Props {
  x: number
  y: number
  current: ColorLabel | undefined
  onPickColor: (color: ColorLabel | undefined) => void
  onRestart: () => void
  onClose: () => void
  onDismiss: () => void
}

export default function SessionContextMenu({
  x,
  y,
  current,
  onPickColor,
  onRestart,
  onClose,
  onDismiss
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [showColors, setShowColors] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onDismiss])

  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[160px] py-1 bg-terminal-surface border border-terminal-border rounded-lg shadow-xl text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onRestart()
          onDismiss()
        }}
        className="w-full text-left px-3 py-1.5 text-terminal-text hover:bg-terminal-bg transition-colors"
      >
        Restart session
      </button>
      <button
        onClick={() => {
          onClose()
          onDismiss()
        }}
        className="w-full text-left px-3 py-1.5 text-terminal-text hover:bg-terminal-bg transition-colors"
      >
        Close session
      </button>
      <div className="my-1 border-t border-terminal-border" />
      <button
        onClick={() => setShowColors((v) => !v)}
        className="w-full text-left px-3 py-1.5 text-terminal-text hover:bg-terminal-bg transition-colors flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          {current && (
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: COLOR_HEX[current] }}
            />
          )}
          Change color
        </span>
        <span className="text-terminal-subtext text-xs">{showColors ? '▾' : '▸'}</span>
      </button>
      {showColors && (
        <div className="flex items-center gap-1.5 px-3 py-2">
          {COLOR_LABELS.map((color) => (
            <button
              key={color}
              onClick={() => {
                onPickColor(color)
                onDismiss()
              }}
              className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${
                current === color
                  ? 'ring-2 ring-offset-1 ring-offset-terminal-surface ring-terminal-accent'
                  : ''
              }`}
              style={{ backgroundColor: COLOR_HEX[color] }}
              title={color}
            />
          ))}
          <button
            onClick={() => {
              onPickColor(undefined)
              onDismiss()
            }}
            className={`w-4 h-4 rounded-full border border-terminal-subtext transition-transform hover:scale-110 ${
              current === undefined
                ? 'ring-2 ring-offset-1 ring-offset-terminal-surface ring-terminal-accent'
                : ''
            }`}
            title="No label"
          />
        </div>
      )}
    </div>
  )
}
