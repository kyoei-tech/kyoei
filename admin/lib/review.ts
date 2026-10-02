// 自己評価・目標設定シート helpers (mirrors self_review_templates / the iOS SelfReview.swift).

export const MARKS = ['×', '△', '○', '◎'] as const // index = points

export type AllowanceRow = { min: number; max: number; amount: number }

export type TemplateInput = {
  purpose_question: string
  items: string[]
  goal_questions: string[]
  reflection_questions: string[]
  allowance: AllowanceRow[]
  deadline_day: number
}

/** "2026-09" → "2026-09-01"; null when malformed. */
export function periodFrom(month: string | undefined): string | null {
  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${month}-01` : null
}

export function markOf(points: number | null | undefined): string {
  return points == null ? '－' : (MARKS[points] ?? '－')
}

export function sum(scores: (number | null)[] | null | undefined): number | null {
  return scores && scores.length ? scores.reduce<number>((n, s) => n + (s ?? 0), 0) : null
}

/** Validates the template form; returns the row or a Japanese error. */
export function templateFromForm(get: (key: string) => string | null): TemplateInput | { error: string } {
  const text = (key: string) => (get(key) ?? '').trim()
  const purpose = text('purpose_question')
  const items = Array.from({ length: 10 }, (_, i) => text(`item_${i}`))
  const goals = Array.from({ length: 4 }, (_, i) => text(`goal_${i}`))
  const reflections = Array.from({ length: 4 }, (_, i) => text(`reflection_${i}`))
  const deadline = Number(get('deadline_day') ?? '15')
  if (!purpose) return { error: '項目0の質問を入力してください。' }
  if (items.some((x) => !x)) return { error: '項目1〜10をすべて入力してください。' }
  if (goals.some((x) => !x) || reflections.some((x) => !x)) return { error: '目標と反省の質問を4つずつ入力してください。' }
  if (!Number.isInteger(deadline) || deadline < 1 || deadline > 28) return { error: '提出期限は1〜28日で入力してください。' }
  const allowance: AllowanceRow[] = []
  for (let i = 0; i < 30; i++) {
    const min = get(`a_min_${i}`), max = get(`a_max_${i}`), amount = get(`a_amount_${i}`)
    if (min === null && max === null && amount === null) continue
    if (!min?.trim() && !max?.trim() && !amount?.trim()) continue
    const row = { min: Number(min), max: Number(max), amount: Number(String(amount).replace(/[,円\s]/g, '')) }
    if (![row.min, row.max, row.amount].every(Number.isInteger) || row.min < 0 || row.max > 90 || row.min > row.max || row.amount < 0) {
      return { error: `手当表の${i + 1}行目を確認してください（点数は0〜90、金額は整数）。` }
    }
    allowance.push(row)
  }
  const problem = allowanceProblem(allowance)
  if (problem) return { error: problem }
  return { purpose_question: purpose, items, goal_questions: goals, reflection_questions: reflections, allowance: allowance.sort((a, b) => b.min - a.min), deadline_day: deadline }
}

/** Every score 0〜90 must fall in exactly one row. */
export function allowanceProblem(rows: AllowanceRow[]): string | null {
  for (let score = 0; score <= 90; score++) {
    const hits = rows.filter((r) => score >= r.min && score <= r.max).length
    if (hits === 0) return `手当表に${score}点の行がありません。0〜90点をすべて含めてください。`
    if (hits > 1) return `手当表で${score}点が複数の行に入っています。`
  }
  return null
}
