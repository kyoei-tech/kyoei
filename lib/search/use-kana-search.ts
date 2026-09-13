'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Tokenizer, IpadicFeatures } from 'kuromoji'
import { getTokenizer } from './kuromoji-tokenizer'
import { hiraganaToKatakana, katakanaToHiragana } from './kana'

// Readings are expensive to compute (morphological analysis), so they're
// cached by source text and shared across every search box in the app.
const readingCache = new Map<string, string>()

function readingOf(
  tokenizer: Tokenizer<IpadicFeatures>,
  text: string,
): string {
  const cached = readingCache.get(text)
  if (cached !== undefined) return cached
  const reading = tokenizer
    .tokenize(text)
    .map((t) => katakanaToHiragana(t.reading || t.surface_form))
    .join('')
  readingCache.set(text, reading)
  return reading
}

/**
 * Lets a search query typed in hiragana also match katakana or kanji text
 * (e.g. typing "とうきょう" finds "東京" or "トウキョウ"). Falls back to a
 * plain substring/hiragana-katakana match until the morphological analyzer
 * (kuromoji) finishes loading, then upgrades to reading-aware kanji matches.
 */
export function useKanaSearch() {
  const [ready, setReady] = useState(false)
  const tokenizerRef = useRef<Tokenizer<IpadicFeatures> | null>(null)

  useEffect(() => {
    let mounted = true
    getTokenizer()
      .then((tokenizer) => {
        if (!mounted) return
        tokenizerRef.current = tokenizer
        setReady(true)
      })
      .catch(() => {
        // Kanji-reading matches just stay unavailable; kana normalization
        // below still works without the tokenizer.
      })
    return () => {
      mounted = false
    }
  }, [])

  const matches = useCallback(
    (text: string | null | undefined, rawQuery: string): boolean => {
      const query = rawQuery.trim().toLowerCase()
      if (!query) return true
      const haystack = (text ?? '').toLowerCase()
      if (!haystack) return false
      if (haystack.includes(query)) return true

      const queryAsHiragana = katakanaToHiragana(query)
      const queryAsKatakana = hiraganaToKatakana(query)
      if (
        haystack.includes(queryAsHiragana) ||
        haystack.includes(queryAsKatakana)
      ) {
        return true
      }

      const tokenizer = tokenizerRef.current
      if (tokenizer) {
        const reading = readingOf(tokenizer, text ?? '')
        if (reading.includes(queryAsHiragana)) return true
      }

      return false
    },
    // `ready` isn't read directly, but including it gives `matches` a new
    // identity once the tokenizer finishes loading, so callers memoizing
    // filtered results off this function (e.g. useMemo/useCallback deps)
    // recompute and pick up kanji-reading matches instead of staying stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready],
  )

  return { matches, ready }
}
