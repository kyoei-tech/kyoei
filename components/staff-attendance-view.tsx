'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, User, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline } from './confirm-delete'

// Shared across every browser via the `staff_members` Supabase table.
type StaffRow = {
  id: string
  name: string
  role: string
  vehicle_class: string
  status: 'working' | 'off'
  sort_order: number
  hire_date: string | null
  comment: string
}

async function fetchStaffRows(): Promise<StaffRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('staff_members')
    .select(
      'id, name, role, vehicle_class, status, sort_order, hire_date, comment',
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as StaffRow[]) ?? []
}

function emptyForm() {
  return {
    name: '',
    role: '',
    vehicleClass: '',
    hireYear: '',
    hireMonth: '',
    hireDay: '',
  }
}

function daysInMonth(year: string, month: string) {
  const y = Number(year)
  const m = Number(month)
  if (!y || !m) return 31
  return new Date(y, m, 0).getDate()
}

function toIsoDate(year: string, month: string, day: string): string | null {
  if (!year || !month || !day) return null
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function splitIsoDate(iso: string | null) {
  if (!iso) return { hireYear: '', hireMonth: '', hireDay: '' }
  const [y, m, d] = iso.split('-')
  return { hireYear: y ?? '', hireMonth: m ?? '', hireDay: d ?? '' }
}

// Full years of service as of today, or null if no hire date is on record.
function tenureYears(iso: string | null): number | null {
  if (!iso) return null
  const hire = new Date(iso)
  if (Number.isNaN(hire.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - hire.getFullYear()
  const anniversaryPassed =
    now.getMonth() > hire.getMonth() ||
    (now.getMonth() === hire.getMonth() && now.getDate() >= hire.getDate())
  if (!anniversaryPassed) years -= 1
  return Math.max(years, 0)
}

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => CURRENT_YEAR - i)
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)

export function StaffAttendanceView() {
  const [editMode, setEditMode] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [commentEditId, setCommentEditId] = useState<string | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [tapState, setTapState] = useState<
    Record<
      string,
      { count: number; timer: ReturnType<typeof setTimeout> | null }
    >
  >({})

  const { data: rows, mutate: refetch } = useRealtimeTable<StaffRow>(
    'staff_members',
    fetchStaffRows,
  )

  const staff = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  )

  // 役職者（role holders）keep their manual/creation order. Staff with no
  // role are shown below a divider, ordered by tenure ascending (newest
  // hires first) since they have no manual position to preserve.
  const roleHolders = useMemo(
    () => staff.filter((m) => m.role.trim()),
    [staff],
  )
  const noRole = useMemo(() => {
    return [...staff.filter((m) => !m.role.trim())].sort((a, b) => {
      const ta = tenureYears(a.hire_date) ?? -1
      const tb = tenureYears(b.hire_date) ?? -1
      if (ta !== tb) return ta - tb
      return a.sort_order - b.sort_order
    })
  }, [staff])

  function openAdd() {
    setForm(emptyForm())
    setEditingId(null)
    setAdding(true)
  }

  function openEdit(member: StaffRow) {
    setForm({
      name: member.name,
      role: member.role,
      vehicleClass: member.vehicle_class,
      ...splitIsoDate(member.hire_date),
    })
    setEditingId(member.id)
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  async function saveMember() {
    const name = form.name.trim()
    if (!name) return
    const supabase = createClient()
    const hireDate = toIsoDate(form.hireYear, form.hireMonth, form.hireDay)
    if (editingId) {
      await supabase
        .from('staff_members')
        .update({
          name,
          role: form.role.trim(),
          vehicle_class: form.vehicleClass.trim(),
          hire_date: hireDate,
        })
        .eq('id', editingId)
    } else {
      await supabase.from('staff_members').insert({
        name,
        role: form.role.trim(),
        vehicle_class: form.vehicleClass.trim(),
        hire_date: hireDate,
        status: 'off',
        sort_order: staff.length,
      })
    }
    await refetch()
    closeForm()
  }

  async function deleteMember(id: string) {
    const supabase = createClient()
    await supabase.from('staff_members').delete().eq('id', id)
    await refetch()
    setConfirmDeleteId(null)
    closeForm()
  }

  async function toggleStatus(member: StaffRow) {
    const next = member.status === 'working' ? 'off' : 'working'
    const supabase = createClient()
    await supabase
      .from('staff_members')
      .update({ status: next })
      .eq('id', member.id)
    await refetch()
  }

  function openCommentEdit(member: StaffRow) {
    setCommentEditId(member.id)
    setCommentDraft(member.comment ?? '')
  }

  function closeCommentEdit() {
    setCommentEditId(null)
    setCommentDraft('')
  }

  async function saveComment() {
    if (!commentEditId) return
    const supabase = createClient()
    await supabase
      .from('staff_members')
      .update({ comment: commentDraft.trim() })
      .eq('id', commentEditId)
    await refetch()
    closeCommentEdit()
  }

  // Taps are resolved once the input pauses: a rapid triple tap toggles
  // attendance immediately (so it stays snappy), while a tap sequence that
  // stops at exactly two opens the comment-only editor after the pause,
  // since we can't know a 2nd tap is final until no 3rd tap follows.
  function handleTap(member: StaffRow) {
    if (editMode) {
      openEdit(member)
      return
    }
    setTapState((prev) => {
      const current = prev[member.id]
      const count = (current?.count ?? 0) + 1
      if (current?.timer) clearTimeout(current.timer)
      if (count >= 3) {
        toggleStatus(member)
        return { ...prev, [member.id]: { count: 0, timer: null } }
      }
      const timer = setTimeout(() => {
        setTapState((p) => ({ ...p, [member.id]: { count: 0, timer: null } }))
        if (count === 2) openCommentEdit(member)
      }, 500)
      return { ...prev, [member.id]: { count, timer } }
    })
  }

  function renderCard(member: StaffRow) {
    const working = member.status === 'working'
    const tenure = tenureYears(member.hire_date)
    return (
      <button
        key={member.id}
        type="button"
        onClick={() => handleTap(member)}
        className={`flex min-h-[132px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-4 text-center transition-colors active:scale-[0.97] ${
          working
            ? 'border-secondary bg-secondary/15'
            : 'border-primary/50 bg-primary/10'
        }`}
      >
        {editMode && (
          <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-secondary">
            <Pencil className="h-3 w-3" aria-hidden="true" />
            編集
          </span>
        )}
        <span
          className={`text-base font-bold ${
            working ? 'text-secondary' : 'text-primary'
          }`}
        >
          {working ? '出勤中' : '退勤済み'}
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {member.name}
        </span>
        <span className="text-xs text-muted-foreground">
          {[member.role, member.vehicle_class].filter(Boolean).join(' / ') ||
            '—'}
        </span>
        {tenure !== null && (
          <span className="text-xs text-muted-foreground">
            勤続{tenure}年
          </span>
        )}
        <span className="line-clamp-2 min-h-[2rem] w-full whitespace-pre-wrap px-1 text-[11px] leading-4 text-muted-foreground">
          {working ? member.comment : ''}
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">出勤簿</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ボタンを3回連続でタップすると出勤状況が切り替わります。2回タップでコメントを編集できます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditMode((v) => !v)
            closeForm()
            closeCommentEdit()
          }}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors active:scale-95 ${
            editMode
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {editMode ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Pencil className="h-4 w-4" aria-hidden="true" />
          )}
          {editMode ? '完了' : '編集'}
        </button>
      </div>

      {editMode && !adding && (
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          社員を追加
        </button>
      )}

      {adding && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
          <h3 className="text-sm font-bold text-foreground">
            {editingId ? '社員を編集' : '社員を追加'}
          </h3>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              役職
            </span>
            <input
              type="text"
              value={form.role}
              onChange={(e) =>
                setForm((p) => ({ ...p, role: e.target.value }))
              }
              placeholder="例：部長"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              入社年月日
            </span>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={form.hireYear}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hireYear: e.target.value }))
                }
                className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
              >
                <option value="">年</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>
                    {y}年
                  </option>
                ))}
              </select>
              <select
                value={form.hireMonth}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hireMonth: e.target.value }))
                }
                className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
              >
                <option value="">月</option>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}月
                  </option>
                ))}
              </select>
              <select
                value={form.hireDay}
                onChange={(e) =>
                  setForm((p) => ({ ...p, hireDay: e.target.value }))
                }
                className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
              >
                <option value="">日</option>
                {Array.from(
                  { length: daysInMonth(form.hireYear, form.hireMonth) },
                  (_, i) => i + 1,
                ).map((d) => (
                  <option key={d} value={d}>
                    {d}日
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const previewTenure = tenureYears(
                toIsoDate(form.hireYear, form.hireMonth, form.hireDay),
              )
              return previewTenure !== null ? (
                <span className="mt-0.5 text-xs font-medium text-primary">
                  勤続{previewTenure}年
                </span>
              ) : null
            })()}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              担当車格
            </span>
            <input
              type="text"
              value={form.vehicleClass}
              onChange={(e) =>
                setForm((p) => ({ ...p, vehicleClass: e.target.value }))
              }
              placeholder="例：小型"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              名前
            </span>
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="例：山田 太郎"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            {editingId ? (
              confirmDeleteId === editingId ? (
                <ConfirmDeleteInline
                  onConfirm={() => deleteMember(editingId)}
                  onCancel={() => setConfirmDeleteId(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(editingId)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-destructive/80 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  削除
                </button>
              )
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveMember}
                disabled={!form.name.trim()}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </section>
      )}

      {commentEditId &&
        (() => {
          const member = staff.find((m) => m.id === commentEditId)
          if (!member) return null
          return (
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
              <h3 className="text-sm font-bold text-foreground">
                {member.name}さんのコメントを編集
              </h3>
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                rows={3}
                placeholder="出勤中のみ表示されるコメントを入力（改行できます）"
                className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCommentEdit}
                  className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={saveComment}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                >
                  保存
                </button>
              </div>
            </section>
          )
        })()}

      {staff.length === 0 && !adding ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだ社員が登録されていません。
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {roleHolders.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-muted-foreground">
                役職者
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {roleHolders.map(renderCard)}
              </div>
            </div>
          )}
          {roleHolders.length > 0 && noRole.length > 0 && (
            <hr className="border-t border-border" />
          )}
          {noRole.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {noRole.map(renderCard)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
