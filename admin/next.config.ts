import type { NextConfig } from 'next'

// Security headers for every page: no framing (clickjacking), no MIME
// sniffing, no referrer leaking codes in URLs, and HTTPS only.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This app lives in admin/ inside the web app's repository: keep Turbopack
  // from picking up the parent's config (Tailwind/PostCSS, lockfile).
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
