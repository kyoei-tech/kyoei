'use client'

import { useMemo, useState } from 'react'
import { Car, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'

type CarEntry = {
  id: string
  maker: string
  modelName: string
  modelCode: string
  memo: string
}

// Shared across every browser via the `high_value_cars` Supabase table.
type CarRow = {
  id: string
  maker: string
  model_name: string
  model_code: string
  memo: string
}

function rowToCar(r: CarRow): CarEntry {
  return {
    id: r.id,
    maker: r.maker,
    modelName: r.model_name,
    modelCode: r.model_code,
    memo: r.memo,
  }
}

async function fetchCarRows(): Promise<CarRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('high_value_cars')
    .select('id, maker, model_name, model_code, memo')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as CarRow[]) ?? []
}

function emptyForm() {
  return { maker: '', modelName: '', modelCode: '', memo: '' }
}

export function HighValueCarsView() {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  const { data: rows, mutate: refetch } = useRealtimeTable<CarRow>(
    'high_value_cars',
    fetchCarRows,
  )

  const cars: CarEntry[] = useMemo(() => rows.map(rowToCar), [rows])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return cars
    return cars.filter(
      (c) =>
        c.maker.toLowerCase().includes(q) ||
        c.modelName.toLowerCase().includes(q) ||
        c.modelCode.toLowerCase().includes(q) ||
        c.memo.toLowerCase().includes(q),
    )
  }, [cars, q])

  function startAdd() {
    setEditingId(null)
    setForm(emptyForm())
    setConfirmDeleteId(null)
    setAdding(true)
  }

  function startEdit(car: CarEntry) {
    setEditingId(car.id)
    setForm({
      maker: car.maker,
      modelName: car.modelName,
      modelCode: car.modelCode,
      memo: car.memo,
    })
    setConfirmDeleteId(null)
    setAdding(true)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  async function saveCar() {
    if (!form.maker.trim() && !form.modelName.trim()) return
    const payload = {
      maker: form.maker.trim(),
      model_name: form.modelName.trim(),
      model_code: form.modelCode.trim(),
      memo: form.memo.trim(),
    }
    const supabase = createClient()
    if (editingId) {
      await supabase.from('high_value_cars').update(payload).eq('id', editingId)
    } else {
      await supabase.from('high_value_cars').insert(payload)
    }
    await refetch()
    closeForm()
  }

  async function deleteCar(id: string) {
    const supabase = createClient()
    await supabase.from('high_value_cars').delete().eq('id', id)
    await refetch()
    setConfirmDeleteId(null)
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">高額車一覧</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            メーカー・車種名・型式・メモで検索できます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => (adding ? closeForm() : startAdd())}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
        >
          {adding ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          {adding ? '閉じる' : '追加'}
        </button>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="メーカー・車種名・型式・メモで検索"
          aria-label="高額車を検索"
          className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
        />
      </div>

      {adding && (
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              メーカー
            </span>
            <input
              type="text"
              value={form.maker}
              onChange={(e) =>
                setForm((p) => ({ ...p, maker: e.target.value }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              車種名
            </span>
            <input
              type="text"
              value={form.modelName}
              onChange={(e) =>
                setForm((p) => ({ ...p, modelName: e.target.value }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              型式（車台番号のハイフン手前。外車は空欄可）
            </span>
            <input
              type="text"
              value={form.modelCode}
              onChange={(e) =>
                setForm((p) => ({ ...p, modelCode: e.target.value }))
              }
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              詳細メモ
            </span>
            <textarea
              value={form.memo}
              onChange={(e) =>
                setForm((p) => ({ ...p, memo: e.target.value }))
              }
              rows={3}
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
            />
          </label>
          <button
            type="button"
            onClick={saveCar}
            disabled={!form.maker.trim() && !form.modelName.trim()}
            className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            {editingId ? '更新' : '保存'}
          </button>
        </section>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          {q ? '高額車に該当しない車種です。' : 'まだ登録がありません。'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((c) => (
            <li
              key={c.id}
              className="rounded-2xl border border-border bg-card px-5 py-4"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Car className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-base font-semibold text-foreground">
                      {c.maker}
                      {c.maker && c.modelName ? ' ' : ''}
                      {c.modelName || '（車種名なし）'}
                    </span>
                    {c.modelCode && (
                      <span className="truncate text-xs text-muted-foreground">
                        型式：{c.modelCode}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    aria-label={`${c.modelName || c.maker}を編集`}
                    className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-foreground active:scale-90"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(c.id)}
                    aria-label={`${c.modelName || c.maker}を削除`}
                    className="rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-destructive active:scale-90"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {confirmDeleteId === c.id && (
                <div className="mb-1 flex flex-col gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                  <p className="text-sm font-medium text-foreground">
                    本当に削除しますか？
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => deleteCar(c.id)}
                      className="rounded-full bg-destructive px-4 py-1.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 active:scale-95"
                    >
                      削除する
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
              {c.memo && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {c.memo}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
