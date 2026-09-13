import type { Tokenizer, IpadicFeatures } from 'kuromoji'

// The tokenizer dictionary is ~17MB, so it's built exactly once per browser
// session (lazily, on first search) and shared by every search box in the
// app instead of being rebuilt per component.
let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null

export function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('kuromoji is client-only'))
  }
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      import('kuromoji').then((kuromoji) => {
        kuromoji.default
          .builder({ dicPath: '/kuromoji-dict/' })
          .build((err, tokenizer) => {
            if (err) reject(err)
            else resolve(tokenizer)
          })
      })
    })
  }
  return tokenizerPromise
}
