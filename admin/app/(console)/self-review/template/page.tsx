import { requireAdmin } from '@/lib/auth'
import { monthRange, shiftMonth } from '@/lib/inspection'
import { periodFrom, type AllowanceRow } from '@/lib/review'
import { createClient } from '@/lib/supabase/server'
import { TemplateForm } from './TemplateForm'

/** The month's 項目0〜10, 目標・反省の質問, 提出期限 and 手当表. */
export default async function ReviewTemplatePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin()
  const params = await searchParams
  const month = periodFrom(params.month) ? params.month! : shiftMonth(monthRange(undefined).month, -1)
  const period = `${month}-01`
  const supabase = await createClient()
  const { data } = await supabase
    .from('self_review_templates')
    .select('period, purpose_question, items, goal_questions, reflection_questions, allowance, deadline_day')
    .lte('period', period).order('period', { ascending: false }).limit(1)
  const base = data?.[0]
  return (
    <TemplateForm
      key={period}
      month={month}
      inheritedFrom={base && base.period !== period ? base.period.slice(0, 7) : null}
      initial={base ? { ...base, allowance: base.allowance as AllowanceRow[] } : null}
    />
  )
}
