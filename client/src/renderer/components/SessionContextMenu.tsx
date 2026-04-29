import React, { useEffect, useRef } from 'react'
import { ColorLabel, COLOR_LABELS, COLOR_HEX } from '../store'

interface Props {
  x: number
  y: number
  current: ColorLabel | undefined
  onPick: (color: ColorLabel | undefined) => void
  onClose: () => void
}

export default function SessionContextMenu({ x, y, current, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      style={{ top: y, left: x }}
      className="fixed z-50 flex items-center gap-1.5 p-2 bg-terminal-surface border border-terminal-border rounded-lg shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {COLOR_LABELS.map((color) => (
        <button
          key={color}
          onClick={() => {
            onPick(color)
            onClose()
          }}
          className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${
            current === color ? 'ring-2 ring-offset-1 ring-offset-terminal-surface ring-terminal-accent' : ''
          }`}
          style={{ backgroundColor: COLOR_HEX[color] }}
          title={color}
        />
      ))}
      <button
        onClick={() => {
          onPick(undefined)
          onClose()
        }}
        className={`w-4 h-4 rounded-full border border-terminal-subtext transition-transform hover:scale-110 ${
          current === undefined ? 'ring-2 ring-offset-1 ring-offset-terminal-surface ring-terminal-accent' : ''
        }`}
        title="No label"
      />
    </div>
  )
}
