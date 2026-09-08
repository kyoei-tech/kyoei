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
}

async function fetchStaffRows(): Promise<StaffRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('staff_members')
    .select('id, name, role, vehicle_class, status, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as StaffRow[]) ?? []
}

function emptyForm() {
  return { name: '', role: '', vehicleClass: '' }
}

export function StaffAttendanceView() {
  const [editMode, setEditMode] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [tapState, setTapState] = useState<
    Record<string, { count: number; timer: ReturnType<typeof setTimeout> | null }>
  >({})

  const { data: rows, mutate: refetch } = useRealtimeTable<StaffRow>(
    'staff_members',
    fetchStaffRows,
  )

  const staff = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  )

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
    if (editingId) {
      await supabase
        .from('staff_members')
        .update({
          name,
          role: form.role.trim(),
          vehicle_class: form.vehicleClass.trim(),
        })
        .eq('id', editingId)
    } else {
      await supabase.from('staff_members').insert({
        name,
        role: form.role.trim(),
        vehicle_class: form.vehicleClass.trim(),
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
      }, 600)
      return { ...prev, [member.id]: { count, timer } }
    })
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">出勤簿</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ボタンを3回連続でタップすると出勤状況が切り替わります。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditMode((v) => !v)
            closeForm()
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
          スタッフを追加
        </button>
      )}

      {adding && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
          <h3 className="text-sm font-bold text-foreground">
            {editingId ? 'スタッフを編集' : 'スタッフを追加'}
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
              placeholder="例：主任"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
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
              placeholder="例：大型"
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

      {staff.length === 0 && !adding ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだスタッフが登録されていません。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {staff.map((member) => {
            const working = member.status === 'working'
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => handleTap(member)}
                className={`flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-4 text-center transition-colors active:scale-[0.97] ${
                  working
                    ? 'border-primary bg-primary/15'
                    : 'border-border bg-card'
                }`}
              >
                {editMode && (
                  <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-primary">
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    編集
                  </span>
                )}
                <span
                  className={`text-base font-bold ${
                    working ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {working ? '出勤中' : '退勤済み'}
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                  <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {member.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[member.role, member.vehicle_class]
                    .filter(Boolean)
                    .join(' / ') || '—'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
