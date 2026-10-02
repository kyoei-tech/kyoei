'use client'
import { useActionState, useState, useTransition } from 'react'
import { VENDORS } from '@/lib/repair'
import { createClient } from '@/lib/supabase/client'
import { completeRepair, decideRepair, type RepairResult } from '../actions'

export function DecisionForm({ id, initial, stamped }: {
  id: string; stamped: boolean
  initial: { method: string | null; vendor: string | null; requestedOn: string | null; entryOn: string | null; note: string }
}) {
  const [state, action, busy] = useActionState(decideRepair, null as RepairResult | null)
  const [method, setMethod] = useState(initial.method ?? '')
  const known = (VENDORS as readonly string[]).includes(initial.vendor ?? '')
  const [vendor, setVendor] = useState(initial.vendor ? (known ? initial.vendor : 'other') : '')
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  return (
    <form action={action} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <input type="hidden" name="id" value={id} />
      <div className="row" style={{ gap: 14 }}>
        <label className="check"><input type="radio" name="method" value="in_house" checked={method === 'in_house'} onChange={() => setMethod('in_house')} />自社整備</label>
        <label className="check"><input type="radio" name="method" value="outsource" checked={method === 'outsource'} onChange={() => setMethod('outsource')} />外注</label>
      </div>
      {method === 'outsource' && (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {VENDORS.map((v) => <label key={v} className="check"><input type="radio" name="vendor" value={v} checked={vendor === v} onChange={() => setVendor(v)} />{v}</label>)}
          <label className="check"><input type="radio" name="vendor" value="other" checked={vendor === 'other'} onChange={() => setVendor('other')} />その他</label>
          {vendor === 'other' && <input className="input" name="vendor_other" defaultValue={known ? '' : (initial.vendor ?? '')} placeholder="依頼先の名前" style={{ width: 220 }} />}
        </div>
      )}
      <div className="row" style={{ gap: 10 }}>
        <label className="field">修理依頼日<input className="input" type="date" name="requested_on" defaultValue={initial.requestedOn ?? today} /></label>
        <label className="field">入庫予定日（必須）<input className="input" type="date" name="entry_on" defaultValue={initial.entryOn ?? ''} required /></label>
      </div>
      <label className="field">ドライバーへのメモ（任意）<input className="input" name="note" defaultValue={initial.note} /></label>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>{stamped ? '予定を変更する' : '社長印を押して予定を決定'}</button>
        {state?.ok && <span style={{ color: 'var(--muted)' }}>保存しました。申請者のアプリに通知されます。</span>}
        {state && !state.ok && <span className="error">{state.error}</span>}
      </div>
    </form>
  )
}

export function CompleteForm({ id, initial }: { id: string; initial: { workDone: string; completedOn: string | null; slips: string[] } }) {
  const [workDone, setWorkDone] = useState(initial.workDone)
  const [completedOn, setCompletedOn] = useState(initial.completedOn ?? '')
  const [slips, setSlips] = useState<string[]>(initial.slips)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // 伝票 go straight from the browser to Storage (slips/ is writable only by MFA-verified admins).
  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    const supabase = createClient()
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() === 'pdf' ? 'pdf' : 'jpg'
      const path = `slips/${id}-${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('repair-photos').upload(path, file, { contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg') })
      if (error) setMessage({ ok: false, text: `${file.name} をアップロードできませんでした（10MBまで）。` })
      else setSlips((s) => [...s, path])
    }
    setUploading(false)
  }

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
      <label className="field">作業内容<textarea className="input" rows={3} value={workDone} onChange={(e) => setWorkDone(e.target.value)} /></label>
      <label className="field" style={{ maxWidth: 220 }}>修理完了日<input className="input" type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} /></label>
      <div className="field">
        伝票（写真・PDF）
        <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => upload(e.target.files)} disabled={uploading} />
        {slips.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {slips.map((p, i) => (
              <span key={p} className="chip chip-gray">伝票{i + 1}<button type="button" onClick={() => setSlips((s) => s.filter((x) => x !== p))} style={{ marginLeft: 6, border: 0, background: 'none', cursor: 'pointer' }}>×</button></span>
            ))}
          </div>
        )}
      </div>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || uploading}
          onClick={() => startTransition(async () => {
            const r = await completeRepair(id, workDone, completedOn || null, slips)
            setMessage(r.ok ? { ok: true, text: completedOn ? '担当印を押しました。申請者のアプリに完了が通知されます。' : '保存しました（完了日が未入力のため、まだ完了ではありません）。' } : { ok: false, text: r.error })
          })}
        >
          {completedOn ? '担当印を押して完了にする' : '途中まで保存'}
        </button>
        {message && <span className={message.ok ? '' : 'error'} style={message.ok ? { color: 'var(--muted)' } : undefined}>{message.text}</span>}
      </div>
    </div>
  )
}
