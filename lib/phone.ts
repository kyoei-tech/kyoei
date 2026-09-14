// Shared helper for turning a freely-typed phone number into a valid
// `tel:` URI. Keeps a leading `+` (international prefix) if present and
// strips everything else that isn't a digit (spaces, hyphens, parens, etc).
export function telHref(phone: string): string {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/[^0-9+]/g, '')
  return `tel:${digits}`
}
