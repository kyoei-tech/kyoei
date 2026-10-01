'use client'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { CodeDialog } from '@/components/CodeDialog'
import { createAccount, issueResetCode, setDisabled, updateAccount, type ActionResult, type IssuedCode } from './actions'

export type AccountView = {
  userId: string
  loginId: string
  staffId: string | null
  staffName: string | null
  isDriver: boolean
  canSearch: boolean
  isAdmin: boolean
  disabled: boolean
  status: 'use' | 'wait' | 'stop'
  lastSignIn: string | null
  pendingUntil: string | null
}
export type StaffOption = { id: string; name: string; linkedTo: string | null }

function RoleChecks({ a }: { a?: AccountView }) {
  return (
    <div className="row" style={{ gap: 14 }}>
      <label className="check"><input type="checkbox" name="is_driver" defaultChecked={a ? a.isDriver : true} />ドライバー</label>
      <label className="check"><input type="checkbox" name="can_search_customers" defaultChecked={a?.canSearch ?? false} />顧客検索</label>
      <label className="check"><input type="checkbox" name="is_admin" defaultChecked={a?.isAdmin ?? false} />管理者</label>
    </div>
  )
}

function StaffSelect({ staff, current, userId }: { staff: StaffOption[]; current: string | null; userId?: string }) {
  return (
    <select className="input" name="staff_id" defaultValue={current ?? ''}>
      <option value="">（紐付けない）</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id} disabled={!!s.linkedTo && s.linkedTo !== userId}>
          {s.name}{s.linkedTo && s.linkedTo !== userId ? '（紐付け済み）' : ''}
        </option>
      ))}
    </select>
  )
}

export function AccountsClient({ accounts, staff, selfId }: { accounts: AccountView[]; staff: StaffOption[]; selfId: string }) {
  const [issued, setIssued] = useState<IssuedCode | null>(null)
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [createState, createAction, creating] = useActionState(createAccount, null as ActionResult | null)
  const [updateState, updateAction, updating] = useActionState(updateAccount, null as ActionResult | null)

  useEffect(() => {
    if (createState?.ok && createState.issued) {
      setIssued(createState.issued)
      setInviting(false)
    }
  }, [createState])
  useEffect(() => {
    if (updateState?.ok) setEditing(null)
  }, [updateState])

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) setMessage(result.error)
      else if (result.issued) setIssued(result.issued)
      else setMessage(null)
    })

  const status = (a: AccountView) =>
    a.status === 'stop' ? <span className="chip chip-red">停止中</span> : a.status === 'wait' ? <span className="chip chip-orange">設定待ち</span> : <span className="chip chip-ink">利用中</span>

  return (
    <>
      <div className="page-header">
        <div>
          <h1>アカウント</h1>
          <p>アプリを使える人の招待・権限・停止を管理します。招待は、コードまたは QR コードを本人に渡して行います（メールは送りません）。</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setInviting((v) => !v)}>＋ アカウントを招待</button>
      </div>

      {inviting && (
        <form className="card" action={createAction} style={{ display: 'grid', gridTemplateColumns: '200px 240px minmax(0,1fr) auto', gap: 14, alignItems: 'end' }}>
          <label className="field">ログインID（社員番号など）<input className="input" name="login_id" required autoComplete="off" /></label>
          <label className="field">出勤簿の名前<StaffSelect staff={staff} current={null} /></label>
          <div className="field">権限<RoleChecks /></div>
          <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? '作成中…' : '作成してコードを発行'}</button>
          {createState && !createState.ok && <div className="error" style={{ gridColumn: '1 / -1' }}>{createState.error}</div>}
        </form>
      )}
      {message && <div className="notice notice-orange error">{message}</div>}

      <table className="table">
        <thead>
          <tr><th>ログインID</th><th>名前（出勤簿）</th><th>権限</th><th>状態</th><th>最終ログイン</th><th /></tr>
        </thead>
        <tbody>
          {accounts.map((a) =>
            editing === a.userId ? (
              <tr key={a.userId}>
                <td colSpan={6}>
                  <form action={updateAction} style={{ display: 'grid', gridTemplateColumns: '160px 240px minmax(0,1fr) auto auto', gap: 14, alignItems: 'end' }}>
                    <input type="hidden" name="user_id" value={a.userId} />
                    <div className="field">ログインID<b className="mono" style={{ color: 'var(--text)', height: 40, display: 'flex', alignItems: 'center' }}>{a.loginId}</b></div>
                    <label className="field">出勤簿の名前<StaffSelect staff={staff} current={a.staffId} userId={a.userId} /></label>
                    <div className="field">権限<RoleChecks a={a} /></div>
                    <button type="submit" className="btn btn-primary" disabled={updating}>保存</button>
                    <button type="button" className="btn" onClick={() => setEditing(null)}>やめる</button>
                    {updateState && !updateState.ok && <div className="error" style={{ gridColumn: '1 / -1' }}>{updateState.error}</div>}
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={a.userId}>
                <td className="mono" style={{ fontWeight: 700 }}>{a.loginId}</td>
                <td>{a.staffName ?? <span style={{ color: 'var(--muted)' }}>（未紐付け）</span>}</td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    {a.isDriver && <span className="chip chip-ink">ドライバー</span>}
                    {a.canSearch && <span className="chip chip-lime">顧客検索</span>}
                    {a.isAdmin && <span className="chip chip-dark">管理者</span>}
                  </div>
                </td>
                <td>
                  {status(a)}
                  {a.pendingUntil && <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 4 }}>コード期限 {new Date(a.pendingUntil).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}</div>}
                </td>
                <td style={{ fontSize: 13, color: 'var(--muted)' }}>{a.lastSignIn ? new Date(a.lastSignIn).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    {!a.disabled && <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => issueResetCode(a.userId))}>{a.status === 'wait' ? '招待コード再発行' : '再設定コード'}</button>}
                    <button type="button" className="btn btn-small" onClick={() => setEditing(a.userId)}>編集</button>
                    {a.userId !== selfId &&
                      (a.disabled ? (
                        <button type="button" className="btn btn-small" disabled={pending} onClick={() => run(() => setDisabled(a.userId, false))}>再開</button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          disabled={pending}
                          onClick={() => {
                            if (confirm(`${a.loginId} を停止しますか？ ログインできなくなり、端末の顧客データは次の同期で消去されます。`)) run(() => setDisabled(a.userId, true))
                          }}
                        >
                          停止
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      {issued && <CodeDialog issued={issued} onClose={() => setIssued(null)} />}
    </>
  )
}
