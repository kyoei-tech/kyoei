/**
 * Hiragana/katakana normalization helpers used to let search inputs written
 * in hiragana also match katakana or kanji text elsewhere in the app.
 */

const HIRAGANA_START = 0x3041
const HIRAGANA_END = 0x3096
// Hiragana and katakana codepoints are offset by a fixed amount, so
// converting between them is just a codepoint shift.
const KANA_OFFSET = 0x60

export function hiraganaToKatakana(input: string): string {
  let result = ''
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= HIRAGANA_START && code <= HIRAGANA_END) {
      result += String.fromCodePoint(code + KANA_OFFSET)
    } else {
      result += ch
    }
  }
  return result
}

export function katakanaToHiragana(input: string): string {
  let result = ''
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0
    if (
      code >= HIRAGANA_START + KANA_OFFSET &&
      code <= HIRAGANA_END + KANA_OFFSET
    ) {
      result += String.fromCodePoint(code - KANA_OFFSET)
    } else {
      result += ch
    }
  }
  return result
}

/** True if every character is hiragana, katakana, or the long-vowel mark 'ー'. */
export function isKanaOnly(input: string): boolean {
  if (!input) return false
  return [...input].every((ch) => {
    const code = ch.codePointAt(0) ?? 0
    return (
      (code >= HIRAGANA_START && code <= HIRAGANA_END + KANA_OFFSET) ||
      ch === 'ー'
    )
  })
}
