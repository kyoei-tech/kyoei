'use client'

import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel } from '@/lib/month-calendar'

/** Left/right swipe gesture that triggers month navigation. */
export function useMonthSwipe(onPrev: () => void, onNext: () => void) {
  const touchX = useRef<number | null>(null)
  return {
    onTouchStart: (e: React.TouchEvent) => {
      touchX.current = e.touches[0].clientX
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchX.current == null) return
      const delta = e.changedTouches[0].clientX - touchX.current
      touchX.current = null
      if (delta > 50) onPrev()
      else if (delta < -50) onNext()
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
