'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'

export type CategoryRow = {
  id: string
  name: string
  sort_order: number
}

async function fetchCategories(): Promise<CategoryRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('accident_categories')
    .select('id, name, sort_order')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data as CategoryRow[]) ?? []
}

export function useAccidentCategories() {
  return useRealtimeTable<CategoryRow>('accident_categories', fetchCategories)
}

const ADD_NEW_VALUE = '__add_new__'

export function AccidentCategorySelect({
  categories,
  value,
  onChange,
  onCategoryCreated,
}: {
  categories: CategoryRow[]
  value: string
  onChange: (value: string) => void
  onCategoryCreated: () => Promise<void> | void
}) {
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  async function createCategory() {
    const name = newName.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const supabase = createClient()
      const nextOrder =
        categories.reduce((max, c) => Math.max(max, c.sort_order), 0) + 1
      const { error } = await supabase
        .from('accident_categories')
        .insert({ name, sort_order: nextOrder })
      if (error && error.code !== '23505') throw error
      await onCategoryCreated()
      onChange(name)
      setNewName('')
      setAddingNew(false)
    } finally {
      setSaving(false)
    }
  }

  if (addingNew) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              createCategory()
            }
          }}
          placeholder="新しいカテゴリー名"
          className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
        <button
          type="button"
          onClick={createCategory}
          disabled={!newName.trim() || saving}
          className="shrink-0 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
        >
          追加
        </button>
        <button
          type="button"
          onClick={() => {
            setAddingNew(false)
            setNewName('')
          }}
          className="shrink-0 rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          取消
        </button>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD_NEW_VALUE) {
          setAddingNew(true)
          return
        }
        onChange(e.target.value)
      }}
      className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/60"
    >
      <option value="">未分類</option>
      {categories.map((c) => (
        <option key={c.id} value={c.name}>
          {c.name}
        </option>
      ))}
      <option value={ADD_NEW_VALUE}>＋ 新しいカテゴリーを追加</option>
    </select>
  )
}
