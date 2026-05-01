import { useEffect, useRef, useState } from 'react'
import { ColorLabel, COLOR_LABELS, COLOR_HEX } from '../store'

interface Props {
  x: number
  y: number
  current: ColorLabel | undefined
  onPickColor: (color: ColorLabel | undefined) => void
  onRestart: () => void
  onRename: () => void
  onClone: () => void
  onClose: () => void
  onRemove: () => void
  onDismiss: () => void
}

const ICON_CLS = 'w-3.5 h-3.5 flex-shrink-0'

const RenameIcon = () => (
  <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
)
const CloneIcon = () => (
  <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)
const RestartIcon = () => (
  <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
)
const CloseIcon = () => (
  <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9l6 6m0-6l-6 6" />
  </svg>
)
const RemoveIcon = () => (
  <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
  </svg>
)
const PaletteIcon = () => (
  <svg className={ICON_CLS} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
  </svg>
)

export default function SessionContextMenu({
  x,
  y,
  current,
  onPickColor,
  onRestart,
  onRename,
  onClone,
  onClose,
  onRemove,
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

  const itemCls =
    'w-full text-left px-3 py-1 hover:bg-terminal-bg transition-colors flex items-center gap-2'

  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-[170px] max-w-[220px] py-1 bg-terminal-surface border border-terminal-border rounded-lg shadow-xl text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <button onClick={() => { onRename(); onDismiss() }} className={`${itemCls} text-terminal-text`}>
        <RenameIcon /> Rename session
      </button>
      <button onClick={() => { onClone(); onDismiss() }} className={`${itemCls} text-terminal-text`}>
        <CloneIcon /> Clone session
      </button>
      <button onClick={() => { onRestart(); onDismiss() }} className={`${itemCls} text-terminal-text`}>
        <RestartIcon /> Restart session
      </button>
      <button onClick={() => { onClose(); onDismiss() }} className={`${itemCls} text-terminal-text`}>
        <CloseIcon /> Close session
      </button>
      <button onClick={() => { onRemove(); onDismiss() }} className={`${itemCls} text-terminal-red`}>
        <RemoveIcon /> Remove session
      </button>
      <div className="my-1 border-t border-terminal-border" />
      <button
        onClick={() => setShowColors((v) => !v)}
        className={`${itemCls} text-terminal-text justify-between`}
      >
        <span className="flex items-center gap-2">
          {current ? (
            <span
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLOR_HEX[current] }}
            />
          ) : (
            <PaletteIcon />
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
