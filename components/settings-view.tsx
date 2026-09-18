'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Monitor,
  Moon,
  Smartphone,
  Sun,
  Tag,
  UserRound,
} from 'lucide-react'
import {
  FONT_SCALES,
  FONT_TABS,
  useSettings,
  type ThemeMode,
} from '@/lib/settings/settings-context'
import {
  ensureServiceWorkerRegistration,
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '@/lib/notifications/push-notifications'
import {
  ensurePushSubscription,
  removePushSubscription,
} from '@/lib/notifications/web-push-subscription'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { usePasswordGate } from './password-prompt'
import { BackHeader } from './back-header'
import { PushNotificationEditorView } from './push-notification-editor-view'
import { NotificationAdminMenu } from './notification-admin-menu'
import { AlertMessageEditorView } from './alert-message-editor-view'
import { YardDestinationRegistryView } from './yard-destination-registry-view'
import { VersionView } from './version-view'
import { useCurrentVersion } from '@/lib/changelog'

const THEME_OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'dark', label: 'ダーク', Icon: Moon },
  { id: 'light', label: 'ライト', Icon: Sun },
  { id: 'system', label: 'デバイスに合わせる', Icon: Monitor },
]

const LEVELS = [1, 2, 3, 4, 5, 6]

const PART_TIME_MODE_PASSCODE = '2486'
const PUSH_NOTIFICATION_EDITOR_PASSCODE = '0525'

// Tapping the bell icon 5 times within this window opens the (otherwise
// hidden) notification admin menu, behind a PIN. Same convention as the
// home tab's 5-tap 乗務員/タイムカードモード gesture in bottom-tabs.tsx.
const SECRET_TAP_COUNT = 5
const SECRET_TAP_WINDOW_MS = 2000

type SecretScreen =
  | 'menu'
  | 'push-editor'
  | 'alert-editor'
  | 'destination-registry'
type SubScreen = 'version'

// Lightweight fetch for the 乗務員ID selector below — only the fields the
// picker needs, distinct from staff-attendance-view.tsx's fuller StaffRow
// shape (see the cacheKey note in use-realtime-table.ts).
async function fetchStaffOptions(): Promise<{ id: string; name: string }[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('staff_members')
    .select('id, name')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data as { id: string; name: string }[]) ?? []
}

