'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import {
  FONT_SCALES,
  FONT_TABS,
  useSettings,
  type ThemeMode,
} from '@/lib/settings/settings-context'

const THEME_OPTIONS: { id: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { id: 'dark', label: 'ダーク', Icon: Moon },
  { id: 'light', label: 'ライト', Icon: Sun },
  { id: 'system', label: 'デバイスに合わせる', Icon: Monitor },
]

const LEVELS = [1, 2, 3, 4, 5, 6]

export function SettingsView() {
  const { theme, setTheme, fontLevels, setFontLevel } = useSettings()

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
        <p className="text-xs text-muted-foreground">
          各タブごとに文字の大きさを6段階で調整できます。
        </p>
        <div className="flex flex-col gap-4">
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
    </div>
  )
}
