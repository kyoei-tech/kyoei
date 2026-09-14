'use client'

import { useMemo, useState } from 'react'
import {
  Car,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { BackHeader } from './back-header'
import { useKanaSearch } from '@/lib/search/use-kana-search'
import { useSettings } from '@/lib/settings/settings-context'
import { useScrollToTop } from '@/lib/use-scroll-to-top'

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

const UNSET_MAKER = 'メーカー未設定'

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

type View = 'makers' | 'models' | 'detail'

export function HighValueCarsView() {
  const { partTimeMode } = useSettings()
  const [view, setView] = useState<View>('makers')
  const [selectedMaker, setSelectedMaker] = useState<string | null>(null)
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  useScrollToTop([view])
  const { matches } = useKanaSearch()

  const { data: rows, mutate: refetch } = useRealtimeTable<CarRow>(
    'high_value_cars',
    fetchCarRows,
  )

  const cars: CarEntry[] = useMemo(() => rows.map(rowToCar), [rows])

  const q = query.trim()
  const searchResults = useMemo(() => {
    if (!q) return []
    return cars.filter(
      (c) =>
        matches(c.maker, q) ||
        matches(c.modelName, q) ||
        matches(c.modelCode, q) ||
        matches(c.memo, q),
    )
  }, [cars, q, matches])

  const makerGroups = useMemo(() => {
    const map = new Map<string, CarEntry[]>()
    for (const c of cars) {
      const key = c.maker.trim() || UNSET_MAKER
      const list = map.get(key) ?? []
      list.push(c)
      map.set(key, list)
    }
    return Array.from(map.entries())
      .map(([maker, list]) => ({ maker, cars: list }))
      .sort((a, b) => a.maker.localeCompare(b.maker, 'ja'))
  }, [cars])

  const modelsForSelectedMaker = useMemo(() => {
    if (!selectedMaker) return []
    // Show models within the selected maker sorted by name, not entry order.
    return cars
      .filter((c) => (c.maker.trim() || UNSET_MAKER) === selectedMaker)
      .sort((a, b) => a.modelName.localeCompare(b.modelName, 'ja'))
  }, [cars, selectedMaker])

  const selectedCar = useMemo(
    () => cars.find((c) => c.id === selectedCarId) ?? null,
    [cars, selectedCarId],
  )

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  function startAdd(prefillMaker?: string) {
    setEditingId(null)
    setForm({ ...emptyForm(), maker: prefillMaker ?? '' })
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

  function openMaker(maker: string) {
    setSelectedMaker(maker)
    setSelectedCarId(null)
    setQuery('')
    closeForm()
    setView('models')
  }

  function openCar(id: string) {
    setSelectedCarId(id)
    closeForm()
    setConfirmDeleteId(null)
    setView('detail')
  }

  function backToMakers() {
    setSelectedMaker(null)
    setSelectedCarId(null)
    closeForm()
    setConfirmDeleteId(null)
    setView('makers')
  }

  function backToModels() {
    setSelectedCarId(null)
    closeForm()
    setConfirmDeleteId(null)
    setView('models')
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
    setSelectedCarId(null)
    setView('models')
  }

  function renderForm() {
    return (
      <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            メーカー
          </span>
          <input
            type="text"
            value={form.maker}
            onChange={(e) => setForm((p) => ({ ...p, maker: e.target.value }))}
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
            onChange={(e) => setForm((p) => ({ ...p, memo: e.target.value }))}
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
    )
  }

  // Detail view: full information for a single car.
  if (view === 'detail' && selectedCar) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <BackHeader
          onBack={backToModels}
          label="車種一覧に戻る"
          variant="icon"
          trailing={
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">
                {selectedCar.maker.trim() || UNSET_MAKER}
              </p>
              <h2 className="truncate text-xl font-bold text-foreground">
                {selectedCar.modelName || '（車種名なし）'}
              </h2>
            </div>
          }
        />

        {!partTimeMode && adding ? (
          renderForm()
        ) : (
          <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Car className="h-5 w-5" aria-hidden="true" />
              </span>
              {!partTimeMode && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(selectedCar)}
                    aria-label="編集"
                    className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:text-foreground active:scale-90"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(selectedCar.id)}
                    aria-label="削除"
                    className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:text-destructive active:scale-90"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {!partTimeMode && confirmDeleteId === selectedCar.id && (
              <div className="flex flex-col gap-2.5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  本当に削除しますか？
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => deleteCar(selectedCar.id)}
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

            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex items-baseline gap-2">
                <dt className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                  メーカー
                </dt>
                <dd className="text-foreground">
                  {selectedCar.maker || '未設定'}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                  車種名
                </dt>
                <dd className="text-foreground">
                  {selectedCar.modelName || '未設定'}
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
                  型式
                </dt>
                <dd className="text-foreground">
                  {selectedCar.modelCode || '未設定'}
                </dd>
              </div>
            </dl>

            {selectedCar.memo && (
              <div className="rounded-2xl border border-border/60 bg-background px-4 py-3.5">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  詳細メモ
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {selectedCar.memo}
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    )
  }

  // Models view: cars belonging to the selected maker.
  if (view === 'models' && selectedMaker) {
    return (
      <div className="flex flex-col gap-4 pb-6">
        <BackHeader
          onBack={backToMakers}
          label="メーカー一覧に戻る"
          variant="icon"
          trailing={
            <>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  高額車一覧
                </p>
                <h2 className="text-xl font-bold text-foreground">
                  {selectedMaker}
                </h2>
              </div>
              {!partTimeMode && (
                <button
                  type="button"
                  onClick={() =>
                    adding
                      ? closeForm()
                      : startAdd(
                          selectedMaker === UNSET_MAKER ? '' : selectedMaker,
                        )
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                >
                  {adding ? (
                    <X className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  )}
                  {adding ? '閉じる' : '追加'}
                </button>
              )}
            </>
          }
        />

        {!partTimeMode && adding && renderForm()}

        {modelsForSelectedMaker.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            まだ登録がありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {modelsForSelectedMaker.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openCar(c.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Car className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-semibold text-foreground">
                        {c.modelName || '（車種名なし）'}
                      </span>
                      {c.modelCode && (
                        <span className="truncate text-xs text-muted-foreground">
                          型式：{c.modelCode}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Makers view (default): grouped by maker, or a flat search list.
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">高額車一覧</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            メーカーをタップすると車種一覧が表示されます。
          </p>
        </div>
        {!partTimeMode && (
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
        )}
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

        {!partTimeMode && adding && renderForm()}

      {q ? (
        searchResults.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            高額車に該当しない車種です。
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {searchResults.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openCar(c.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Car className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-col">
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
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        )
      ) : makerGroups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          まだ登録がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {makerGroups.map((group) => (
            <li key={group.maker}>
              <button
                type="button"
                onClick={() => openMaker(group.maker)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Car className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="truncate text-base font-semibold text-foreground">
                    {group.maker}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {group.cars.length}件
                  </span>
                  <ChevronRight
                    className="h-5 w-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
