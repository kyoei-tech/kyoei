'use client'

import { useEffect, useRef, useState } from 'react'
import { Bell, Briefcase, Monitor, Moon, Smartphone, Sun } from 'lucide-react'
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
import { usePasswordGate } from './password-prompt'
import { PushNotificationEditorView } from './push-notification-editor-view'

const THEME_OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'dark', label: 'ダーク', Icon: Moon },
  { id: 'light', label: 'ライト', Icon: Sun },
  { id: 'system', label: 'デバイスに合わせる', Icon: Monitor },
]

const LEVELS = [1, 2, 3, 4, 5, 6]

const PART_TIME_MODE_PASSCODE = '2486'
const PUSH_NOTIFICATION_EDITOR_PASSCODE = '7391'

// Tapping the bell icon 5 times within this window opens the (otherwise
// hidden) push-notification rule editor, behind a PIN. Same convention as
// the home tab's 5-tap 乗務員/タイムカードモード gesture in bottom-tabs.tsx.
const SECRET_TAP_COUNT = 5
const SECRET_TAP_WINDOW_MS = 2000

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
  } = useSettings()
  const { guard, prompt } = usePasswordGate(PART_TIME_MODE_PASSCODE)
  const { guard: guardEditor, prompt: editorPrompt } = usePasswordGate(
    PUSH_NOTIFICATION_EDITOR_PASSCODE,
  )
  const [showEditor, setShowEditor] = useState(false)
  const bellTapCountRef = useRef(0)
  const bellTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [notificationSupported, setNotificationSupported] = useState(true)
  const [permission, setPermission] =
    useState<NotificationPermission | null>(null)

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
      if (result === 'granted') void ensureServiceWorkerRegistration()
      else setPushNotificationsEnabled(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, [])

  async function handleTogglePushNotifications() {
    if (pushNotificationsEnabled) {
      setPushNotificationsEnabled(false)
      return
    }
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      await ensureServiceWorkerRegistration()
      setPushNotificationsEnabled(true)
    }
  }

  function handleBellTap() {
    bellTapCountRef.current += 1
    if (bellTapTimerRef.current) clearTimeout(bellTapTimerRef.current)
    if (bellTapCountRef.current >= SECRET_TAP_COUNT) {
      bellTapCountRef.current = 0
      guardEditor(() => setShowEditor(true))
      return
    }
    bellTapTimerRef.current = setTimeout(() => {
      bellTapCountRef.current = 0
    }, SECRET_TAP_WINDOW_MS)
  }

  if (showEditor) {
    return (
      <>
        <PushNotificationEditorView onBack={() => setShowEditor(false)} />
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
        ) : null}
      </section>

      {prompt}
      {editorPrompt}
    </div>
  )
}
