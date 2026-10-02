'use client'
import { useActionState, useEffect, useState, useTransition } from 'react'
import { CodeDialog } from '@/components/CodeDialog'
import { isTrailerClass, VEHICLE_CLASSES, vehicleClassLabel } from '@/lib/profile'
import { createAccount, issueResetCode, setDisabled, updateAccount, type ActionResult, type IssuedCode } from './actions'

export type AccountView = {
  userId: string
  loginId: string
  staffId: string | null
  staffName: string | null
  isDriver: boolean
  canSearch: boolean
  canCheckLeave: boolean
  isAdmin: boolean
  disabled: boolean
  status: 'use' | 'wait' | 'stop'
  lastSignIn: string | null
  pendingUntil: string | null
  fullName: string
  positionId: string | null
  positionName: string | null
  hireDate: string | null
  vehicleClass: string | null
  vehicleId: string | null
  chassisId: string | null
  vehiclePlates: string[]
  healthCheckDue: string | null
  supervisorId: string | null
}
export type StaffOption = { id: string; name: string; linkedTo: string | null }
export type PositionOption = { id: string; name: string }
export type VehicleOption = { id: string; plate: string; kind: string; holderId: string | null; holderName: string | null }

/** プロフィール fields shared by the invite and edit forms. */
function ProfileFields({ a, positions, vehicles, people }: { a?: AccountView; positions: PositionOption[]; vehicles: VehicleOption[]; people: AccountView[] }) {
  const [vehicleClass, setVehicleClass] = useState(a?.vehicleClass ?? '')
  const trailer = isTrailerClass(vehicleClass)
  const usable = (v: VehicleOption) => !v.holderId || v.holderId === a?.userId
  const options = (kind: string) => vehicles.filter((v) => v.kind === kind)
  return (
    <>
      <label className="field">名前（フルネーム）<input className="input" name="full_name" defaultValue={a?.fullName} placeholder="例：共栄 太郎" /></label>
      <label className="field">役職
        <select className="input" name="position_id" defaultValue={a?.positionId ?? ''}>
          <option value="">（未設定）</option>
          {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="field">上長（自己評価シートを採点する人）
        <select className="input" name="supervisor_id" defaultValue={a?.supervisorId ?? ''}>
          <option value="">（未設定）</option>
          {people.filter((p) => p.userId !== a?.userId && !p.disabled).map((p) => <option key={p.userId} value={p.userId}>{p.fullName || p.staffName || p.loginId}{p.positionName ? `（${p.positionName}）` : ''}</option>)}
        </select>
      </label>
      <label className="field">入社年月日<input className="input" type="date" name="hire_date" defaultValue={a?.hireDate ?? ''} /></label>
      <label className="field">健康診断予定日<input className="input" type="date" name="health_check_due" defaultValue={a?.healthCheckDue ?? ''} /></label>
      <label className="field">担当車格
        <select className="input" name="vehicle_class" value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value)}>
          <option value="">（未設定）</option>
          {VEHICLE_CLASSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field">{trailer ? '担当車両（ヘッド）' : '担当車両'}
        <select className="input" name="vehicle_id" defaultValue={a?.vehicleId ?? ''} key={trailer ? 'head' : 'truck'}>
          <option value="">未定</option>
          {options(trailer ? 'head' : 'truck').map((v) => <option key={v.id} value={v.id} disabled={!usable(v)}>{v.plate}{usable(v) ? '' : `（${v.holderName}）`}</option>)}
        </select>
      </label>
      {trailer && (
        <label className="field">担当車両（台車）
          <select className="input" name="chassis_id" defaultValue={a?.chassisId ?? ''}>
            <option value="">未定</option>
            {options('chassis').map((v) => <option key={v.id} value={v.id} disabled={!usable(v)}>{v.plate}{usable(v) ? '' : `（${v.holderName}）`}</option>)}
          </select>
        </label>
      )}
    </>
  )
}

