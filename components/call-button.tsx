'use client'

import { Phone } from 'lucide-react'
import { telHref } from '@/lib/phone'

/**
 * Small "call" affordance shown next to a 電話番号 field once it has a
 * value. Renders nothing when the field is empty, so it only ever appears
 * once a phone number has actually been entered.
 */
export function CallButton({
  phone,
  className = '',
}: {
  phone: string
  className?: string
}) {
  const trimmed = phone.trim()
  if (!trimmed) return null
  return (
    <a
      href={telHref(trimmed)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${trimmed}に電話をかける`}
      className={`flex shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 p-2.5 text-primary transition-colors hover:bg-primary/20 active:scale-90 ${className}`}
    >
      <Phone className="h-4 w-4" aria-hidden="true" />
    </a>
  )
}
