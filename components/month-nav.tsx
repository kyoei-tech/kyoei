'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel } from '@/lib/month-calendar'

/** Left/right swipe gesture that triggers month navigation. Vertical drags
 *  (page scrolling) are ignored so scrolling down never changes the month. */
export function useMonthSwipe(onPrev: () => void, onNext: () => void) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => {
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchStart.current == null) return
      const deltaX = e.changedTouches[0].clientX - touchStart.current.x
      const deltaY = e.changedTouches[0].clientY - touchStart.current.y
      touchStart.current = null
      // Only treat this as a month swipe when the horizontal movement
      // clearly dominates the vertical movement.
      if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
        return
      }
      if (deltaX > 0) onPrev()
      else onNext()
    },
  }
}

/** "< 2026年9月 >" header shared by every month-swipe calendar. */
export function MonthNav({
  date,
  onPrev,
  onNext,
}: {
  date: Date
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        aria-label="前の月"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="text-base font-bold text-foreground">
        {monthLabel(date)}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="次の月"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground active:scale-90"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