function RoleChecks({ a }: { a?: AccountView }) {
  return (
    <div className="row" style={{ gap: 14 }}>
      <label className="check"><input type="checkbox" name="is_driver" defaultChecked={a ? a.isDriver : true} />ドライバー</label>
      <label className="check"><input type="checkbox" name="can_search_customers" defaultChecked={a?.canSearch ?? false} />顧客検索</label>
      <label className="check"><input type="checkbox" name="is_admin" defaultChecked={a?.isAdmin ?? false} />管理者</label>
      <label className="check"><input type="checkbox" name="can_check_leave" defaultChecked={a?.canCheckLeave ?? false} />休暇の担当者</label>
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

export function AccountsClient({ accounts, staff, selfId, positions, vehicles }: { accounts: AccountView[]; staff: StaffOption[]; selfId: string; positions: PositionOption[]; vehicles: VehicleOption[] }) {
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
        <form className="card" action={createAction} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, alignItems: 'end' }}>
          <h2 style={{ gridColumn: '1 / -1', margin: 0 }}>アカウントを招待</h2>
          <label className="field">ログインID（社員番号など）<input className="input" name="login_id" required autoComplete="off" /></label>
          <ProfileFields positions={positions} vehicles={vehicles} people={accounts} />
          <label className="field">出勤簿の名前（紐付け）<StaffSelect staff={staff} current={null} /></label>
          <div className="field" style={{ gridColumn: 'span 2' }}>アプリの権限<RoleChecks /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>{creating ? '作成中…' : '作成してコードを発行'}</button>
            <button type="button" className="btn" onClick={() => setInviting(false)}>やめる</button>
          </div>
          {createState && !createState.ok && <div className="error" style={{ gridColumn: '1 / -1' }}>{createState.error}</div>}
        </form>
      )}
      {message && <div className="notice notice-orange error">{message}</div>}

      <table className="table">
        <thead>
          <tr><th>ログインID</th><th>名前・役職</th><th>車格・担当車両</th><th>アプリの権限</th><th>状態</th><th /></tr>
        </thead>
        <tbody>
          {accounts.map((a) =>
            editing === a.userId ? (
              <tr key={a.userId}>
                <td colSpan={6}>
                  <form action={updateAction} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, alignItems: 'end' }}>
                    <input type="hidden" name="user_id" value={a.userId} />
                    <div className="field">ログインID<b className="mono" style={{ color: 'var(--text)', height: 40, display: 'flex', alignItems: 'center' }}>{a.loginId}</b></div>
                    <ProfileFields a={a} positions={positions} vehicles={vehicles} people={accounts} />
                    <label className="field">出勤簿の名前（紐付け）<StaffSelect staff={staff} current={a.staffId} userId={a.userId} /></label>
                    <div className="field" style={{ gridColumn: 'span 2' }}>アプリの権限<RoleChecks a={a} /></div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary" disabled={updating}>保存</button>
                      <button type="button" className="btn" onClick={() => setEditing(null)}>やめる</button>
                    </div>
                    {updateState && !updateState.ok && <div className="error" style={{ gridColumn: '1 / -1' }}>{updateState.error}</div>}
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={a.userId}>
                <td className="mono" style={{ fontWeight: 700 }}>{a.loginId}</td>
                <td>
                  <div style={{ fontWeight: 700 }}>{a.fullName || a.staffName || <span style={{ color: 'var(--muted)' }}>（名前未登録）</span>}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.positionName ?? '役職未設定'}{a.staffName ? ` ・ 出勤簿：${a.staffName}` : ' ・ 出勤簿：未紐付け'}</div>
                </td>
                <td style={{ fontSize: 13 }}>
                  <div>{vehicleClassLabel(a.vehicleClass)}</div>
                  <div className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{a.vehiclePlates.length ? a.vehiclePlates.join(' ／ ') : '車両未定'}</div>
                </td>
                <td>
                  <div className="row" style={{ gap: 4 }}>
                    {a.isDriver && <span className="chip chip-ink">ドライバー</span>}
                    {a.canSearch && <span className="chip chip-lime">顧客検索</span>}
                    {a.canCheckLeave && <span className="chip chip-lime">休暇の担当者</span>}
                    {a.isAdmin && <span className="chip chip-dark">管理者</span>}
                  </div>
                </td>
                <td>
                  {status(a)}
                  {a.pendingUntil && <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 4 }}>コード期限 {new Date(a.pendingUntil).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}</div>}
                  {a.lastSignIn && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>最終ログイン {new Date(a.lastSignIn).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })}</div>}
                </td>
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
