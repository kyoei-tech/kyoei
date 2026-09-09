'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Car,
  ChevronRight,
  MapPin,
  MapPinned,
  MessageCircleQuestion,
  Phone,
  Settings,
  Tag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { HighValueCarsView } from './high-value-cars-view'
import { QAView } from './qa-view'
import { LolView } from './lol-view'
import { LolMapView } from './lol-map-view'
import { BeginnerNotesView } from './beginner-notes-view'
import { AAView } from './aa-view'
import { EmergencyContactsView } from './emergency-contacts-view'
import { AccidentCalendarView } from './accident-calendar-view'
import { DriverTermsView } from './driver-terms-view'
import { SettingsView } from './settings-view'
import { VersionView } from './version-view'
import { CURRENT_VERSION } from '@/lib/changelog'

export type MenuItemId =
  | 'lolmap'
  | 'lol'
  | 'aa'
  | 'qa'
  | 'cars'
  | 'notes'
  | 'accidents'
  | 'terms'
  | 'emergency'
  | 'settings'
  | 'version'

const MENU_ITEMS: {
  id: MenuItemId
  label: string
  description: string
  Icon: LucideIcon
}[] = [
  {
    id: 'lolmap',
    label: 'LoL MAP',
    description: '各ボタンを押すとGoogleマップを開きます。',
    Icon: MapPinned,
  },
  {
    id: 'lol',
    label: 'LoL',
    description: '配達先情報の一覧を確認できます。',
    Icon: MapPin,
  },
  {
    id: 'aa',
    label: 'AA',
    description: 'オークションの開催日・搬出期限を確認できます。',
    Icon: CalendarDays,
  },
  {
    id: 'qa',
    label: 'Q&A',
    description: '匿名で質問・回答できます。',
    Icon: MessageCircleQuestion,
  },
  {
    id: 'cars',
    label: '高額車一覧',
    description: '該当車両は中継の際、本郷へ。',
    Icon: Car,
  },
  {
    id: 'notes',
    label: '初心者ノート',
    description: '新人向けのメモや手順の確認ができます。',
    Icon: BookOpen,
  },
  {
    id: 'accidents',
    label: '無事故カレンダー',
    description: '目指せ無事故！',
    Icon: CalendarCheck,
  },
  {
    id: 'terms',
    label: 'ドライバー語録',
    description: '業界用語、隠語を調べられるおもしろ辞典📖',
    Icon: BookMarked,
  },
  {
    id: 'emergency',
    label: '緊急連絡先',
    description: '緊急時に連絡する連絡先一覧です。',
    Icon: Phone,
  },
  {
    id: 'settings',
    label: '設定',
    description: 'フォントサイズや背景色を変更できます。',
    Icon: Settings,
  },
  {
    id: 'version',
    label: 'Version',
    description: `現在のバージョン：${CURRENT_VERSION}`,
    Icon: Tag,
  },
]

export function MenuView({
  initialItem = null,
}: {
  /** Opens directly into this item's detail view instead of the top-level list. */
  initialItem?: MenuItemId | null
}) {
  const [selected, setSelected] = useState<MenuItemId | null>(initialItem)

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
        {item?.id === 'lolmap' && <LolMapView />}
        {item?.id === 'lol' && <LolView />}
        {item?.id === 'aa' && <AAView />}
        {item?.id === 'qa' && <QAView />}
        {item?.id === 'cars' && <HighValueCarsView />}
        {item?.id === 'notes' && <BeginnerNotesView />}
        {item?.id === 'accidents' && <AccidentCalendarView />}
        {item?.id === 'terms' && <DriverTermsView />}
        {item?.id === 'emergency' && <EmergencyContactsView />}
        {item?.id === 'settings' && <SettingsView />}
        {item?.id === 'version' && <VersionView />}
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
