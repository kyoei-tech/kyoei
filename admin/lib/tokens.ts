// One-time account setup / reset codes. Mirrors
// supabase/functions/account-setup/tokens.ts (the Edge Function that redeems
// them) — keep the alphabet, length and hashing identical.

export const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
export const TOKEN_LENGTH = 16
export const SYNTHETIC_EMAIL_DOMAIN = 'id.kyoei.invalid'
export const CODE_VALID_FOR = '72 hours'

export function generateToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  let out = ''
  const limit = 256 - (256 % TOKEN_ALPHABET.length)
  while (out.length < TOKEN_LENGTH) {
    for (const byte of random(32)) {
      if (byte < limit && out.length < TOKEN_LENGTH) out += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length]
    }
  }
  return out
}

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

export function normalizeLoginID(input: string): string | null {
  const id = input.normalize('NFKC').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(id) ? id : null
}

export function syntheticEmail(loginID: string): string {
  return `${loginID}@${SYNTHETIC_EMAIL_DOMAIN}`
}

/** Encoded in the QR code: opens the app's setup screen directly. */
export function appSetupURL(token: string): string {
  return `kyoei://setup?t=${token}`
}

/** For LINE etc. (custom schemes aren't tappable there): this console's /setup page. */
export function webSetupURL(siteOrigin: string, token: string): string {
  return `${siteOrigin.replace(/\/$/, '')}/setup?t=${token}`
}