export function SettingsView() {
  const {
    theme,
    setTheme,
    fontLevels,
    setFontLevel,
    deviceFont,
    setDeviceFont,
    partTimeMode,
    setPartTimeMode,
    pushNotificationsEnabled,
    setPushNotificationsEnabled,
    staffMemberId,
    setStaffMemberId,
  } = useSettings()
  const { data: staffOptions } = useRealtimeTable<{
    id: string
    name: string
  }>('staff_members', fetchStaffOptions, { cacheKey: 'settings-picker' })
  const { guard, prompt } = usePasswordGate(PART_TIME_MODE_PASSCODE)
  const { guard: guardEditor, prompt: editorPrompt } = usePasswordGate(
    PUSH_NOTIFICATION_EDITOR_PASSCODE,
  )
  const [secretScreen, setSecretScreen] = useState<SecretScreen | null>(null)
  const [subScreen, setSubScreen] = useState<SubScreen | null>(null)
  const [staffPickerOpen, setStaffPickerOpen] = useState(false)
  const currentVersion = useCurrentVersion()
  const bellTapCountRef = useRef(0)
  const bellTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [notificationSupported, setNotificationSupported] = useState(true)
  const [permission, setPermission] =
    useState<NotificationPermission | null>(null)
  const [pushSubscriptionError, setPushSubscriptionError] = useState<
    string | null
  >(null)
  const [pushSubscribed, setPushSubscribed] = useState(false)

  async function syncPushSubscription() {
    const result = await ensurePushSubscription()
    if (result.ok) {
      setPushSubscribed(true)
      setPushSubscriptionError(null)
    } else {
      setPushSubscribed(false)
      setPushSubscriptionError(result.reason)
    }
  }

  useEffect(() => {
    setNotificationSupported(isNotificationSupported())
    setPermission(getNotificationPermission())
  }, [])

  // Push notifications default to ON, but the browser still requires
  // permission to actually be granted before anything can show. Opportunistically
  // ask once, the first time this page is opened, if it hasn't been decided yet.
  useEffect(() => {
    if (!pushNotificationsEnabled) return
    if (!isNotificationSupported()) return
    if (getNotificationPermission() !== 'default') return
    requestNotificationPermission().then((result) => {
      setPermission(result)
      if (result === 'granted') {
        void ensureServiceWorkerRegistration().then(() =>
          syncPushSubscription(),
        )
      } else {
        setPushNotificationsEnabled(false)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  // Also (re)confirm the subscription whenever notifications are already
  // granted and enabled on mount, e.g. after the service worker updates or
  // the browser cleared a stale subscription.
  useEffect(() => {
    if (pushNotificationsEnabled && getNotificationPermission() === 'granted') {
      void syncPushSubscription()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  async function handleTogglePushNotifications() {
    if (pushNotificationsEnabled) {
      setPushNotificationsEnabled(false)
      setPushSubscribed(false)
      setPushSubscriptionError(null)
      void removePushSubscription()
      return
    }
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      await ensureServiceWorkerRegistration()
      await syncPushSubscription()
      setPushNotificationsEnabled(true)
    }
  }

  function handleBellTap() {
    bellTapCountRef.current += 1
    if (bellTapTimerRef.current) clearTimeout(bellTapTimerRef.current)
    if (bellTapCountRef.current >= SECRET_TAP_COUNT) {
      bellTapCountRef.current = 0
      guardEditor(() => setSecretScreen('menu'))
      return
    }
    bellTapTimerRef.current = setTimeout(() => {
      bellTapCountRef.current = 0
    }, SECRET_TAP_WINDOW_MS)
  }

  if (subScreen === 'version') {
    return (
      <div className="flex flex-col gap-4">
        <BackHeader
          onBack={() => setSubScreen(null)}
          label="設定へ戻る"
          variant="subtle"
        />
        <VersionView />
      </div>
    )
  }

  if (secretScreen === 'menu') {
    return (
      <>
        <NotificationAdminMenu
          onBack={() => setSecretScreen(null)}
          onOpenPushEditor={() => setSecretScreen('push-editor')}
          onOpenAlertEditor={() => setSecretScreen('alert-editor')}
          onOpenDestinationRegistry={() =>
            setSecretScreen('destination-registry')
          }
        />
        {editorPrompt}
      </>
    )
  }

  if (secretScreen === 'push-editor') {
    return (
      <>
        <PushNotificationEditorView onBack={() => setSecretScreen('menu')} />
        {editorPrompt}
      </>
    )
  }

  if (secretScreen === 'alert-editor') {
    return (
      <>
        <AlertMessageEditorView onBack={() => setSecretScreen('menu')} />
        {editorPrompt}
      </>
    )
  }

  if (secretScreen === 'destination-registry') {
    return (
      <>
        <YardDestinationRegistryView onBack={() => setSecretScreen('menu')} />
        {editorPrompt}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">設定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          フォントサイズや背景色をこの端末用に変更できます。
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card px-5 py-5">
        <h3 className="text-base font-bold text-foreground">フォント</h3>

        <button
          type="button"
          onClick={() => setDeviceFont(!deviceFont)}
          aria-pressed={deviceFont}
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99] ${
            deviceFont
              ? 'border-primary bg-primary/15'
              : 'border-border bg-background'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Smartphone
              className={`h-5 w-5 ${deviceFont ? 'text-primary' : 'text-muted-foreground'}`}
              aria-hidden="true"
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                デバイスに合わせる
              </span>
              <span className="text-xs text-muted-foreground">
                ONの場合、デバイスの文字サイズ設定に合わせて表示します。
              </span>
            </span>
          </span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              deviceFont ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card transition-transform ${
                deviceFont ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>

        <p className="text-xs text-muted-foreground">
          {deviceFont
            ? 'デバイスに合わせる設定がONのため、下の個別設定は無効になっています。'
            : '各タブごとに文字の大きさを6段階で調整できます。'}
        </p>
        <div
          className={`flex flex-col gap-4 ${
            deviceFont ? 'pointer-events-none opacity-40' : ''
          }`}
        >
          {FONT_TABS.map(({ id, label }) => (
            <div key={id} className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-foreground">
                {label}
              </span>
              <div className="flex items-center gap-1.5">
                {LEVELS.map((level) => {
                  const active = fontLevels[id] === level
                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={deviceFont}
                      onClick={() => setFontLevel(id, level)}
                      aria-pressed={active}
                      aria-label={`${label}の文字サイズ ${level}`}
                      className={`flex h-9 flex-1 items-center justify-center rounded-lg border text-sm font-bold transition-colors active:scale-95 ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      }`}
                      style={{
                        // Preview size follows the real scale ratio so the
                        // buttons visibly reflect the bigger per-level jump.
                        fontSize: `${0.75 * FONT_SCALES[level - 1]}rem`,
                      }}
                    >
                      Aa
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
        <h3 className="text-base font-bold text-foreground">背景色</h3>
        <p className="text-xs text-muted-foreground">
          背景を黒か白から選べます。デバイスのダークモードに自動で合わせることもできます。
        </p>
        <div className="flex gap-2">
          {THEME_OPTIONS.map(({ id, label, Icon }) => {
            const active = theme === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                aria-pressed={active}
                className={`flex flex-1 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-semibold transition-colors active:scale-95 ${
                  active
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
        <h3 className="text-base font-bold text-foreground">乗務員ID</h3>
        <p className="text-xs text-muted-foreground">
          出勤簿の自分の名前を選ぶと、ホームの出庫・帰庫がそのまま出勤簿の状態に反映されます。
        </p>
        <button
          type="button"
          onClick={() => setStaffPickerOpen((open) => !open)}
          aria-expanded={staffPickerOpen}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-left transition-colors active:scale-[0.99]"
        >
          <span className="flex items-center gap-2.5">
            <UserRound
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-foreground">
              {staffMemberId === null
                ? '未設定'
                : (staffOptions.find((m) => m.id === staffMemberId)?.name ??
                  '未設定')}
            </span>
          </span>
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
              staffPickerOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
        {staffPickerOpen ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setStaffMemberId(null)
                setStaffPickerOpen(false)
              }}
              aria-pressed={staffMemberId === null}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors active:scale-95 ${
                staffMemberId === null
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              未設定
            </button>
            {staffOptions.map((member) => {
              const active = staffMemberId === member.id
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => {
                    setStaffMemberId(member.id)
                    setStaffPickerOpen(false)
                  }}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors active:scale-95 ${
                    active
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                  {member.name}
                </button>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
        <h3 className="text-base font-bold text-foreground">モード</h3>
        <p className="text-xs text-muted-foreground">
          {partTimeMode
            ? 'アルバイトモード中は編集操作が制限され、シンプルなタイムカード画面のみ利用できます。'
            : '暗証番号を入力すると、編集操作を制限したシンプルな画面に切り替えられます。'}
        </p>
        <button
          type="button"
          onClick={() => guard(() => setPartTimeMode(!partTimeMode))}
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99] ${
            partTimeMode
              ? 'border-primary bg-primary/15'
              : 'border-border bg-background'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Briefcase
              className={`h-5 w-5 ${partTimeMode ? 'text-primary' : 'text-muted-foreground'}`}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-foreground">
              {partTimeMode ? '社員モードに切り替え' : 'アルバイトモード'}
            </span>
          </span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              partTimeMode ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card transition-transform ${
                partTimeMode ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5">
        <h3 className="text-base font-bold text-foreground">プッシュ通知</h3>
        <p className="text-xs text-muted-foreground">
          運行状況の連続走行時間・累計休息時間・運行時間が一定の時間を超えると通知でお知らせします。
        </p>
        <button
          type="button"
          onClick={handleTogglePushNotifications}
          disabled={!notificationSupported}
          aria-pressed={pushNotificationsEnabled}
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99] disabled:opacity-50 ${
            pushNotificationsEnabled
              ? 'border-primary bg-primary/15'
              : 'border-border bg-background'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Bell
              onClick={(e) => {
                e.stopPropagation()
                handleBellTap()
              }}
              className={`h-5 w-5 ${
                pushNotificationsEnabled ? 'text-primary' : 'text-muted-foreground'
              }`}
              aria-hidden="true"
            />
            <span className="text-sm font-semibold text-foreground">
              プッシュ通知
            </span>
          </span>
          <span
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              pushNotificationsEnabled ? 'bg-primary' : 'bg-border'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card transition-transform ${
                pushNotificationsEnabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
        {!notificationSupported ? (
          <p className="text-xs text-muted-foreground">
            このブラウザは通知に対応していません。
          </p>
        ) : permission === 'denied' ? (
          <p className="text-xs text-destructive">
            通知がブロックされています。ブラウザの設定から通知を許可してください。
          </p>
        ) : pushSubscriptionError ? (
          <p className="text-xs text-destructive">{pushSubscriptionError}</p>
        ) : pushNotificationsEnabled && pushSubscribed ? (
          <p className="text-xs text-muted-foreground">
            この端末はプッシュ通知の登録済みです。アプリを閉じていても届きます。
          </p>
        ) : null}
      </section>

      {!partTimeMode && (
        <button
          type="button"
          onClick={() => setSubScreen('version')}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Tag className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-base font-semibold text-foreground">
                Version
              </span>
              <span className="text-xs text-muted-foreground">
                現在のバージョン：{currentVersion}
              </span>
            </span>
          </span>
          <ChevronRight
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      )}

      {prompt}
      {editorPrompt}
    </div>
  )
}
