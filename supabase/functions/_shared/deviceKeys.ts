// Device keys that approve admin console sign-ins (shared by
// admin-login-approve and account-setup).

/** P-256 ECDSA/SHA-256; key = X9.63 uncompressed point, signature = raw r||s (64 bytes). */
export async function verifyP256(publicKeyBase64: string, message: string, signatureBase64: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', base64ToBytes(publicKeyBase64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, base64ToBytes(signatureBase64), new TextEncoder().encode(message))
  } catch {
    return false
  }
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A registrable device key: 65-byte uncompressed P-256 point. */
export function isDevicePublicKey(b64: unknown): b64 is string {
  if (typeof b64 !== 'string' || b64.length > 200) return false
  try {
    const bytes = base64ToBytes(b64)
    return bytes.length === 65 && bytes[0] === 0x04
  } catch {
    return false
  }
}
