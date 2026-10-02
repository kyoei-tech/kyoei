// Renders the app's **bold** / ;;red;; / ::orange:: / ##green## markup
// (mirrors KyoeiCore StyledText). Unclosed markers stay literal.
import type { ReactNode } from 'react'

const MARKERS: [string, (child: ReactNode, key: number) => ReactNode][] = [
  ['**', (c, k) => <b key={k}>{c}</b>],
  [';;', (c, k) => <span key={k} style={{ color: '#d7262e' }}>{c}</span>],
  ['::', (c, k) => <span key={k} style={{ color: '#ea7a00' }}>{c}</span>],
  ['##', (c, k) => <span key={k} style={{ color: '#0b7a0b' }}>{c}</span>],
]

function parse(text: string, depth = 0): ReactNode[] {
  const out: ReactNode[] = []
  let buffer = ''
  let i = 0
  while (i < text.length) {
    const marker = depth < 4 ? MARKERS.find(([token]) => text.startsWith(token, i)) : undefined
    if (marker) {
      const close = text.indexOf(marker[0], i + marker[0].length)
      if (close !== -1) {
        if (buffer) out.push(buffer)
        buffer = ''
        out.push(marker[1](parse(text.slice(i + marker[0].length, close), depth + 1), out.length))
        i = close + marker[0].length
        continue
      }
    }
    buffer += text[i]
    i++
  }
  if (buffer) out.push(buffer)
  return out
}

export function StyledText({ text }: { text: string }) {
  return <span style={{ whiteSpace: 'pre-wrap' }}>{parse(text)}</span>
}
