'use client'

import { ExternalLink, MapPinned } from 'lucide-react'

const MAP_LINKS: { label: string; url: string }[] = [
  {
    label: '共栄ヤード',
    url: 'https://www.google.com/maps/d/u/0/edit?mid=1gK_FO4O8IilIlm0RgY_cjm2c5ofPzjw&usp=sharing',
  },
  {
    label: 'LoL',
    url: 'https://www.google.com/maps/d/u/0/edit?mid=18TvmwVsmK7OJCelhGjqScBkIlxpXX34&usp=sharing',
  },
  {
    label: '港関連',
    url: 'https://www.google.com/maps/d/u/0/edit?mid=1xC-jEXbKqoHTB8kWKHA9v7uvMAYsxAE&usp=sharing',
  },
  {
    label: 'ネクステージ',
    url: 'https://www.google.com/maps/d/u/0/edit?mid=1towXDSLY8DJnDkonPUDXMZX-wRPSY5M&usp=sharing',
  },
  {
    label: 'スタンド',
    url: 'https://www.google.com/maps/d/u/0/edit?mid=1jSdhl_c-DsHOQIQFxbZfKkjyvnuXC1I&usp=sharing',
  },
]

export function LolMapView() {
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">LoL MAP</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          各ボタンを押すとGoogleマップを開きます。
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {MAP_LINKS.map(({ label, url }) => (
          <li key={label}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <MapPinned className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="text-base font-semibold text-foreground">
                  {label}
                </span>
              </span>
              <ExternalLink
                className="h-5 w-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
