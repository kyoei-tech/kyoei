'use client'

// Minimal pub/sub so any part of the app (most importantly the timer tick
// in home-view.tsx, which is not necessarily mounted under the same tree as
// the toast container) can trigger an in-app toast without prop-drilling or
// a context provider. `NotificationToastContainer` (mounted once, at the
// app root) is the only subscriber in practice.

export type ToastEvent = {
  id: string
  title: string
  message: string
}

type Listener = (event: ToastEvent) => void

const listeners = new Set<Listener>()

export function emitToast(title: string, message: string): void {
  const event: ToastEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    message,
  }
  console.log('[v0] emitToast called, listener count:', listeners.size, event)
  for (const listener of listeners) listener(event)
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener)
  console.log('[v0] subscribeToast, listener count now:', listeners.size)
  return () => {
    listeners.delete(listener)
    console.log('[v0] unsubscribeToast, listener count now:', listeners.size)
  }
}
