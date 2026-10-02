'use client'
import { useActionState, useState, useTransition } from 'react'
import { decideDisclosure, requestDisclosure, type AwardResult } from './actions'

export function DisclosureForm({ ballotId }: { ballotId: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, busy] = useActionState(requestDisclosure, null as AwardResult | null)
  if (!open) {
    return <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>問題がある投票として開示申請</button>
  }
  return (
    <form action={action} style={{ display: 'grid', gap: 8 }}>
      <input type="hidden" name="ballot" value={ballotId} />
      <label className="field">開示が必要な理由（変更履歴に残ります）<textarea className="input" name="reason" rows={2} required /></label>
      <div className="row" style={{ gap: 8 }}>
        <button type="submit" className="btn btn-small btn-danger" disabled={busy}>開示申請する</button>
        <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>やめる</button>
      </div>
      {state && !state.ok && <div className="error">{state.error}</div>}
      {state?.ok && <div style={{ color: 'var(--muted)', fontSize: 13 }}>申請しました。別の管理者の承認待ちです。</div>}
    </form>
  )
}

export function DecideButtons({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const decide = (approve: boolean) => {
    const text = approve ? 'この投票の投票者を開示します。よろしいですか？（変更履歴に残ります）' : 'この開示申請を却下しますか？'
    if (!confirm(text)) return
    startTransition(async () => {
      const r = await decideDisclosure(requestId, approve)
      setError(r.ok ? null : r.error)
    })
  }
  return (
    <div style={{ marginTop: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-small btn-danger" disabled={pending} onClick={() => decide(true)}>承認して開示</button>
        <button type="button" className="btn btn-small" disabled={pending} onClick={() => decide(false)}>却下</button>
      </div>
      {error && <div className="error" style={{ marginTop: 4 }}>{error}</div>}
    </div>
  )
}
