'use client'

import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  FolderOpen,
  MessageCircleQuestion,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/lib/supabase/use-realtime-table'
import { ConfirmDeleteInline, DeleteIconButton } from './confirm-delete'
import { useSettings } from '@/lib/settings/settings-context'
import { useScrollToTop } from '@/lib/use-scroll-to-top'

const UNSET_CATEGORY = '未分類'

type Question = {
  id: string
  category: string
  title: string
  body: string
  createdAt: number
}
type Answer = {
  id: string
  questionId: string
  title: string
  responder: string
  body: string
  createdAt: number
}

// Shared across every browser via the `qa_questions` / `qa_answers` tables.
type QuestionRow = {
  id: string
  category: string
  title: string
  body: string
  created_at: string
}
type AnswerRow = {
  id: string
  question_id: string
  title: string
  responder: string
  body: string
  created_at: string
}

function rowToQuestion(r: QuestionRow): Question {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    body: r.body,
    createdAt: new Date(r.created_at).getTime(),
  }
}

function rowToAnswer(r: AnswerRow): Answer {
  return {
    id: r.id,
    questionId: r.question_id,
    title: r.title,
    responder: r.responder,
    body: r.body,
    createdAt: new Date(r.created_at).getTime(),
  }
}

async function fetchQuestionRows(): Promise<QuestionRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('qa_questions')
    .select('id, category, title, body, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as QuestionRow[]) ?? []
}

async function fetchAnswerRows(): Promise<AnswerRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('qa_answers')
    .select('id, question_id, title, responder, body, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as AnswerRow[]) ?? []
}

function emptyQuestionForm() {
  return { category: '', title: '', body: '' }
}

function emptyAnswerForm() {
  return { title: '', responder: '', body: '' }
}

type Level = 'categories' | 'titles' | 'detail'

