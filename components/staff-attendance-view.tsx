'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Trash2, User, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline } from './confirm-delete'
import { useSettings } from '@/lib/settings/settings-context'

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

// Shared across every browser via the `yard_managers` Supabase table.
// Separate from `staff_members` since a yard manager can be anyone on duty
// that day (including a driver), not necessarily a registered employee.
type YardManagerRow = {
  id: string
  name: string
  employment_type: 'regular' | 'parttime'
  checked_in: boolean
  sort_order: number
  comment: string
}

async function fetchYardManagers(): Promise<YardManagerRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('yard_managers')
    .select('id, name, employment_type, checked_in, sort_order, comment')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as YardManagerRow[]) ?? []
}

function emptyYardManagerForm() {
  return { name: '', employmentType: 'regular' as 'regular' | 'parttime' }
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

// Full years and months of service as of today, or null if no hire date is
// on record.
function tenureDuration(
  iso: string | null,
): { years: number; months: number } | null {
  if (!iso) return null
  const hire = new Date(iso)
  if (Number.isNaN(hire.getTime())) return null
  const now = new Date()
  let totalMonths =
    (now.getFullYear() - hire.getFullYear()) * 12 +
    (now.getMonth() - hire.getMonth())
  if (now.getDate() < hire.getDate()) totalMonths -= 1
  totalMonths = Math.max(totalMonths, 0)
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 }
}

function formatTenure(duration: { years: number; months: number }): string {
  return `勤続${duration.years}年${duration.months}ヶ月`
}

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => CURRENT_YEAR - i)
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)

