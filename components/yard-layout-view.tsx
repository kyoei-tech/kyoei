'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline, DeleteIconButton } from './confirm-delete'

// Shared across every browser via the `yards` / `yard_rows` Supabase tables.
type YardRow = { id: string; name: string; sort_order: number; updated_at: string }
type RowRow = {
  id: string
  yard_id: string
  label: string
  destination: string
  sort_order: number
  updated_at: string
}
// Managed list of selectable destination names, shared via `yard_destinations`.
type DestinationRow = { id: string; name: string; sort_order: number }

async function fetchYards(): Promise<YardRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('yards')
    .select('id, name, sort_order, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as YardRow[]) ?? []
}

async function fetchRows(): Promise<RowRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('yard_rows')
    .select('id, yard_id, label, destination, sort_order, updated_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as RowRow[]) ?? []
}

async function fetchDestinations(): Promise<DestinationRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('yard_destinations')
    .select('id, name, sort_order')
    .order('name', { ascending: true })
  if (error) throw error
  return (data as DestinationRow[]) ?? []
}

function formatUpdated(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function YardLayoutView() {
  const [editingYardId, setEditingYardId] = useState<string | null>(null)
  const [yardNameInput, setYardNameInput] = useState('')
  const [rowEdits, setRowEdits] = useState<
    Record<string, { label: string; destination: string }>
  >({})
  const [newRowInputs, setNewRowInputs] = useState<
    Record<string, { label: string; destination: string }>
  >({})
  const [confirmDeleteRowId, setConfirmDeleteRowId] = useState<string | null>(
    null,
  )
  const [confirmDeleteYardId, setConfirmDeleteYardId] = useState<
    string | null
  >(null)
  const [addingYard, setAddingYard] = useState(false)
  const [newYardName, setNewYardName] = useState('')

  const [managingDestinations, setManagingDestinations] = useState(false)
  const [newDestinationName, setNewDestinationName] = useState('')
  const [destinationEditId, setDestinationEditId] = useState<string | null>(
    null,
  )
  const [destinationEditName, setDestinationEditName] = useState('')
  const [confirmDeleteDestinationId, setConfirmDeleteDestinationId] =
    useState<string | null>(null)

  const { data: yardRows, mutate: refetchYards } = useRealtimeTable<YardRow>(
    'yards',
    fetchYards,
  )
  const { data: rowRows, mutate: refetchRows } = useRealtimeTable<RowRow>(
    'yard_rows',
    fetchRows,
  )
  const { data: destinationRows, mutate: refetchDestinations } =
    useRealtimeTable<DestinationRow>('yard_destinations', fetchDestinations)

  const yards = useMemo(
    () => [...yardRows].sort((a, b) => a.sort_order - b.sort_order),
    [yardRows],
  )

  const rowsByYard = useMemo(() => {
    const map = new Map<string, RowRow[]>()
    for (const r of rowRows) {
      const list = map.get(r.yard_id) ?? []
      list.push(r)
      map.set(r.yard_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order)
    return map
  }, [rowRows])

  const latestUpdate = useMemo(() => {
    const all = [
      ...yardRows.map((y) => y.updated_at),
      ...rowRows.map((r) => r.updated_at),
    ]
    if (all.length === 0) return null
    return all.reduce((a, b) => (a > b ? a : b))
  }, [yardRows, rowRows])

  const destinations = useMemo(
    () => [...destinationRows].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [destinationRows],
  )

  function startEditYard(yard: YardRow) {
    setEditingYardId(yard.id)
    setYardNameInput(yard.name)
    const edits: Record<string, { label: string; destination: string }> = {}
    for (const r of rowsByYard.get(yard.id) ?? []) {
      edits[r.id] = { label: r.label, destination: r.destination }
    }
    setRowEdits(edits)
    setNewRowInputs((prev) => ({
      ...prev,
      [yard.id]: { label: '', destination: '' },
    }))
  }

  function stopEditYard() {
    setEditingYardId(null)
    setRowEdits({})
    setConfirmDeleteRowId(null)
  }

  async function saveYardName(yardId: string) {
    const name = yardNameInput.trim()
    if (!name) return
    const supabase = createClient()
    await supabase
      .from('yards')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', yardId)
    await refetchYards()
  }

  async function saveRow(rowId: string) {
    const edit = rowEdits[rowId]
    if (!edit) return
    const supabase = createClient()
    await supabase
      .from('yard_rows')
      .update({
        label: edit.label.trim(),
        destination: edit.destination.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', rowId)
    await refetchRows()
  }

  // The destination select saves immediately on change (no separate blur
  // step), so it writes the chosen value directly instead of relying on
  // the rowEdits state, which may not have flushed yet.
  async function saveRowDestination(rowId: string, destination: string) {
    setRowEdits((prev) => ({
      ...prev,
      [rowId]: {
        label: prev[rowId]?.label ?? '',
        destination,
      },
    }))
    const supabase = createClient()
    await supabase
      .from('yard_rows')
      .update({ destination, updated_at: new Date().toISOString() })
      .eq('id', rowId)
    await refetchRows()
  }

  async function addRow(yardId: string) {
    const input = newRowInputs[yardId]
    const label = input?.label.trim()
    if (!label) return
    const supabase = createClient()
    const existing = rowsByYard.get(yardId) ?? []
    await supabase.from('yard_rows').insert({
      yard_id: yardId,
      label,
      destination: input?.destination.trim() ?? '',
      sort_order: existing.length,
    })
    setNewRowInputs((prev) => ({
      ...prev,
      [yardId]: { label: '', destination: '' },
    }))
    await refetchRows()
  }

  async function deleteRow(rowId: string) {
    const supabase = createClient()
    await supabase.from('yard_rows').delete().eq('id', rowId)
    await refetchRows()
    setConfirmDeleteRowId(null)
  }

  async function addYard() {
    const name = newYardName.trim()
    if (!name) return
    const supabase = createClient()
    await supabase.from('yards').insert({ name, sort_order: yards.length })
    setNewYardName('')
    setAddingYard(false)
    await refetchYards()
  }

  async function deleteYard(yardId: string) {
    const supabase = createClient()
    await supabase.from('yards').delete().eq('id', yardId)
    await refetchYards()
    await refetchRows()
    setConfirmDeleteYardId(null)
    stopEditYard()
  }

  async function addDestination() {
    const name = newDestinationName.trim()
    if (!name) return
    const supabase = createClient()
    const { error } = await supabase
      .from('yard_destinations')
      .insert({ name, sort_order: destinations.length })
    if (error) return
    setNewDestinationName('')
    await refetchDestinations()
  }

  function startEditDestination(destination: DestinationRow) {
    setDestinationEditId(destination.id)
    setDestinationEditName(destination.name)
  }

  async function saveDestinationName() {
    const name = destinationEditName.trim()
    const id = destinationEditId
    if (!id || !name) return
    const supabase = createClient()
    const previous = destinations.find((d) => d.id === id)
    const { error } = await supabase
      .from('yard_destinations')
      .update({ name })
      .eq('id', id)
    if (!error && previous && previous.name !== name) {
      // Keep already-assigned rows pointing at a real destination instead of
      // silently detaching them when a name is renamed.
      await supabase
        .from('yard_rows')
        .update({ destination: name })
        .eq('destination', previous.name)
      await refetchRows()
    }
    setDestinationEditId(null)
    await refetchDestinations()
  }

  async function deleteDestination(id: string) {
    const supabase = createClient()
    await supabase.from('yard_destinations').delete().eq('id', id)
    await refetchDestinations()
    setConfirmDeleteDestinationId(null)
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">ヤード配置</h2>
          {latestUpdate && (
            <p className="mt-1 text-sm font-medium text-primary">
              最終更新：{formatUpdated(latestUpdate)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setManagingDestinations((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95 ${
            managingDestinations
              ? 'bg-primary text-primary-foreground'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          行き先を管理
        </button>
      </div>

      {managingDestinations && (
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
          <h3 className="text-sm font-bold text-foreground">
            行き先の候補一覧
          </h3>
          {destinations.length === 0 && (
            <p className="py-1 text-sm text-muted-foreground/60">
              行き先が登録されていません。
            </p>
          )}
          {destinations.map((d) => (
            <div key={d.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
                {destinationEditId === d.id ? (
                  <input
                    type="text"
                    value={destinationEditName}
                    onChange={(e) => setDestinationEditName(e.target.value)}
                    onBlur={saveDestinationName}
                    autoFocus
                    aria-label="行き先名"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditDestination(d)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                  >
                    {d.name}
                  </button>
                )}
                <DeleteIconButton
                  onClick={() => setConfirmDeleteDestinationId(d.id)}
                  label={`${d.name}を削除`}
                />
              </div>
              {confirmDeleteDestinationId === d.id && (
                <ConfirmDeleteInline
                  message={`「${d.name}」を削除しますか？`}
                  onConfirm={() => deleteDestination(d.id)}
                  onCancel={() => setConfirmDeleteDestinationId(null)}
                />
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={newDestinationName}
              onChange={(e) => setNewDestinationName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  addDestination()
                }
              }}
              placeholder="新しい行き先名"
              aria-label="新しい行き先名"
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
            <button
              type="button"
              onClick={addDestination}
              aria-label="行き先を追加"
              className="flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 py-1.5 text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {yards.map((yard) => {
        const rows = rowsByYard.get(yard.id) ?? []
        const editing = editingYardId === yard.id
        const newRow = newRowInputs[yard.id] ?? { label: '', destination: '' }
        return (
          <section
            key={yard.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-3">
              {editing ? (
                <input
                  type="text"
                  value={yardNameInput}
                  onChange={(e) => setYardNameInput(e.target.value)}
                  onBlur={() => saveYardName(yard.id)}
                  aria-label="ヤード名"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-1.5 text-base font-bold text-foreground outline-none focus:border-primary/60"
                />
              ) : (
                <h3 className="text-base font-bold text-foreground">
                  {yard.name}
                </h3>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {rows.length === 0 && !editing && (
                <p className="py-2 text-center text-sm text-muted-foreground/60">
                  位置が登録されていません。
                </p>
              )}
              {rows.map((row) => {
                const edit = rowEdits[row.id] ?? {
                  label: row.label,
                  destination: row.destination,
                }
                return (
                  <div key={row.id} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2">
                      {editing ? (
                        <>
                          <input
                            type="text"
                            value={edit.label}
                            onChange={(e) =>
                              setRowEdits((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...edit,
                                  label: e.target.value,
                                },
                              }))
                            }
                            onBlur={() => saveRow(row.id)}
                            aria-label="位置名"
                            className="w-20 shrink-0 rounded-lg border border-border bg-card px-2 py-1.5 text-sm font-semibold text-foreground outline-none focus:border-primary/60"
                          />
                          <span
                            className="text-muted-foreground/40"
                            aria-hidden="true"
                          >
                            |
                          </span>
                          <select
                            value={edit.destination}
                            onChange={(e) =>
                              saveRowDestination(row.id, e.target.value)
                            }
                            aria-label="行き先"
                            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                          >
                            <option value="">未設定</option>
                            {destinations.map((d) => (
                              <option key={d.id} value={d.name}>
                                {d.name}
                              </option>
                            ))}
                            {edit.destination &&
                              !destinations.some(
                                (d) => d.name === edit.destination,
                              ) && (
                                <option value={edit.destination}>
                                  {edit.destination}
                                </option>
                              )}
                          </select>
                          <DeleteIconButton
                            onClick={() => setConfirmDeleteRowId(row.id)}
                            label={`${row.label}を削除`}
                          />
                        </>
                      ) : (
                        <>
                          <span className="w-20 shrink-0 text-sm font-semibold text-foreground">
                            {row.label}
                          </span>
                          <span
                            className="text-muted-foreground/40"
                            aria-hidden="true"
                          >
                            |
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                            {row.destination || (
                              <span className="text-muted-foreground/50">
                                —
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                    {editing && confirmDeleteRowId === row.id && (
                      <ConfirmDeleteInline
                        message={`「${row.label}」を削除しますか？`}
                        onConfirm={() => deleteRow(row.id)}
                        onCancel={() => setConfirmDeleteRowId(null)}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {editing && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRow.label}
                  onChange={(e) =>
                    setNewRowInputs((prev) => ({
                      ...prev,
                      [yard.id]: { ...newRow, label: e.target.value },
                    }))
                  }
                  placeholder="位置名"
                  aria-label="新しい位置名"
                  className="w-20 shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                />
                <select
                  value={newRow.destination}
                  onChange={(e) =>
                    setNewRowInputs((prev) => ({
                      ...prev,
                      [yard.id]: { ...newRow, destination: e.target.value },
                    }))
                  }
                  aria-label="新しい行き先"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                >
                  <option value="">行き先（任意）</option>
                  {destinations.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addRow(yard.id)}
                  aria-label="位置を追加"
                  className="flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 py-1.5 text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              {editing && confirmDeleteYardId === yard.id ? (
                <ConfirmDeleteInline
                  message={`「${yard.name}」を削除しますか？`}
                  onConfirm={() => deleteYard(yard.id)}
                  onCancel={() => setConfirmDeleteYardId(null)}
                />
              ) : editing ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteYardId(yard.id)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-destructive/80 transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  ヤードを削除
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => (editing ? stopEditYard() : startEditYard(yard))}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors active:scale-95 ${
                  editing
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {editing ? (
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {editing ? '完了' : '編集'}
              </button>
            </div>
          </section>
        )
      })}

      {addingYard ? (
        <section className="flex items-center gap-2 rounded-2xl border border-dashed border-primary/50 bg-primary/5 p-4">
          <input
            type="text"
            value={newYardName}
            onChange={(e) => setNewYardName(e.target.value)}
            placeholder="ヤード名"
            aria-label="新しいヤード名"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <button
            type="button"
            onClick={addYard}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            追加
          </button>
          <button
            type="button"
            onClick={() => {
              setAddingYard(false)
              setNewYardName('')
            }}
            aria-label="キャンセル"
            className="shrink-0 rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAddingYard(true)}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          ヤードを追加
        </button>
      )}
    </div>
  )
}
