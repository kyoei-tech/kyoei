'use client'
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { StyledText } from '@/components/StyledText'
import { CALENDAR_TIMES, displayValue, VEHICLE_KINDS, VEHICLE_STATUSES, WEEKDAYS, type Field, type TableDef } from '@/lib/content'
import { createClient } from '@/lib/supabase/client'
import { deleteContentRow, moveContentRow, saveContentRow, type ContentResult } from './actions'

type Row = Record<string, unknown>

function inputValue(field: Field, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (field.type === 'minutes') return String(Number(value) / 60_000)
  if (field.type === 'tags') return Array.isArray(value) ? value.join('\n') : String(value)
  return String(value)
}

/** LoL calendar: per day 未設定 / 24h / a time range. */
function WeekInput({ field, value }: { field: Field; value: unknown }) {
  const [cells, setCells] = useState<string[]>(() => (Array.isArray(value) && value.length === 7 ? value.map(String) : ['', '', '', '', '', '', '']))
  const set = (i: number, v: string) => setCells((c) => c.map((x, j) => (j === i ? v : x)))
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      {field.label}
      <input type="hidden" name={field.key} value={JSON.stringify(cells)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
        {cells.map((cell, i) => {
          const mode = cell === '' ? 'unset' : cell === '〇' ? 'all' : 'range'
          const [start, end] = cell.includes('〜') ? cell.split('〜') : ['', '']
          return (
            <div key={i} style={{ display: 'grid', gap: 4, padding: 6, border: '1px solid var(--line, #e5e7e3)', borderRadius: 8 }}>
              <b style={{ textAlign: 'center', color: i === 0 ? '#d7262e' : i === 6 ? '#2563eb' : undefined }}>{WEEKDAYS[i][1].slice(0, 1)}</b>
              <select className="input" value={mode} onChange={(e) => set(i, e.target.value === 'unset' ? '' : e.target.value === 'all' ? '〇' : '〜')}>
                <option value="unset">未設定</option>
                <option value="all">24h</option>
                <option value="range">時間指定</option>
              </select>
              {mode === 'range' && (
                <>
                  <select className="input" value={start} onChange={(e) => set(i, `${e.target.value}〜${end}`)}>
                    <option value="">から</option>
                    {CALENDAR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select className="input" value={end} onChange={(e) => set(i, `${start}〜${e.target.value}`)}>
                    <option value="">まで</option>
                    {CALENDAR_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 荷扱車格可否: status per vehicle kind, with a condition for 条件あり. */
function VehiclesInput({ field, value }: { field: Field; value: unknown }) {
  const initial = (value && typeof value === 'object' ? value : {}) as Record<string, { status?: string; condition?: string }>
  const [entries, setEntries] = useState(() => Object.fromEntries(VEHICLE_KINDS.map(([k]) => [k, { status: initial[k]?.status ?? '', condition: initial[k]?.condition ?? '' }])))
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      {field.label}
      <input type="hidden" name={field.key} value={JSON.stringify(entries)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {VEHICLE_KINDS.map(([kind, label]) => (
          <div key={kind} style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 13 }}>{label}</span>
            <select className="input" value={entries[kind].status} onChange={(e) => setEntries((x) => ({ ...x, [kind]: { ...x[kind], status: e.target.value } }))}>
              {VEHICLE_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {entries[kind].status === '条件あり' && (
              <input className="input" placeholder="条件（例：平日のみ）" value={entries[kind].condition} onChange={(e) => setEntries((x) => ({ ...x, [kind]: { ...x[kind], condition: e.target.value } }))} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 行ったことがある人: names, ids kept for existing people. */
function VisitorsInput({ field, value }: { field: Field; value: unknown }) {
  const [people, setPeople] = useState<{ id: string; name: string }[]>(() => (Array.isArray(value) ? value : []))
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (n && !people.some((p) => p.name === n)) setPeople((p) => [...p, { id: '', name: n }])
    setName('')
  }
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      {field.label}
      <input type="hidden" name={field.key} value={JSON.stringify(people)} />
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {people.map((p) => (
          <span key={p.id || p.name} className="chip chip-gray">{p.name}
            <button type="button" onClick={() => setPeople((x) => x.filter((y) => y !== p))} style={{ marginLeft: 6, border: 0, background: 'none', cursor: 'pointer' }} aria-label={`${p.name}を外す`}>×</button>
          </span>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input" value={name} placeholder="名前" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} style={{ maxWidth: 240 }} />
        <button type="button" className="btn btn-small" onClick={add}>追加</button>
      </div>
    </div>
  )
}

/** Shrinks a picked image to a JPEG (long edge 2048px) before upload. */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85))
}

/** Images uploaded straight from the browser to the field's bucket. */
function ImagesInput({ field, value, urls }: { field: Field; value: unknown; urls: Record<string, string> }) {
  const [paths, setPaths] = useState<string[]>(() => (Array.isArray(value) ? value.map(String) : []))
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function upload(files: FileList | null) {
    if (!files?.length || !field.bucket) return
    setBusy(true)
    setError(null)
    const supabase = createClient()
    for (const file of Array.from(files)) {
      try {
        const jpeg = await toJpeg(file)
        const path = `note-${crypto.randomUUID()}.jpg`
        const { error: uploadError } = await supabase.storage.from(field.bucket).upload(path, jpeg, { contentType: 'image/jpeg' })
        if (uploadError) throw uploadError
        setPaths((p) => [...p, path])
        setPreviews((p) => ({ ...p, [path]: URL.createObjectURL(jpeg) }))
      } catch {
        setError(`${file.name} をアップロードできませんでした。`)
      }
    }
    setBusy(false)
  }
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      {field.label}
      <input type="hidden" name={field.key} value={JSON.stringify(paths)} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {paths.map((p) => (
          <div key={p} style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previews[p] ?? urls[p]} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, background: '#eee' }} />
            <button type="button" className="btn btn-small btn-danger" style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => setPaths((x) => x.filter((y) => y !== p))}>×</button>
          </div>
        ))}
      </div>
      <input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => upload(e.target.files)} />
      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{busy ? 'アップロード中…' : '外した画像は「保存」したときに削除されます。'}</span>
      {error && <span className="error">{error}</span>}
    </div>
  )
}

function FieldInput({ field, value, refOptions, imageUrls }: { field: Field; value: unknown; refOptions?: [string, string][]; imageUrls: Record<string, string> }) {
  const [text, setText] = useState(inputValue(field, value))
  if (field.type === 'week') return <WeekInput field={field} value={value} />
  if (field.type === 'vehicles') return <VehiclesInput field={field} value={value} />
  if (field.type === 'visitors') return <VisitorsInput field={field} value={value} />
  if (field.type === 'images') return <ImagesInput field={field} value={value} urls={imageUrls} />
  const common = { name: field.key, className: 'input', placeholder: field.placeholder }
  let control
  switch (field.type) {
    case 'readonly':
      return <div className="field">{field.label}<span style={{ color: 'var(--muted)' }}>{displayValue(field, value) || '－'}</span></div>
    case 'textarea':
      control = <textarea {...common} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      break
    case 'markup':
      control = (
        <>
          <textarea {...common} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          {text && <div style={{ fontSize: 13, padding: '6px 8px', background: 'var(--bg, #f4f5f2)', borderRadius: 8 }}><StyledText text={text} /></div>}
        </>
      )
      break
    case 'tags':
      control = <textarea {...common} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      break
    case 'select':
      control = (
        <select {...common} value={text} onChange={(e) => setText(e.target.value)}>
          <option value="">（選択）</option>
          {field.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
      break
    case 'weekday':
      control = (
        <select {...common} value={text || '0'} onChange={(e) => setText(e.target.value)}>
          {WEEKDAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
      break
    case 'ref':
      control = (
        <select {...common} value={text} onChange={(e) => setText(e.target.value)}>
          <option value="">（選択）</option>
          {refOptions?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )
      break
    default:
      control = <input {...common} type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'minutes' ? 'number' : 'text'} value={text} onChange={(e) => setText(e.target.value)} />
  }
  return (
    <label className="field" style={field.type === 'markup' || field.type === 'textarea' || field.type === 'tags' ? { gridColumn: '1 / -1' } : undefined}>
      {field.label}{field.required ? '（必須）' : ''}
      {control}
      {field.help && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{field.help}</span>}
    </label>
  )
}

function RowForm({ slug, def, row, refOptions, imageUrls, onDone }: { slug: string; def: TableDef; row?: Row; refOptions: Record<string, [string, string][]>; imageUrls: Record<string, string>; onDone: () => void }) {
  const [state, action, busy] = useActionState(saveContentRow, null as ContentResult | null)
  useEffect(() => {
    if (state?.ok) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      <input type="hidden" name="_section" value={slug} />
      <input type="hidden" name="_table" value={def.table} />
      {row && <input type="hidden" name="_id" value={String(row.id)} />}
      {def.fields.map((field) => <FieldInput key={field.key} field={field} value={row?.[field.key]} refOptions={refOptions[field.key]} imageUrls={imageUrls} />)}
      <div className="row" style={{ gridColumn: '1 / -1', gap: 8, alignItems: 'center' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>保存</button>
        <button type="button" className="btn" onClick={onDone}>やめる</button>
        {state && !state.ok && <span className="error">{state.error}</span>}
      </div>
    </form>
  )
}

export function TableEditor({ slug, def, rows, refOptions, showHeading, imageUrls = {} }: { slug: string; def: TableDef; rows: Row[]; refOptions: Record<string, [string, string][]>; showHeading: boolean; imageUrls?: Record<string, string> }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const listFields = def.fields.filter((f) => f.list)
  const refLabels = useMemo(() => Object.fromEntries(Object.entries(refOptions).map(([k, opts]) => [k, new Map(opts)])), [refOptions])
  const shown = query.trim()
    ? rows.filter((r) => def.fields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(query.trim().toLowerCase())))
    : rows
  const run = (task: () => Promise<ContentResult>) => startTransition(async () => {
    const r = await task()
    setError(r.ok ? null : r.error)
  })
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        {showHeading ? <h2 style={{ margin: 0 }}>{def.label}<span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 8 }}>{rows.length}件</span></h2> : <span style={{ color: 'var(--muted)' }}>{rows.length}件</span>}
        <div className="row" style={{ gap: 8 }}>
          {rows.length > 8 && <input className="input" placeholder="絞り込み" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 200 }} />}
          {def.canCreate && <button type="button" className="btn btn-primary" onClick={() => setAdding((x) => !x)}>＋ {def.label}を追加</button>}
        </div>
      </div>
      {def.note && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{def.note}</p>}
      {adding && <RowForm slug={slug} def={def} refOptions={refOptions} imageUrls={imageUrls} onDone={() => setAdding(false)} />}
      {error && <div className="notice notice-orange error">{error}</div>}
      <table className="table">
        <thead><tr>{listFields.map((f) => <th key={f.key}>{f.label}</th>)}<th /></tr></thead>
        <tbody>
          {shown.map((row, index) => {
            const id = String(row.id)
            if (editing === id) {
              return <tr key={id}><td colSpan={listFields.length + 1}><RowForm slug={slug} def={def} row={row} refOptions={refOptions} imageUrls={imageUrls} onDone={() => setEditing(null)} /></td></tr>
            }
            return (
              <tr key={id}>
                {listFields.map((f) => (
                  <td key={f.key} style={{ maxWidth: 380, fontSize: f.type === 'markup' || f.type === 'textarea' ? 13 : undefined }}>
                    {f.type === 'markup'
                      ? <StyledText text={String(row[f.key] ?? '').slice(0, 160)} />
                      : displayValue(f, row[f.key], refLabels[f.key]).slice(0, 160)}
                  </td>
                ))}
                <td>
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    {def.sortable && !query && (
                      <>
                        <button type="button" className="btn btn-small" disabled={pending || index === 0} onClick={() => run(() => moveContentRow(slug, def.table, id, -1))} aria-label="上へ">↑</button>
                        <button type="button" className="btn btn-small" disabled={pending || index === shown.length - 1} onClick={() => run(() => moveContentRow(slug, def.table, id, 1))} aria-label="下へ">↓</button>
                      </>
                    )}
                    <button type="button" className="btn btn-small" onClick={() => setEditing(id)}>編集</button>
                    {def.canDelete && (
                      <button type="button" className="btn btn-small btn-danger" disabled={pending}
                        onClick={() => confirm(`「${String(row[def.title] ?? '')}」を削除しますか？`) && run(() => deleteContentRow(slug, def.table, id, String(row[def.title] ?? '')))}>削除</button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {shown.length === 0 && <tr><td colSpan={listFields.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>まだありません</td></tr>}
        </tbody>
      </table>
    </section>
  )
}
