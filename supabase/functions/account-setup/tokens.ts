// One-time account setup / password reset tokens.
//
// 16 characters from an alphabet without look-alikes (no 0/O, 1/I/L, U),
// shown grouped as XXXX-XXXX-XXXX-XXXX so it can also be typed in by hand
// (80 bits: guessing is hopeless, and each token expires and works once).
// Only the SHA-256 of the normalized token is ever stored.

export const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
export const TOKEN_LENGTH = 16
export const SYNTHETIC_EMAIL_DOMAIN = 'id.kyoei.invalid'

export function generateToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = ''
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % TOKEN_ALPHABET.length)
  while (out.length < TOKEN_LENGTH) {
    for (const byte of random(32)) {
      if (byte < limit && out.length < TOKEN_LENGTH) out += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
    }
  }
  return out
}

/** Uppercases and strips spaces/dashes; anything outside the alphabet makes it invalid. */
export function normalizeToken(input: string): string | null {
  const cleaned = input.normalize('NFKC').toUpperCase().replace(/[\s\-ー－‐]/g, '')
  if (cleaned.length !== TOKEN_LENGTH) return null
  for (const ch of cleaned) if (!TOKEN_ALPHABET.includes(ch)) return null
  return cleaned
}

export function formatToken(token: string): string {
  return token.match(/.{1,4}/g)!.join('-')
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** "1001" → "1001@id.kyoei.invalid". Login IDs are lowercase ASCII. */
export function normalizeLoginID(input: string): string | null {
  const id = input.normalize('NFKC').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(id) ? id : null
}

export function syntheticEmail(loginID: string): string {
  return `${loginID}@${SYNTHETIC_EMAIL_DOMAIN}`
}

/** The link encoded in the QR code; opening it launches the app's setup screen. */
export function setupURL(token: string): string {
  return `kyoei://setup?t=${token}`
}

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `パスワードは${PASSWORD_MIN}文字以上にしてください`
  if (password.length > PASSWORD_MAX) return `パスワードは${PASSWORD_MAX}文字以内にしてください`
  return null
}
