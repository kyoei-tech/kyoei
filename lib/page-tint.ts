// Whole-page background tint used on ホーム/運行情報/休息状況/勤務状況 so a
// driver or office worker can tell at a glance whether they're currently
// "on" (出庫中/出勤中 — green) or "off" (帰庫済み/退勤 — orange) and never
// forget to flip the switch. PAGE_BLEED_CLASS cancels out the surrounding
// <main>'s px-4/pt-6/pb-6 padding (see attendance-app.tsx) so the tint
// reaches the screen edges instead of looking like an inset card.
export type PageStatus = 'working' | 'resting' | 'none'

export const PAGE_BLEED_CLASS = '-mx-4 -mt-6 -mb-6 px-4 pt-6 pb-6'

export function pageTintClass(status: PageStatus): string {
  switch (status) {
    case 'working':
      return 'bg-primary/[0.07]'
    case 'resting':
      return 'bg-secondary/[0.07]'
    default:
      return ''
  }
}