export function QAView() {
  const { partTimeMode } = useSettings()
  const [level, setLevel] = useState<Level>('categories')
  useScrollToTop([level])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    null,
  )
  const [query, setQuery] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm)
  const [answering, setAnswering] = useState(false)
  const [answerForm, setAnswerForm] = useState(emptyAnswerForm)
  const [confirmDeleteQuestion, setConfirmDeleteQuestion] = useState(false)
  const [confirmDeleteAnswerId, setConfirmDeleteAnswerId] = useState<
    string | null
  >(null)

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

  const categories = useMemo(() => {
    const map = new Map<string, number>()
    for (const qs of questions) {
      const cat = qs.category.trim() || UNSET_CATEGORY
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [questions])

  const categoryOptions = useMemo(
    () => categories.map((c) => c.name).filter((c) => c !== UNSET_CATEGORY),
    [categories],
  )

  const q = query.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!q) return null
    return questions.filter(
      (qs) =>
        qs.title.toLowerCase().includes(q) ||
        qs.category.toLowerCase().includes(q) ||
        qs.body.toLowerCase().includes(q),
    )
  }, [questions, q])

  const titlesInCategory = useMemo(() => {
    if (!activeCategory) return []
    return questions.filter(
      (qs) => (qs.category.trim() || UNSET_CATEGORY) === activeCategory,
    )
  }, [questions, activeCategory])

  const activeQuestion =
    questions.find((qs) => qs.id === activeQuestionId) ?? null
  const activeAnswers = activeQuestionId
    ? answersFor.get(activeQuestionId) ?? []
    : []

  function openCategory(name: string) {
    setActiveCategory(name)
    setLevel('titles')
  }

  function openQuestion(id: string) {
    setActiveQuestionId(id)
    setConfirmDeleteQuestion(false)
    setAnswering(false)
    setAnswerForm(emptyAnswerForm())
    setLevel('detail')
  }

  function backToCategories() {
    setLevel('categories')
    setActiveCategory(null)
    setActiveQuestionId(null)
  }

  function backToTitles() {
    setLevel('titles')
    setActiveQuestionId(null)
    setConfirmDeleteQuestion(false)
  }

  async function submitQuestion() {
    const title = questionForm.title.trim()
    const body = questionForm.body.trim()
    if (!title) return
    const supabase = createClient()
    await supabase.from('qa_questions').insert({
      title,
      body,
      category: questionForm.category.trim(),
    })
    await refetchQuestions()
    setQuestionForm(emptyQuestionForm())
    setAddingQuestion(false)
  }

  async function deleteQuestion(id: string) {
    const supabase = createClient()
    await supabase.from('qa_questions').delete().eq('id', id)
    await refetchQuestions()
    await refetchAnswers()
    setConfirmDeleteQuestion(false)
    backToTitles()
  }

  async function submitAnswer(questionId: string) {
    const responder = answerForm.responder.trim()
    const body = answerForm.body.trim()
    const title = answerForm.title.trim()
    if (!responder || !body) return
    const supabase = createClient()
    await supabase
      .from('qa_answers')
      .insert({ question_id: questionId, title, responder, body })
    await refetchAnswers()
    setAnswerForm(emptyAnswerForm())
    setAnswering(false)
  }

  async function deleteAnswer(id: string) {
    const supabase = createClient()
    await supabase.from('qa_answers').delete().eq('id', id)
    await refetchAnswers()
    setConfirmDeleteAnswerId(null)
  }

  const showingSearch = q.length > 0 && level === 'categories'

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Q&amp;A</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            匿名で質問できます。回答には名前が必要です。
          </p>
        </div>
        {level === 'categories' && !partTimeMode && (
          <button
            type="button"
            onClick={() => {
              setAddingQuestion((v) => !v)
              setQuestionForm(emptyQuestionForm())
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95"
          >
            {addingQuestion ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            {addingQuestion ? '閉じ���' : '質問を追加'}
          </button>
        )}
      </div>

      {level !== 'categories' && (
        <button
          type="button"
          onClick={level === 'detail' ? backToTitles : backToCategories}
          className="flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {level === 'detail' ? activeCategory : 'カテゴリーへ戻る'}
        </button>
      )}

      {level === 'categories' && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="質問文・カテゴリーで検索"
            aria-label="質問を検索"
            className="w-full rounded-2xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
          />
        </div>
      )}

      {!partTimeMode && addingQuestion && level === 'categories' && (
        <section className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-5 py-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              カテゴリー
            </span>
            <input
              type="text"
              list="qa-category-options"
              value={questionForm.category}
              onChange={(e) =>
                setQuestionForm((p) => ({ ...p, category: e.target.value }))
              }
              placeholder="例：AA・LOL・車両 など"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
            <datalist id="qa-category-options">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              質問タイトル
            </span>
            <input
              type="text"
              value={questionForm.title}
              onChange={(e) =>
                setQuestionForm((p) => ({ ...p, title: e.target.value }))
              }
              placeholder="一覧に表示される短い見出し"
              className="w-full rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              質問内容
            </span>
            <textarea
              value={questionForm.body}
              onChange={(e) =>
                setQuestionForm((p) => ({ ...p, body: e.target.value }))
              }
              rows={3}
              placeholder="質問の詳細を入力してください（匿名で投稿されます）"
              className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          <button
            type="button"
            onClick={submitQuestion}
            disabled={!questionForm.title.trim()}
            className="self-end rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            質問する
          </button>
        </section>
      )}

      {/* Search results override the category list while a search is active. */}
      {showingSearch ? (
        searchResults && searchResults.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {searchResults.map((question) => (
              <li key={question.id}>
                <button
                  type="button"
                  onClick={() => openQuestion(question.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="w-fit truncate rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {question.category.trim() || UNSET_CATEGORY}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">
                      {question.title}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
            一致する質問はありません。
          </p>
        )
      ) : null}

      {/* Level 1: categories */}
      {level === 'categories' && !showingSearch && (
        <>
          {categories.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
              まだ質問がありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {categories.map(({ name, count }) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => openCategory(name)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:border-primary/60 hover:bg-accent active:scale-[0.99]"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <FolderOpen className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="flex flex-col">
                        <span className="text-base font-semibold text-foreground">
                          {name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          質問 {count}件
                        </span>
                      </span>
                    </span>
                    <ChevronRight
                      className="h-5 w-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Level 2: question titles within a category */}
      {level === 'titles' && (
        <ul className="flex flex-col gap-2.5">
          {titlesInCategory.map((question) => {
            const count = (answersFor.get(question.id) ?? []).length
            return (
              <li key={question.id}>
                <button
                  type="button"
                  onClick={() => openQuestion(question.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-accent active:scale-[0.99]"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <MessageCircleQuestion
                        className="h-4.5 w-4.5"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {question.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {count > 0 ? `回答 ${count}件` : '未回答'}
                      </span>
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Level 3: question detail + answers */}
      {level === 'detail' && activeQuestion && (
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-border bg-card px-5 py-4">
            <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {activeQuestion.category.trim() || UNSET_CATEGORY}
            </span>
            <h3 className="mt-2 text-base font-bold text-foreground">
              {activeQuestion.title}
            </h3>
            {activeQuestion.body && (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {activeQuestion.body}
              </p>
            )}

            {!partTimeMode && (
              <div className="mt-3 flex justify-end">
                {confirmDeleteQuestion ? (
                  <ConfirmDeleteInline
                    message="この質問と回答をすべて削除しますか？"
                    onConfirm={() => deleteQuestion(activeQuestion.id)}
                    onCancel={() => setConfirmDeleteQuestion(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteQuestion(true)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-destructive"
                  >
                    質問を削除
                  </button>
                )}
              </div>
            )}
          </section>

          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-foreground">
              アンサー {activeAnswers.length > 0 && `(${activeAnswers.length})`}
            </h4>
            {!partTimeMode && (
              <button
                type="button"
                onClick={() => {
                  setAnswering((v) => !v)
                  setAnswerForm(emptyAnswerForm())
                }}
                className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {answering ? (
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {answering ? '閉じる' : '回答を追加'}
              </button>
            )}
          </div>

          {!partTimeMode && answering && (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-border/60 bg-background px-4 py-4">
              <textarea
                value={answerForm.body}
                onChange={(e) =>
                  setAnswerForm((p) => ({ ...p, body: e.target.value }))
                }
                rows={3}
                placeholder="回答内容"
                aria-label="回答内容"
                className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <input
                type="text"
                value={answerForm.responder}
                onChange={(e) =>
                  setAnswerForm((p) => ({
                    ...p,
                    responder: e.target.value,
                  }))
                }
                placeholder="回答者名（必須）"
                aria-label="回答者名"
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              <button
                type="button"
                onClick={() => submitAnswer(activeQuestion.id)}
                disabled={
                  !answerForm.responder.trim() || !answerForm.body.trim()
                }
                className="self-end rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-40"
              >
                回答する
              </button>
            </div>
          )}

          {activeAnswers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              まだ回答がありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {activeAnswers.map((a) => (
                <li
                  key={a.id}
                  className="rounded-xl border border-border/60 bg-card px-4 py-3"
                >
                  {a.title && (
                    <p className="text-sm font-semibold text-foreground">
                      {a.title}
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {a.body}
                  </p>
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <span className="text-xs font-semibold text-primary">
                      {a.responder}
                    </span>
                    {!partTimeMode && (
                      <DeleteIconButton
                        onClick={() => setConfirmDeleteAnswerId(a.id)}
                        label={`${a.responder}の回答を削除`}
                      />
                    )}
                  </div>
                  {!partTimeMode && confirmDeleteAnswerId === a.id && (
                    <div className="mt-2">
                      <ConfirmDeleteInline
                        onConfirm={() => deleteAnswer(a.id)}
                        onCancel={() => setConfirmDeleteAnswerId(null)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
