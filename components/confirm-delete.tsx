'use client'

import { Trash2 } from 'lucide-react'

/** Inline "are you sure?" panel shown after a delete action is tapped. */
export function ConfirmDeleteInline({
  message = '本当に削除しますか？',
  onConfirm,
  onCancel,
}: {
  message?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
      <p className="text-sm font-medium text-foreground">{message}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-full bg-destructive px-4 py-1.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 active:scale-95"
        >
          削除する
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

export function DeleteIconButton({
  onClick,
  label,
  className = '',
}: {
  onClick: () => void
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-destructive active:scale-90 ${className}`}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  )
}
