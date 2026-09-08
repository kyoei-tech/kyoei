'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type FontTabId = 'home' | 'yard' | 'staff' | 'news' | 'menu'
export type ThemeMode = 'dark' | 'light' | 'system'

export const FONT_TABS: { id: FontTabId; label: string }[] = [
  { id: 'home', label: 'ホーム' },
  { id: 'yard', label: 'ヤード配置' },
  { id: 'staff', label: '出勤簿' },
  { id: 'news', label: 'おしらせ' },
  { id: 'menu', label: 'メニュー' },
]

// Level 1 is the floor: it matches today's default size (e.g. the home
// tab's current-time display), so text can only be scaled up from here,
// never smaller than what's already on screen. Levels 2-6 step up by 0.1
// each, a bigger jump than the previous 5-level scale's 0.075 step.
const DEFAULT_FONT_LEVEL = 1
export const FONT_SCALES = [1, 1.1, 1.2, 1.3, 1.4, 1.5]

const STORAGE_KEY = 'kyoei-settings'

type StoredSettings = {
  theme: ThemeMode
  fontLevels: Record<FontTabId, number>
}

function defaultSettings(): StoredSettings {
  return {
    theme: 'dark',
    fontLevels: {
      home: DEFAULT_FONT_LEVEL,
      yard: DEFAULT_FONT_LEVEL,
      staff: DEFAULT_FONT_LEVEL,
      news: DEFAULT_FONT_LEVEL,
      menu: DEFAULT_FONT_LEVEL,
    },
  }
}

function loadSettings(): StoredSettings {
  if (typeof window === 'undefined') return defaultSettings()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultSettings()
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    const base = defaultSettings()
    return {
      theme: parsed.theme ?? base.theme,
      fontLevels: { ...base.fontLevels, ...(parsed.fontLevels ?? {}) },
    }
  } catch {
    return defaultSettings()
  }
}

type SettingsContextValue = {
  theme: ThemeMode
  setTheme: (t: ThemeMode) => void
  fontLevels: Record<FontTabId, number>
  setFontLevel: (tab: FontTabId, level: number) => void
  fontScaleFor: (tab: FontTabId) => number
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StoredSettings>(defaultSettings)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSettings(loadSettings())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [hydrated, settings])

  // Applies the effective (dark/light) theme to <html>, following the OS
  // setting live when the user has chosen "system".
  useEffect(() => {
    const root = document.documentElement
    function applyEffective() {
      const isLight =
        settings.theme === 'light' ||
        (settings.theme === 'system' &&
          window.matchMedia('(prefers-color-scheme: light)').matches)
      root.classList.toggle('light', isLight)
      root.style.colorScheme = isLight ? 'light' : 'dark'
    }
    applyEffective()
    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: light)')
      mq.addEventListener('change', applyEffective)
      return () => mq.removeEventListener('change', applyEffective)
    }
  }, [settings.theme])

  const setTheme = useCallback(
    (t: ThemeMode) => setSettings((p) => ({ ...p, theme: t })),
    [],
  )
  const setFontLevel = useCallback(
    (tab: FontTabId, level: number) =>
      setSettings((p) => ({
        ...p,
        fontLevels: { ...p.fontLevels, [tab]: level },
      })),
    [],
  )
  const fontScaleFor = useCallback(
    (tab: FontTabId) =>
      FONT_SCALES[(settings.fontLevels[tab] ?? DEFAULT_FONT_LEVEL) - 1] ?? 1,
    [settings.fontLevels],
  )

  const value = useMemo<SettingsContextValue>(
    () => ({
      theme: settings.theme,
      setTheme,
      fontLevels: settings.fontLevels,
      setFontLevel,
      fontScaleFor,
    }),
    [settings.theme, settings.fontLevels, setTheme, setFontLevel, fontScaleFor],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
