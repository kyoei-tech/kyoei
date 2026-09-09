'use client'

import { useCallback, useState } from 'react'
import { Lock } from 'lucide-react'

/** Full-screen overlay that asks for a 4-digit password before an edit action proceeds. */
export function PasswordPrompt({
  expectedCode,
  title = 'パスワードを入力してください',
  onSuccess,
  onCancel,
}: {
  expectedCode: string
  title?: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  function submit() {
    if (value === expectedCode) {
      onSuccess()
    } else {
      setError(true)
      setValue('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-xs rounded-3xl border border-border bg-card p-6">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <p className="text-center text-sm font-semibold text-foreground">
          {title}
        </p>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoFocus
          value={value}
          onChange={(e) => {
            setError(false)
            setValue(e.target.value.replace(/[^0-9]/g, ''))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="パスワード"
          className={`mt-4 w-full rounded-2xl border bg-background px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none transition-colors ${
            error ? 'border-destructive' : 'border-border focus:border-primary/60'
          }`}
        />
        {error && (
          <p className="mt-2 text-center text-xs font-semibold text-destructive">
            パスワードが違います
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={value.length !== 4}
            className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Gates edit actions behind a password. Once entered correctly, stays
 * unlocked for the lifetime of the component that owns this hook (i.e.
 * until the user leaves the tab and it unmounts), so repeated edits within
 * the same visit don't re-prompt.
 */
export function usePasswordGate(expectedCode: string) {
  const [unlocked, setUnlocked] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(
    null,
  )

  const guard = useCallback(
    (action: () => void) => {
      if (unlocked) {
        action()
        return
      }
      setPendingAction(() => action)
    },
    [unlocked],
  )

  const prompt = pendingAction ? (
    <PasswordPrompt
      expectedCode={expectedCode}
      onSuccess={() => {
        setUnlocked(true)
        const action = pendingAction
        setPendingAction(null)
        action()
      }}
      onCancel={() => setPendingAction(null)}
    />
  ) : null

  return { guard, prompt, unlocked }
}
