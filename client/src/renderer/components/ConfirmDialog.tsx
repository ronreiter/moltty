import { useEffect } from 'react'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-[360px] bg-terminal-bg border border-terminal-border rounded-xl p-6 flex flex-col gap-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-terminal-text">{title}</h3>
        <p className="text-sm text-terminal-subtext leading-relaxed">{message}</p>
        <div className="flex gap-2 justify-end mt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-terminal-subtext hover:text-terminal-text transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-opacity hover:opacity-90 ${
              destructive
                ? 'bg-terminal-red text-terminal-bg'
                : 'bg-terminal-accent text-terminal-bg'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
