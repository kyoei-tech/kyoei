'use client'

import { useState } from 'react'
import { ChevronRight, ArrowLeft, MapPin, Clock, Phone, Truck } from 'lucide-react'

type Destination = {
  id: string
  name: string
  category: string
  address: string
  hours: string
  phone: string
  note: string
}

const DESTINATIONS: Destination[] = [
  {
    id: 'kyoei-yard',
    name: '共栄ヤード',
    category: '自社ヤード',
    address: '愛知県名古屋市港区（社内ヤード）',
    hours: '8:00 - 17:00',
    phone: '052-000-0000',
    note: '入庫前に事務所へ連絡。指定レーンに駐車。',
  },
  {
    id: 'ippan',
    name: '一般',
    category: '一般配送',
    address: '各配送先を伝票で確認',
    hours: '配送先により異なる',
    phone: '—',
    note: '伝票記載の受付時間・搬入口を必ず確認する。',
  },
  {
    id: 'aa',
    name: 'AA',
    category: 'オートオークション',
    address: '会場所在地は開催案内を参照',
    hours: '開催日 9:00 - 16:00',
    phone: '—',
    note: '会場ゲートでバース番号を確認してから搬入。',
  },
  {
    id: 'kokunaisen',
    name: '国内船',
    category: '国内航路',
    address: '指定フェリーターミナル',
    hours: '出航時刻の90分前まで',
    phone: '—',
    note: '乗船受付の締切時刻に注意。車両書類を携行。',
  },
  {
    id: 'yushutsu',
    name: '輸出',
    category: '輸出ヤード',
    address: '輸出専用ヤード / 港湾地区',
    hours: '8:30 - 16:30',
    phone: '—',
    note: '輸出書類・通関確認後に搬入。ゲート受付必須。',
  },
  {
    id: 'nx',
    name: 'NX',
    category: 'NXグループ拠点',
    address: 'NX指定物流拠点',
    hours: '9:00 - 17:00',
    phone: '—',
    note: '受付でバース割当を確認。構内は徐行。',
  },
  {
    id: 'nagoya',
    name: '名古屋',
    category: '名古屋方面',
    address: '名古屋市内 各配送先',
    hours: '配送先により異なる',
    phone: '—',
    note: '市内混雑を考慮し余裕をもって出発する。',
  },
]

function DetailRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof MapPin
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border py-3 last:border-b-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-sm text-foreground">{value}</span>
      </div>
    </div>
  )
}

export function LolView() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = DESTINATIONS.find((d) => d.id === selectedId) ?? null

  if (selected) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          一覧へ戻る
        </button>

        <section className="rounded-3xl border border-border bg-card px-6 py-5">
          <span className="text-xs font-semibold tracking-wide text-primary">
            {selected.category}
          </span>
          <h2 className="mt-1 text-2xl font-bold text-foreground">
            {selected.name}
          </h2>

          <div className="mt-4">
            <DetailRow Icon={MapPin} label="所在地" value={selected.address} />
            <DetailRow Icon={Clock} label="受付時間" value={selected.hours} />
            <DetailRow Icon={Phone} label="連絡先" value={selected.phone} />
            <DetailRow Icon={Truck} label="搬入メモ" value={selected.note} />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">配達先</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          配達先を選ぶと詳細情報を確認できます。
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {DESTINATIONS.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => setSelectedId(d.id)}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-foreground">
                    {d.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.category}
                  </span>
                </span>
              </span>
              <ChevronRight
                className="h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
