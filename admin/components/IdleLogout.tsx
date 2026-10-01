'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/** Signs out after 15 minutes without mouse/keyboard/touch activity (any tab). */
export const IDLE_LIMIT_MS = 15 * 60 * 1000
const KEY = 'kyoei-admin-last-activity'

export function IdleLogout() {
  useEffect(() => {
    const touch = () => {
      try {
        localStorage.setItem(KEY, String(Date.now()))
      } catch {}
    }
    const lastActivity = () => {
      try {
        return Number(localStorage.getItem(KEY)) || Date.now()
      } catch {
        return Date.now()
      }
    }
    touch()
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
    let pending = false
    const onActivity = () => {
      if (pending) return
      pending = true
      setTimeout(() => {
        pending = false
        touch()
      }, 5000)
    }
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    const timer = setInterval(async () => {
      if (Date.now() - lastActivity() >= IDLE_LIMIT_MS) {
        clearInterval(timer)
        await createClient().auth.signOut()
        window.location.href = '/login?idle=1'
      }
    }, 15_000)
    return () => {
      clearInterval(timer)
      events.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [])
  return null
}
