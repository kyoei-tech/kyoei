'use client'

import { useState } from 'react'
import {
  Award,
  BookMarked,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  Car,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  History,
  IdCard,
  MapPin,
  MapPinned,
  MessageCircleQuestion,
  PackageSearch,
  Phone,
  Settings,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BackHeader } from './back-header'
import { HighValueCarsView } from './high-value-cars-view'
import { QAView } from './qa-view'
import { LolView } from './lol-view'
import { LolMapView } from './lol-map-view'
import { BeginnerNotesView } from './beginner-notes-view'
import { AAView } from './aa-view'
import { EmergencyContactsView } from './emergency-contacts-view'
import { AccidentCalendarView } from './accident-calendar-view'
import { DriverTermsView } from './driver-terms-view'
import { TripHistoryView } from './trip-history-view'
import { SettingsView } from './settings-view'
import { MyPageView } from './mypage-view'
import { ComingSoonView } from './coming-soon-view'
import { useScrollToTop } from '@/lib/use-scroll-to-top'
import { useSettings } from '@/lib/settings/settings-context'

export type MenuItemId =
  | 'lolmap'
  | 'lol'
  | 'aa'
  | 'qa'
  | 'cars'
  | 'notes'
  | 'accidents'
  | 'terms'
  | 'trip-history'
  | 'emergency'
  | 'settings'
  | 'mypage'
  | 'dispatch-sheet'
  | 'inspection'
  | 'self-eval'
  | 'award-vote'
  | 'leave-request'
  | 'repair-request'
  | 'packaging-history'

// Shown at the top of the menu only while 試験運転モード is on (see
// bottom-tabs.tsx's hidden 5-tap gesture + settings-context.tsx). 運行履歴
// moves up into this group and is hidden from its old spot below.
const TEST_DRIVE_MENU_ITEMS: {
  id: MenuItemId
  label: string
  description: string
  Icon: LucideIcon
}[] = [
  {
    id: 'mypage',
    label: 'マイページ',
    description: '名前・入社年月日・勤続年数を確認できます。',
    Icon: IdCard,
  },
  {
    id: 'dispatch-sheet',
    label: '配車表',
    description: '配車表を確認できます。',
    Icon: FileText,
  },
  {
    id: 'trip-history',
    label: '運行履歴',
    description: '過去の出庫・帰庫と休息時間を確認できます。',
    Icon: History,
  },
  {
    id: 'inspection',
    label: '点検簿',
    description: '車両の点検記録を確認できます。',
    Icon: ClipboardCheck,
  },
  {
    id: 'self-eval',
    label: '自己評価シート',
    description: '自己評価を記入・確認できます。',
    Icon: ClipboardList,
  },
  {
    id: 'award-vote',
    label: '社長賞投票',
    description: '社長賞にふさわしい方へ投票できます。',
    Icon: Award,
  },
  {
    id: 'leave-request',
    label: '休暇申請',
    description: '休暇の申請ができます。',
    Icon: CalendarOff,
  },
  {
    id: 'repair-request',
    label: '修理申請',
    description: '車両の修理を申請できます。',
    Icon: Wrench,
  },
  {
    id: 'packaging-history',
    label: '荷姿履歴',
    description: '荷姿の履歴を確認できます。',
    Icon: PackageSearch,
  },
]

const MENU_ITEMS: {
  id: MenuItemId
  label: string
  description: string
  Icon: LucideIcon
}[] = [
  {
    id: 'lolmap',
    label: 'List of Location MAP',
    description: '各ボタンを押すとGoogleマップを開きます。',
    Icon: MapPinned,
  },
  {
    id: 'lol',
    label: 'List of Location',
    description: '配達先情報の一覧を確認できます。',
    Icon: MapPin,
  },
  {
    id: 'aa',
    label: 'オークション情報',
    description: 'オークションの開催日・搬出期限を確認できます。',
    Icon: CalendarDays,
  },
  {
    id: 'cars',
    label: '高額車一覧',
    description: '該当車両は中継の際、本郷へ。',
    Icon: Car,
  },
  {
    id: 'accidents',
    label: '無事故カレンダー',
    description: '目指せ無事故！',
    Icon: CalendarCheck,
  },
  {
    id: 'trip-history',
    label: '運行履歴',
    description: '過去の出庫・帰庫と休息時間を確認できます。',
    Icon: History,
  },
  {
    id: 'emergency',
    label: '緊急連絡先',
    description: '緊急時に連絡する連絡先一覧です。',
    Icon: Phone,
  },
  {
    id: 'notes',
    label: '初心者ノート',
    description: '新人向けのメモや手順の確認ができます。',
    Icon: BookOpen,
  },
  {
    id: 'terms',
    label: 'ドライバー語録',
    description: '業界用語、隠語を調べられるおもしろ辞典📖',
    Icon: BookMarked,
  },
  {
    id: 'qa',
    label: 'Q&A',
    description: '匿名で質問・回答できます。',
    Icon: MessageCircleQuestion,
  },
  {
    id: 'settings',
    label: '設定',
    description: 'フォントサイズや背景色を変更できます。',
    Icon: Settings,
  },
]

