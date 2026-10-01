'use client'
import { useActionState, useState, useTransition } from 'react'
import { CSV_HEADER, decodeCSV, parseCSV, toCustomerRows, type CustomerRow } from '@/lib/csv'
import { groupByVenue, matchesQuery, type CustomerRecord } from '@/lib/customers'
import { addCustomer, deleteCustomer, deleteNumber, importCustomers, type ImportResult, type ImportSummary } from './actions'

function ImportPanel() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  // File line = data row + 1 when the first line is the header.
  const [lineOffset, setLineOffset] = useState(0)
  const [preview, setPreview] = useState<ImportSummary | null>(null)
  const [done, setDone] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  async function onFile(file: File) {
    setError(null)
    setPreview(null)
    setDone(null)
    setFileName(file.name)
    const parsed = toCustomerRows(parseCSV(decodeCSV(new Uint8Array(await file.arrayBuffer()))))
    if (parsed.problem) {
      setRows(null)
      setError(parsed.problem)
      return
    }
    setRows(parsed.rows)
    setLineOffset(parsed.headerSkipped ? 1 : 0)
    startTransition(async () => {
      const result = await importCustomers(parsed.rows, true)
      if (result.ok) setPreview(result.summary)
      else setError(result.error)
    })
  }

  function commit() {
    if (!rows) return
    startTransition(async () => {
      const result: ImportResult = await importCustomers(rows, false)
      if (result.ok) {
        setDone(result.summary)
        setPreview(null)
        setRows(null)
      } else setError(result.error)
    })
  }

  const summary = preview ?? done
  return (
    <section className="card">
      <h2>CSV で取り込む</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.6, color: 'var(--muted)' }}>
        1行目は「{CSV_HEADER.join(',')}」。会員番号1つにつき1行（同じ会員の番号が複数あれば、その数だけ行を並べる）。Excel の「CSV UTF-8」でも、通常の CSV でも読み込めます。取り込みは追加・確認のみで、既存のデータは消えません。
      </p>
      <label className="dropzone" style={{ display: 'block', cursor: 'pointer' }}>
        {fileName ? `選択中：${fileName}` : 'クリックして CSV ファイルを選択'}
        <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {busy && <p style={{ fontSize: 13, color: 'var(--muted)' }}>確認中…</p>}
      {error && <p className="error">{error}</p>}
      {summary && (
        <>
          <div style={{ marginTop: 14, fontSize: 13, fontWeight: 800 }}>{done ? '取り込みました' : '取り込む前の確認'}（{summary.rows}行）</div>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
            <div style={{ padding: 10, borderRadius: 10, background: '#e3f5e1' }}><div style={{ fontSize: 11, color: 'var(--ink)' }}>新しい会員</div><div style={{ fontSize: 22, fontWeight: 900 }}>{summary.newCustomers}</div></div>
            <div style={{ padding: 10, borderRadius: 10, background: '#e3f5e1' }}><div style={{ fontSize: 11, color: 'var(--ink)' }}>新しい会員番号</div><div style={{ fontSize: 22, fontWeight: 900 }}>{summary.newNumbers}</div></div>
            <div style={{ padding: 10, borderRadius: 10, background: summary.errors.length ? '#fde7e8' : '#eef0ec' }}><div style={{ fontSize: 11, color: summary.errors.length ? '#b0161e' : 'var(--muted)' }}>エラー</div><div style={{ fontSize: 22, fontWeight: 900 }}>{summary.errors.length}</div></div>
          </div>
          {summary.unchanged > 0 && <p style={{ fontSize: 12, color: 'var(--muted)' }}>登録済みで変更なし：{summary.unchanged}件</p>}
          {summary.errors.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#b0161e', maxHeight: 140, overflowY: 'auto' }}>
              {summary.errors.map((e) => <li key={e.row}>{e.row + lineOffset}行目：{e.message}</li>)}
            </ul>
          )}
          {preview && (
            <div className="row" style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-primary" disabled={busy || preview.newNumbers + preview.newCustomers === 0} onClick={commit}>
                {preview.errors.length ? 'エラー以外を取り込む' : '取り込む'}
              </button>
              <button type="button" className="btn" onClick={() => { setPreview(null); setRows(null); setFileName('') }}>やめる</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function CustomersClient({ customers }: { customers: CustomerRecord[] }) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [addState, addAction, addBusy] = useActionState(addCustomer, null as ImportResult | null)
  const [, startTransition] = useTransition()
  const shown = customers.filter((c) => matchesQuery(c, query))
  const numberCount = customers.reduce((n, c) => n + c.customer_numbers.length, 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1>POS番号一覧</h1>
          <p>アプリの顧客検索（会員名・会員番号）で使う情報です。会員ごとに、会場と会員番号をまとめて表示します。「顧客検索」を許可した端末にだけ暗号化して配信し、10日間同期のない端末や停止したアカウントでは自動で消去されます。</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => setAdding((v) => !v)}>＋ 1件追加</button>
          <a className="btn" href="/customers/export">CSV を書き出す</a>
        </div>
      </div>

      {adding && (
        <form className="card" action={addAction} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr)) auto', gap: 12, alignItems: 'end' }}>
          <label className="field">会員名<input className="input" name="name" required /></label>
          <label className="field">よみ<input className="input" name="kana" /></label>
          <label className="field">会場名<input className="input" name="venue" required /></label>
          <label className="field">会員番号<input className="input mono" name="number" required /></label>
          <button type="submit" className="btn btn-primary" disabled={addBusy}>追加</button>
          {addState && (addState.ok ? (
            addState.summary.errors.length ? <div className="error" style={{ gridColumn: '1 / -1' }}>{addState.summary.errors[0].message}</div>
              : <div style={{ gridColumn: '1 / -1', color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>{addState.summary.newNumbers ? '追加しました。' : 'すでに登録されています。'}</div>
          ) : <div className="error" style={{ gridColumn: '1 / -1' }}>{addState.error}</div>)}
        </form>
      )}

      <div className="split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '0 12px', height: 42 }}>
            <input
              aria-label="検索"
              placeholder="会員名・よみ・会場名・会員番号で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent' }}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>会員 {customers.length} 人 ・ 会員番号 {numberCount} 件</span>
          </div>
          <table className="table">
            <thead><tr><th>会員名</th><th>よみ</th><th>会場名 ・ 会員番号</th><th /></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 800, fontSize: 15 }}>{c.name}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 13 }}>{c.kana}</td>
                  <td>
                    {groupByVenue(c.customer_numbers).map((v) => (
                      <div className="venue-line" key={v.venue}>
                        <b>{v.venue}</b>
                        <span className="row" style={{ gap: 6 }}>
                          {v.numbers.map((n) => (
                            <span className="number-tag mono" key={n.id}>
                              {n.number}
                              <button
                                type="button"
                                aria-label={`${v.venue} ${n.number} を削除`}
                                style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 0 }}
                                onClick={() => confirm(`${c.name}：${v.venue} の会員番号 ${n.number} を削除しますか？`) && startTransition(async () => { await deleteNumber(n.id, `${c.name} ${v.venue} ${n.number}`) })}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => confirm(`${c.name} と、その会員番号をすべて削除しますか？`) && startTransition(async () => { await deleteCustomer(c.id, c.name) })}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={4} style={{ color: 'var(--muted)', textAlign: 'center', padding: 30 }}>{customers.length ? '見つかりませんでした' : 'まだ登録されていません。CSV で取り込むか、「1件追加」から登録してください。'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <ImportPanel />
      </div>
    </>
  )
}
