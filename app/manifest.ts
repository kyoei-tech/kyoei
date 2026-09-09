import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KYOEI',
    short_name: 'KYOEI',
    description: '出庫・帰庫の時刻とシフトタイマーを管理するクロックアプリ',
    start_url: '/',
    display: 'standalone',
    background_color: '#20232e',
    theme_color: '#20232e',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