export function MenuView({
  initialItem = null,
}: {
  /** Opens directly into this item's detail view instead of the top-level list. */
  initialItem?: MenuItemId | null
}) {
  const [selected, setSelected] = useState<MenuItemId | null>(initialItem)
  // True when 'lol' was reached via the AA page's 「会場詳細」 button rather
  // than a normal tap on the List of Location menu item — changes the back
  // button's label/destination to return to the AA page instead of the menu.
  const [viaAAVenueDetail, setViaAAVenueDetail] = useState(false)
  const { partTimeMode, testDriveMode } = useSettings()
  useScrollToTop([selected])

  // LoL (delivery destination info) is hidden for part-time staff, who only
  // need the day-to-day reference pages below. 運行履歴 moves up into the
  // 試験運転モード group above, so it's dropped from this list while that's
  // active to avoid showing it twice.
  const visibleItems = MENU_ITEMS.filter((m) => {
    if (partTimeMode && m.id === 'lol') return false
    if (testDriveMode && m.id === 'trip-history') return false
    return true
  })

  const allItems = testDriveMode
    ? [...TEST_DRIVE_MENU_ITEMS, ...visibleItems]
    : visibleItems

  function goBack() {
    if (viaAAVenueDetail) {
      setViaAAVenueDetail(false)
      setSelected('aa')
    } else {
      setSelected(null)
    }
  }

  if (selected) {
    const item = allItems.find((m) => m.id === selected)
    return (
      <div className="flex flex-col gap-4">
        <BackHeader
          onBack={goBack}
          label={viaAAVenueDetail ? '開催日一覧へ戻る' : 'メニューへ戻る'}
          variant="subtle"
        />
        {item?.id === 'lolmap' && <LolMapView />}
        {item?.id === 'lol' && (
          <LolView initialDestinationId={viaAAVenueDetail ? 'aa' : null} />
        )}
        {item?.id === 'aa' && (
          <AAView
            onOpenVenueDetail={() => {
              setViaAAVenueDetail(true)
              setSelected('lol')
            }}
          />
        )}
        {item?.id === 'qa' && <QAView />}
        {item?.id === 'cars' && <HighValueCarsView />}
        {item?.id === 'notes' && <BeginnerNotesView />}
        {item?.id === 'accidents' && <AccidentCalendarView />}
        {item?.id === 'terms' && <DriverTermsView />}
        {item?.id === 'trip-history' && <TripHistoryView />}
        {item?.id === 'emergency' && <EmergencyContactsView />}
        {item?.id === 'settings' && <SettingsView />}
        {item?.id === 'mypage' && <MyPageView />}
        {item?.id === 'dispatch-sheet' && (
          <ComingSoonView
            title="配車表"
            description="配車表をスマホで見やすい形で確認できます。"
          />
        )}
        {item?.id === 'inspection' && (
          <ComingSoonView
            title="点検簿"
            description="車両の点検記録を確認できます。"
          />
        )}
        {item?.id === 'self-eval' && (
          <ComingSoonView
            title="自己評価シート"
            description="自己評価を記入・確認できます。"
          />
        )}
        {item?.id === 'award-vote' && (
          <ComingSoonView
            title="社長賞投票"
            description="社長賞にふさわしい方へ投票できます。"
          />
        )}
        {item?.id === 'leave-request' && (
          <ComingSoonView
            title="休暇申請"
            description="休暇の申請ができます。"
          />
        )}
        {item?.id === 'repair-request' && (
          <ComingSoonView
            title="修理申請"
            description="車両の修理を申請できます。"
          />
        )}
        {item?.id === 'packaging-history' && (
          <ComingSoonView
            title="荷姿履歴"
            description="荷姿の履歴を確認できます。"
          />
        )}
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

      {testDriveMode && (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-xs font-semibold text-primary">
            試験運転モード
          </p>
          <ul className="flex flex-col gap-2.5">
            {TEST_DRIVE_MENU_ITEMS.map(({ id, label, description, Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSelected(id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/5 px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
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
      )}

      <ul className="flex flex-col gap-2.5">
        {visibleItems.map(({ id, label, description, Icon }) => (
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