export function StaffAttendanceView() {
  const { partTimeMode } = useSettings()
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

  const [yardAdding, setYardAdding] = useState(false)
  const [yardEditingId, setYardEditingId] = useState<string | null>(null)
  const [yardConfirmDeleteId, setYardConfirmDeleteId] = useState<
    string | null
  >(null)
  const [yardForm, setYardForm] = useState(emptyYardManagerForm)
  const [yardCommentEditId, setYardCommentEditId] = useState<string | null>(
    null,
  )
  const [yardCommentDraft, setYardCommentDraft] = useState('')
  const [yardTapState, setYardTapState] = useState<
    Record<
      string,
      { count: number; timer: ReturnType<typeof setTimeout> | null }
    >
  >({})

  const { data: rows, mutate: refetch } = useRealtimeTable<StaffRow>(
    'staff_members',
    fetchStaffRows,
  )
  const { data: yardManagerRows, mutate: refetchYardManagers } =
    useRealtimeTable<YardManagerRow>('yard_managers', fetchYardManagers)

  const yardManagers = useMemo(
    () => [...yardManagerRows].sort((a, b) => a.sort_order - b.sort_order),
    [yardManagerRows],
  )

  // A checked-in manager's comment needs more width than a bare name card
  // has room for at 4-per-row, so drop to 3-per-row whenever any comment is
  // currently showing.
  const yardGridCols = useMemo(
    () =>
      yardManagers.some((m) => m.checked_in && m.comment.trim())
        ? 'grid-cols-3'
        : 'grid-cols-4',
    [yardManagers],
  )

  const staff = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  )

  // 役職者（role holders）keep their manual/creation order. Staff with no
  // role are shown below a divider, ordered by tenure descending (longest
  // serving first) since they have no manual position to preserve.
  const roleHolders = useMemo(
    () => staff.filter((m) => m.role.trim()),
    [staff],
  )
  const noRole = useMemo(() => {
    return [...staff.filter((m) => !m.role.trim())].sort((a, b) => {
      const ta = tenureDuration(a.hire_date)
      const tb = tenureDuration(b.hire_date)
      const ma = ta ? ta.years * 12 + ta.months : -1
      const mb = tb ? tb.years * 12 + tb.months : -1
      if (ma !== mb) return mb - ma
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

  function openYardAdd() {
    setYardForm(emptyYardManagerForm())
    setYardEditingId(null)
    setYardAdding(true)
  }

  function openYardEdit(manager: YardManagerRow) {
    setYardForm({
      name: manager.name,
      employmentType: manager.employment_type,
    })
    setYardEditingId(manager.id)
    setYardAdding(true)
  }

  function closeYardForm() {
    setYardAdding(false)
    setYardEditingId(null)
    setYardConfirmDeleteId(null)
    setYardForm(emptyYardManagerForm())
  }

  async function saveYardManager() {
    const name = yardForm.name.trim()
    if (!name) return
    const supabase = createClient()
    if (yardEditingId) {
      await supabase
        .from('yard_managers')
        .update({ name, employment_type: yardForm.employmentType })
        .eq('id', yardEditingId)
    } else {
      await supabase.from('yard_managers').insert({
        name,
        employment_type: yardForm.employmentType,
        checked_in: false,
        sort_order: yardManagers.length,
      })
    }
    await refetchYardManagers()
    closeYardForm()
  }

  async function deleteYardManager(id: string) {
    const supabase = createClient()
    await supabase.from('yard_managers').delete().eq('id', id)
    await refetchYardManagers()
    closeYardForm()
  }

  async function toggleYardCheckedIn(manager: YardManagerRow) {
    const supabase = createClient()
    await supabase
      .from('yard_managers')
      .update({
        checked_in: !manager.checked_in,
        checked_in_at: manager.checked_in ? null : new Date().toISOString(),
      })
      .eq('id', manager.id)
    await refetchYardManagers()
  }

  function openYardCommentEdit(manager: YardManagerRow) {
    setYardCommentEditId(manager.id)
    setYardCommentDraft(manager.comment ?? '')
  }

  function closeYardCommentEdit() {
    setYardCommentEditId(null)
    setYardCommentDraft('')
  }

  async function saveYardComment() {
    if (!yardCommentEditId) return
    const supabase = createClient()
    await supabase
      .from('yard_managers')
      .update({ comment: yardCommentDraft.trim() })
      .eq('id', yardCommentEditId)
    await refetchYardManagers()
    closeYardCommentEdit()
  }

  // Mirrors handleTap for staff: a rapid triple tap toggles attendance
  // immediately, while a tap sequence that stops at exactly two opens the
  // comment-only editor after the pause.
  function handleYardTap(manager: YardManagerRow) {
    if (editMode) {
      openYardEdit(manager)
      return
    }
    setYardTapState((prev) => {
      const current = prev[manager.id]
      const count = (current?.count ?? 0) + 1
      if (current?.timer) clearTimeout(current.timer)
      if (count >= 3) {
        toggleYardCheckedIn(manager)
        return { ...prev, [manager.id]: { count: 0, timer: null } }
      }
      const timer = setTimeout(() => {
        setYardTapState((p) => ({
          ...p,
          [manager.id]: { count: 0, timer: null },
        }))
        if (count === 2) openYardCommentEdit(manager)
      }, 500)
      return { ...prev, [manager.id]: { count, timer } }
    })
  }

  function openCommentEdit(member: StaffRow) {
    // Part-time mode only allows editing the yard managers' comments (see
    // handleYardTap/openYardCommentEdit below), not regular staff comments.
    if (partTimeMode) return
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
    const tenure = tenureDuration(member.hire_date)
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
            {formatTenure(tenure)}
          </span>
        )}
        <span className="line-clamp-2 min-h-[2rem] w-full whitespace-pre-wrap px-1 text-[11px] leading-4 text-muted-foreground">
          {working ? member.comment : ''}
        </span>
      </button>
    )
  }

  function renderYardManagerCard(manager: YardManagerRow) {
    const checkedIn = manager.checked_in
    const accent = checkedIn
      ? manager.employment_type === 'regular'
        ? 'border-secondary bg-secondary/15'
        : 'border-blue-500 bg-blue-500/15'
      : 'border-primary/50 bg-primary/10'
    const statusColor = checkedIn
      ? manager.employment_type === 'regular'
        ? 'text-secondary'
        : 'text-blue-500'
      : 'text-primary'
    return (
      <button
        key={manager.id}
        type="button"
        onClick={() => handleYardTap(manager)}
        className={`flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 py-2 text-center transition-colors active:scale-[0.97] ${accent}`}
      >
        {editMode && (
          <Pencil
            className="h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <span className={`text-[0.6rem] font-bold ${statusColor}`}>
          {checkedIn ? '出勤中' : '退勤済み'}
        </span>
        <span className="line-clamp-1 text-xs font-bold text-foreground">
          {manager.name}
        </span>
        {checkedIn && manager.comment && (
          <span className="line-clamp-2 w-full whitespace-pre-wrap text-[0.6rem] leading-3 text-muted-foreground">
            {manager.comment}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">出勤簿</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {partTimeMode
              ? 'ボタンを3回連続でタップすると出勤状況が切り替わります。ヤード管理者は2回タップでコメントを編集できます。'
              : 'ボタンを3回連続でタップすると出勤状況が切り替わります。2回タップでコメントを編集できます。'}
          </p>
        </div>
        {!partTimeMode && (
          <button
            type="button"
            onClick={() => {
              setEditMode((v) => !v)
              closeForm()
              closeCommentEdit()
              closeYardForm()
              closeYardCommentEdit()
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
        )}
      </div>

      {editMode && !yardAdding && (
        <button
          type="button"
          onClick={openYardAdd}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          ヤード管理者を追加
        </button>
      )}

      {yardAdding && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
          <h3 className="text-sm font-bold text-foreground">
            {yardEditingId ? 'ヤード管理者を編集' : 'ヤード管理者を追加'}
          </h3>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              名前
            </span>
            <input
              type="text"
              value={yardForm.name}
              onChange={(e) =>
                setYardForm((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="例：山田 太郎"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              雇用形態
            </span>
            <select
              value={yardForm.employmentType}
              onChange={(e) =>
                setYardForm((p) => ({
                  ...p,
                  employmentType: e.target.value as 'regular' | 'parttime',
                }))
              }
              className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
            >
              <option value="regular">正社員</option>
              <option value="parttime">アルバイト</option>
            </select>
          </label>
          <div className="flex items-center justify-between gap-2">
            {yardEditingId ? (
              yardConfirmDeleteId === yardEditingId ? (
                <ConfirmDeleteInline
                  onConfirm={() => deleteYardManager(yardEditingId)}
                  onCancel={() => setYardConfirmDeleteId(null)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setYardConfirmDeleteId(yardEditingId)}
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
                onClick={closeYardForm}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={saveYardManager}
                disabled={!yardForm.name.trim()}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </section>
      )}

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
                    const previewTenure = tenureDuration(
                      toIsoDate(form.hireYear, form.hireMonth, form.hireDay),
                    )
                    return previewTenure !== null ? (
                      <span className="mt-0.5 text-xs font-medium text-primary">
                        {formatTenure(previewTenure)}
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

      {yardCommentEditId &&
        (() => {
          const manager = yardManagers.find((m) => m.id === yardCommentEditId)
          if (!manager) return null
          return (
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
              <h3 className="text-sm font-bold text-foreground">
                {manager.name}さんのコメントを編集
              </h3>
              <textarea
                value={yardCommentDraft}
                onChange={(e) => setYardCommentDraft(e.target.value)}
                rows={3}
                placeholder="出勤中のみ表示されるコメントを入力（改行できます）"
                className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeYardCommentEdit}
                  className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent active:scale-95"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={saveYardComment}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                >
                  保存
                </button>
              </div>
            </section>
          )
        })()}

      {(yardManagers.length > 0 || editMode) && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold text-muted-foreground">
            本日のヤード管理者
          </h3>
          {yardManagers.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-center text-xs text-muted-foreground">
              まだヤード管理者が登録されていません。
            </p>
          ) : (
            <div className={`grid ${yardGridCols} gap-2`}>
              {yardManagers.map(renderYardManagerCard)}
            </div>
          )}
        </div>
      )}

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
