'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  Car,
  ChevronRight,
  MapPin,
  MessageCircleQuestion,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { HighValueCarsView } from './high-value-cars-view'
import { QAView } from './qa-view'
import { LolView } from './lol-view'
import { BeginnerNotesView } from './beginner-notes-view'

type MenuItemId = 'cars' | 'qa' | 'lol' | 'notes'

const MENU_ITEMS: {
  id: MenuItemId
  label: string
  description: string
  Icon: LucideIcon
}[] = [
  {
    id: 'cars',
    label: '高額車一覧',
    description: '高額車の車種・型式・メモを確認できます。',
    Icon: Car,
  },
  {
    id: 'qa',
    label: 'Q&A',
    description: '匿名で質問・回答できます。',
    Icon: MessageCircleQuestion,
  },
  {
    id: 'lol',
    label: 'LoL',
    description: '車両位置の一覧を確認できます。',
    Icon: MapPin,
  },
  {
    id: 'notes',
    label: '初心者ノート',
    description: '新人向けのメモや手順を確認できます。',
    Icon: BookOpen,
  },
]

export function MenuView() {
  const [selected, setSelected] = useState<MenuItemId | null>(null)

  if (selected) {
    const item = MENU_ITEMS.find((m) => m.id === selected)
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          メニューへ戻る
        </button>
        {item?.id === 'cars' && <HighValueCarsView />}
        {item?.id === 'qa' && <QAView />}
        {item?.id === 'lol' && <LolView />}
        {item?.id === 'notes' && <BeginnerNotesView />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">メニュー</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          その他の項目はこちらから確認できます。
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {MENU_ITEMS.map(({ id, label, description, Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => setSelected(id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-foreground">
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {description}
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
