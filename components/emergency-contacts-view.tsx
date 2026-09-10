'use client'

import { useMemo, useRef, useState } from 'react'
import { Clock, Pencil, Phone, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline } from './confirm-delete'
import { usePasswordGate } from './password-prompt'
import { useSettings } from '@/lib/settings/settings-context'

// Shared across every browser via the `emergency_contacts` Supabase table.
type ContactRow = {
  id: string
  name: string
  hours: string
  phone: string
  summary: string | null
  sort_order: number
}

// Shared across every browser via the `emergency_contacts_memo` table (single row).
type MemoRow = { id: string; content: string; updated_at: string }

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2)
  const minute = i % 2 === 0 ? '00' : '30'
  return `${String(hour).padStart(2, '0')}:${minute}`
})

const DOUBLE_TAP_MS = 350

async function fetchContactRows(): Promise<ContactRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('id, name, hours, phone, summary, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as ContactRow[]) ?? []
}

async function fetchMemo(): Promise<MemoRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('emergency_contacts_memo')
    .select('id, content, updated_at')
    .eq('id', 'current')
  if (error) throw error
  return (data as MemoRow[]) ?? []
}

function parseHours(hours: string) {
  if (!hours) return { is24h: false, startTime: '09:00', endTime: '18:00' }
  if (hours.includes('24')) {
    return { is24h: true, startTime: '09:00', endTime: '18:00' }
  }
  const match = hours.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/)
  if (match) {
    const start = `${match[1].padStart(2, '0')}:${match[2]}`
    const end = `${match[3].padStart(2, '0')}:${match[4]}`
    if (TIME_OPTIONS.includes(start) && TIME_OPTIONS.includes(end)) {
      return { is24h: false, startTime: start, endTime: end }
    }
  }
  return { is24h: false, startTime: '09:00', endTime: '18:00' }
}

function emptyForm() {
  return {
    name: '',
    phone: '',
    summary: '',
    is24h: false,
    startTime: '09:00',
    endTime: '18:00',
  }
}

function MemoBox() {
  const { partTimeMode } = useSettings()
  const { data: rows, mutate: refetch } = useRealtimeTable<MemoRow>(
    'emergency_contacts_memo',
    fetchMemo,
  )
  const memo = rows[0]?.content ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const lastTapRef = useRef(0)
  const { guard, prompt } = usePasswordGate('2486')

  function startEditing() {
    setDraft(memo)
    setEditing(true)
  }

  function handleTap() {
    if (partTimeMode || editing) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      guard(startEditing)
    } else {
      lastTapRef.current = now
    }
  }

  async function save() {
    setSaving(true)
    try {
      const supabase = createClient()
      await supabase
        .from('emergency_contacts_memo')
        .update({
          content: draft,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'current')
      await refetch()
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={handleTap}
      className="min-h-[3rem] rounded-2xl border border-border px-4 py-3"
    >
      {editing ? (
        <div
          className="flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            autoFocus
            placeholder="メモを入力"
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      ) : memo ? (
        <p className="whitespace-pre-wrap text-sm font-bold text-orange-500">
          {memo}
        </p>
      ) : null}
      {prompt}
    </div>
  )
}

export function EmergencyContactsView() {
  const { partTimeMode } = useSettings()
  const [editMode, setEditMode] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data: rows, mutate: refetch } = useRealtimeTable<ContactRow>(
    'emergency_contacts',
    fetchContactRows,
  )

  const contacts = useMemo(
    () => [...rows].sort((a, b) => a.sort_order - b.sort_order),
    [rows],
  )

  function openAdd() {
    setForm(emptyForm())
    setEditingId(null)
    setAdding(true)
  }

  function openEdit(contact: ContactRow) {
    setForm({
      name: contact.name,
      phone: contact.phone,
      summary: contact.summary ?? '',
      ...parseHours(contact.hours),
    })
    setEditingId(contact.id)
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  async function saveContact() {
    const name = form.name.trim()
    if (!name) return
    const hours = form.is24h
      ? '24時間対応'
      : `${form.startTime}〜${form.endTime}`
    const supabase = createClient()
    if (editingId) {
      await supabase
        .from('emergency_contacts')
        .update({
          name,
          hours,
          phone: form.phone.trim(),
          summary: form.summary.trim() || null,
        })
        .eq('id', editingId)
    } else {
      await supabase.from('emergency_contacts').insert({
        name,
        hours,
        phone: form.phone.trim(),
        summary: form.summary.trim() || null,
        sort_order: contacts.length,
      })
    }
    await refetch()
    closeForm()
  }

  async function deleteContact(id: string) {
    const supabase = createClient()
    await supabase.from('emergency_contacts').delete().eq('id', id)
    await refetch()
    setConfirmDeleteId(null)
    closeForm()
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">緊急連絡先</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            緊急時に連絡する連絡先の一覧です。電話番号をタップすると発信できます。
          </p>
        </div>
        {!partTimeMode && (
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
        )}
      </div>

      <MemoBox />

      {editMode && !adding && (
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          連絡先を追加
        </button>
      )}

      {adding && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
          <h3 className="text-sm font-bold text-foreground">
            {editingId ? '連絡先を編集' : '連絡先を追加'}
          </h3>
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
              placeholder="例：本郷営業所"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              営業時間
            </span>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is24h}
                onChange={(e) =>
                  setForm((p) => ({ ...p, is24h: e.target.checked }))
                }
                className="h-4 w-4 rounded border-border accent-primary"
              />
              24時間対応
            </label>
            {!form.is24h && (
              <div className="flex items-center gap-2">
                <select
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, startTime: e.target.value }))
                  }
                  aria-label="開始時刻"
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <span className="shrink-0 text-sm text-muted-foreground">
                  〜
                </span>
                <select
                  value={form.endTime}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, endTime: e.target.value }))
                  }
                  aria-label="終了時刻"
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              電話番号
            </span>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) =>
                setForm((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="例：03-0000-0000"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              概要（どんな時に使うのか）
            </span>
            <textarea
              value={form.summary}
              onChange={(e) =>
                setForm((p) => ({ ...p, summary: e.target.value }))
              }
              rows={2}
              placeholder="例：事故発生時の一報先"
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <div className="flex items-center justify-between gap-2">
            {editingId ? (
              confirmDeleteId === editingId ? (
                <ConfirmDeleteInline
                  onConfirm={() => deleteContact(editingId)}
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
                onClick={saveContact}
                disabled={!form.name.trim()}
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </section>
      )}

      {contacts.length === 0 && !adding ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだ連絡先が登録されていません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4"
            >
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-base font-semibold text-foreground">
                  {contact.name}
                </span>
                {contact.hours && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {contact.hours}
                  </span>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary transition-opacity hover:opacity-80 active:scale-95"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {contact.phone}
                  </a>
                )}
                {contact.summary && (
                  <span className="text-xs text-muted-foreground">
                    {contact.summary}
                  </span>
                )}
              </div>
              {editMode && (
                <button
                  type="button"
                  onClick={() => openEdit(contact)}
                  aria-label={`${contact.name}を編集`}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  編集
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
