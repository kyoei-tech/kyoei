'use client'

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  MessageCircleQuestion,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'

type Question = { id: string; title: string; createdAt: number }
type Answer = {
  id: string
  questionId: string
  responder: string
  body: string
  createdAt: number
}

// Shared across every browser via the `qa_questions` / `qa_answers` tables.
type QuestionRow = { id: string; title: string; created_at: string }
type AnswerRow = {
  id: string
  question_id: string
  responder: string
  body: string
  created_at: string
}

function rowToQuestion(r: QuestionRow): Question {
  return { id: r.id, title: r.title, createdAt: new Date(r.created_at).getTime() }
}

function rowToAnswer(r: AnswerRow): Answer {
  return {
    id: r.id,
    questionId: r.question_id,
    responder: r.responder,
    body: r.body,
    createdAt: new Date(r.created_at).getTime(),
  }
}

async function fetchQuestionRows(): Promise<QuestionRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('qa_questions')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as QuestionRow[]) ?? []
}

async function fetchAnswerRows(): Promise<AnswerRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('qa_answers')
    .select('id, question_id, responder, body, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as AnswerRow[]) ?? []
}

function emptyAnswerForm() {
  return { responder: '', body: '' }
}

export function QAView() {
  const [query, setQuery] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [questionInput, setQuestionInput] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [answeringId, setAnsweringId] = useState<string | null>(null)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [answerForm, setAnswerForm] = useState(emptyAnswerForm)

  const { data: questionRows, mutate: refetchQuestions } =
    useRealtimeTable<QuestionRow>('qa_questions', fetchQuestionRows)
  const { data: answerRows, mutate: refetchAnswers } = useRealtimeTable<AnswerRow>(
    'qa_answers',
    fetchAnswerRows,
  )

  const questions: Question[] = useMemo(
    () => questionRows.map(rowToQuestion),
    [questionRows],
  )
  const answers: Answer[] = useMemo(
    () => answerRows.map(rowToAnswer),
    [answerRows],
  )

  const answersFor = useMemo(() => {
    const map = new Map<string, Answer[]>()
    for (const a of answers) {
      const list = map.get(a.questionId) ?? []
      list.push(a)
      map.set(a.questionId, list)
    }
    return map
  }, [answers])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return questions
    return questions.filter((qs) => qs.title.toLowerCase().includes(q))
  }, [questions, q])

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
    setAnsweringId(null)
    setManagingId(null)
    setAnswerForm(emptyAnswerForm())
  }

  function startAnswer(id: string) {
    setAnsweringId(id)
    setManagingId(null)
    setAnswerForm(emptyAnswerForm())
  }

  function startManage(id: string) {
    setManagingId(id)
    setAnsweringId(null)
    setAnswerForm(emptyAnswerForm())
  }

  async function submitQuestion() {
    const title = questionInput.trim()
    if (!title) return
    const supabase = createClient()
    await supabase.from('qa_questions').insert({ title })
    await refetchQuestions()
    setQuestionInput('')
    setAddingQuestion(false)
  }

  async function deleteQuestion(id: string) {
    const supabase = createClient()
    await supabase.from('qa_questions').delete().eq('id', id)
    await refetchQuestions()
    await refetchAnswers()
    if (expandedId === id) setExpandedId(null)
  }

  async function submitAnswer(questionId: string) {
    const responder = answerForm.responder.trim()
    const body = answerForm.body.trim()
    if (!responder || !body) return
    const supabase = createClient()
    await supabase
      .from('qa_answers')
      .insert({ question_id: questionId, responder, body })
    await refetchAnswers()
    setAnswerForm(emptyAnswerForm())
    setAnsweringId(null)
  }

  async function deleteAnswer(id: string) {
    const supabase = createClient()
    await supabase.from('qa_answers').delete().eq('id', id)
    await refetchAnswers()
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Q&amp;A</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            匿名で質問・回答できます。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAddingQuestion((v) => !v)
            setQuestionInput('')
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
        >
          {addingQuestion ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4" aria-hidden="true" />
          )}
          {addingQuestion ? '閉じる' : '質問を追加'}
        </button>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="質問文で検索"
          aria-label="質問を検索"
          className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
        />
      </div>

      {addingQuestion && (
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              質問内容
            </span>
            <textarea
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              rows={3}
              placeholder="質問を入力してください"
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <button
            type="button"
            onClick={submitQuestion}
            disabled={!questionInput.trim()}
            className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            質問する
          </button>
        </section>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
          {q ? '一致する質問はありません。' : 'まだ質問がありません。'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((question) => {
            const qAnswers = answersFor.get(question.id) ?? []
            const hasAnswers = qAnswers.length > 0
            const expanded = expandedId === question.id
            return (
              <li
                key={question.id}
                className="rounded-2xl border border-border bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(question.id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <MessageCircleQuestion
                        className="h-4.5 w-4.5"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="truncate text-base font-semibold text-foreground">
                      {question.title}
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {expanded && (
                  <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
                    {hasAnswers && managingId !== question.id && (
                      <ul className="flex flex-col gap-2.5">
                        {qAnswers.map((a) => (
                          <li
                            key={a.id}
                            className="rounded-xl border border-border/60 bg-background px-4 py-3"
                          >
                            <p className="mb-1 text-xs font-semibold text-primary">
                              {a.responder}
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                              {a.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}

                    {!hasAnswers && (
                      <p className="text-sm text-muted-foreground">
                        まだ回答がありません。
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => deleteQuestion(question.id)}
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        質問を削除
                      </button>
                      {hasAnswers ? (
                        <button
                          type="button"
                          onClick={() =>
                            managingId === question.id
                              ? setManagingId(null)
                              : startManage(question.id)
                          }
                          className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          {managingId === question.id ? '閉じる' : '編集'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            answeringId === question.id
                              ? setAnsweringId(null)
                              : startAnswer(question.id)
                          }
                          className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                          {answeringId === question.id ? '閉じる' : 'アンサー'}
                        </button>
                      )}
                    </div>

                    {managingId === question.id && (
                      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background px-4 py-4">
                        <p className="text-xs font-semibold text-muted-foreground">
                          回答の管理
                        </p>
                        <ul className="flex flex-col gap-2">
                          {qAnswers.map((a) => (
                            <li
                              key={a.id}
                              className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3"
                            >
                              <div className="min-w-0">
                                <p className="mb-0.5 text-xs font-semibold text-primary">
                                  {a.responder}
                                </p>
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                                  {a.body}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => deleteAnswer(a.id)}
                                aria-label={`${a.responder}の回答を削除`}
                                className="shrink-0 rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-destructive active:scale-90"
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>

                        {answeringId === question.id ? (
                          <div className="flex flex-col gap-2.5">
                            <input
                              type="text"
                              value={answerForm.responder}
                              onChange={(e) =>
                                setAnswerForm((p) => ({
                                  ...p,
                                  responder: e.target.value,
                                }))
                              }
                              placeholder="回答者名"
                              aria-label="回答者名"
                              className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                            />
                            <textarea
                              value={answerForm.body}
                              onChange={(e) =>
                                setAnswerForm((p) => ({
                                  ...p,
                                  body: e.target.value,
                                }))
                              }
                              rows={3}
                              placeholder="回答内容"
                              aria-label="回答内容"
                              className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                            />
                            <button
                              type="button"
                              onClick={() => submitAnswer(question.id)}
                              disabled={
                                !answerForm.responder.trim() ||
                                !answerForm.body.trim()
                              }
                              className="self-end rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
                            >
                              回答を追加
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startAnswer(question.id)}
                            className="flex items-center justify-center gap-1.5 self-start rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            回答を追加
                          </button>
                        )}
                      </div>
                    )}

                    {!hasAnswers && answeringId === question.id && (
                      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-background px-4 py-4">
                        <input
                          type="text"
                          value={answerForm.responder}
                          onChange={(e) =>
                            setAnswerForm((p) => ({
                              ...p,
                              responder: e.target.value,
                            }))
                          }
                          placeholder="回答者名"
                          aria-label="回答者名"
                          className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                        />
                        <textarea
                          value={answerForm.body}
                          onChange={(e) =>
                            setAnswerForm((p) => ({
                              ...p,
                              body: e.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="回答内容"
                          aria-label="回答内容"
                          className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
                        />
                        <button
                          type="button"
                          onClick={() => submitAnswer(question.id)}
                          disabled={
                            !answerForm.responder.trim() ||
                            !answerForm.body.trim()
                          }
                          className="self-end rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
                        >
                          回答する
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
