// アプリ内編集: the content tables the app shows, described once so a single
// editor can list, add, edit, reorder and delete them. Server actions only
// ever touch tables and columns named here.

export type FieldType =
  | 'text' | 'textarea' | 'markup' | 'number' | 'date' | 'select' | 'weekday'
  | 'minutes' | 'tags' | 'ref' | 'readonly'
  /** LoL: 7 cells (日〜土) of "" / "〇" (24h) / "H:MM〜H:MM". */
  | 'week'
  /** LoL 荷扱車格可否: { trailer|fiveLoad|compact|loader: { status, condition } }. */
  | 'vehicles'
  /** LoL 訪問者: [{ id, name }]. */
  | 'visitors'
  /** Storage paths in a bucket (uploaded from the browser). */
  | 'images'

export type Field = {
  key: string
  label: string
  type: FieldType
  required?: boolean
  /** Shown as a column in the list. */
  list?: boolean
  options?: readonly (readonly [string, string])[]
  /** ref: rows of another table of the same section as options. */
  ref?: { table: string; value: string; label: string }
  help?: string
  placeholder?: string
  /** images: the storage bucket. */
  bucket?: string
}

export type TableDef = {
  table: string
  label: string
  idType: 'uuid' | 'text'
  fields: Field[]
  order: [string, boolean][]
  /** Has sort_order (↑↓ buttons and new rows go last). */
  sortable?: boolean
  canCreate?: boolean
  canDelete?: boolean
  /** Column used as the row's name in the audit log. */
  title: string
  /** Only these ids are shown (fixed rows like 確認メッセージ). */
  ids?: string[]
  /** Columns a new row needs that the form doesn't edit. */
  insertDefaults?: Record<string, unknown>
  note?: string
}

export type Section = { slug: string; title: string; description: string; tables: TableDef[] }

export const VEHICLE_KINDS = [['trailer', 'トレーラー'], ['fiveLoad', '5積み'], ['compact', '小型'], ['loader', 'ローダー']] as const
export const VEHICLE_STATUSES = [['', '未設定'], ['〇', '〇'], ['条件あり', '△(条件あり)'], ['✕', '✕']] as const
/** 0:00〜24:00 hourly plus セリ終了後 (the app's AA calendar options). */
export const CALENDAR_TIMES = [...Array.from({ length: 25 }, (_, h) => `${h}:00`), 'セリ終了後']
const WEEK_CELL = /^((\d{1,2}:\d{2}|セリ終了後)?〜(\d{1,2}:\d{2}|セリ終了後)?|〇|)$/

export const WEEKDAYS = [['0', '日曜'], ['1', '月曜'], ['2', '火曜'], ['3', '水曜'], ['4', '木曜'], ['5', '金曜'], ['6', '土曜']] as const
const LOL_DESTINATIONS = [['ippan', '一般'], ['aa', 'AA'], ['kokunaisen', '国内船'], ['yushutsu', '輸出'], ['nx', 'NX'], ['nagoya', '名古屋']] as const
const TIMER_TYPES = [['continuous', '連続走行時間'], ['break', '累計休憩時間（30分）'], ['driving', '運行時間（出庫から）']] as const
const MARKUP_HELP = '**太字**　;;赤字;;　::オレンジ::　##緑##'

export const SECTIONS: Section[] = [
  {
    slug: 'news', title: 'おしらせ', description: 'アプリの「おしらせ」タブの投稿です。新しい投稿はアプリに通知されます（通知を許可している端末）。',
    tables: [{
      table: 'news_posts', label: 'おしらせ', idType: 'uuid', title: 'title', canCreate: true, canDelete: true,
      order: [['created_at', false]],
      fields: [
        { key: 'title', label: 'タイトル', type: 'text', required: true, list: true },
        { key: 'category', label: 'カテゴリー', type: 'text', list: true, placeholder: '例：アプリ・その他' },
        { key: 'author', label: '投稿者', type: 'text', list: true, placeholder: '例：事務所' },
        { key: 'content', label: '本文', type: 'markup', required: true, help: MARKUP_HELP },
      ],
    }],
  },
  {
    slug: 'staff', title: '出勤簿（社員）', description: '出勤簿に並ぶ社員とヤード管理者です。出勤中／退勤済みの切り替えはアプリで行います。',
    tables: [
      {
        table: 'staff_members', label: '社員', idType: 'uuid', title: 'name', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true], ['created_at', true]],
        fields: [
          { key: 'name', label: '名前', type: 'text', required: true, list: true },
          { key: 'role', label: '役割', type: 'text', list: true, placeholder: '例：ドライバー' },
          { key: 'vehicle_class', label: '車格', type: 'text', list: true, placeholder: '例：トレーラー' },
          { key: 'hire_date', label: '入社日', type: 'date', list: true },
          { key: 'comment', label: 'コメント', type: 'text' },
        ],
        note: 'アプリのアカウントとの紐付けは「アカウント」で行います。',
      },
      {
        table: 'yard_managers', label: 'ヤード管理者', idType: 'uuid', title: 'name', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true], ['created_at', true]],
        fields: [
          { key: 'name', label: '名前', type: 'text', required: true, list: true },
          { key: 'employment_type', label: '雇用形態', type: 'select', options: [['regular', '正社員'], ['parttime', 'アルバイト']], required: true, list: true },
          { key: 'comment', label: 'コメント', type: 'text' },
        ],
      },
    ],
  },
  {
    slug: 'yard', title: 'ヤード配置', description: 'ヤード配置の画面に出るヤード・列・行き先です。',
    tables: [
      {
        table: 'yards', label: 'ヤード', idType: 'uuid', title: 'name', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true]],
        fields: [{ key: 'name', label: 'ヤード名', type: 'text', required: true, list: true }],
      },
      {
        table: 'yard_rows', label: '列', idType: 'uuid', title: 'label', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true]],
        fields: [
          { key: 'yard_id', label: 'ヤード', type: 'ref', ref: { table: 'yards', value: 'id', label: 'name' }, required: true, list: true },
          { key: 'label', label: '列の名前', type: 'text', required: true, list: true },
          { key: 'destinations', label: '行き先（1行に1つ）', type: 'tags', list: true },
        ],
      },
      {
        table: 'yard_destinations', label: '行き先の候補', idType: 'uuid', title: 'name', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true]],
        fields: [{ key: 'name', label: '行き先', type: 'text', required: true, list: true }],
      },
      {
        table: 'yard_destination_titles', label: '行き先の見出し', idType: 'uuid', title: 'title', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true]],
        fields: [{ key: 'title', label: '見出し', type: 'text', required: true, list: true }],
      },
      {
        table: 'yard_destination_stores', label: '見出しごとの店舗', idType: 'uuid', title: 'name', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true]],
        fields: [
          { key: 'title_id', label: '見出し', type: 'ref', ref: { table: 'yard_destination_titles', value: 'id', label: 'title' }, required: true, list: true },
          { key: 'name', label: '店舗', type: 'text', required: true, list: true },
        ],
      },
    ],
  },
  {
    slug: 'lol', title: 'LoL・LoL MAP', description: '行き先ごとの店舗情報（List of Location）です。荷扱車格可否、搬入・搬出カレンダー（AA）、行ったことがある人も編集できます。',
    tables: [{
      table: 'lol_entries', label: '店舗', idType: 'uuid', title: 'shop_name', canCreate: true, canDelete: true, sortable: true,
      order: [['destination_id', true], ['sort_order', true]],
      fields: [
        { key: 'destination_id', label: '行き先', type: 'select', options: LOL_DESTINATIONS, required: true, list: true },
        { key: 'shop_name', label: '店舗名', type: 'text', required: true, list: true },
        { key: 'address', label: '住所', type: 'text', list: true },
        { key: 'phone', label: '電話', type: 'text', list: true },
        { key: 'hours', label: '営業時間', type: 'text' },
        { key: 'break_time', label: '休憩時間', type: 'text' },
        { key: 'place', label: '場所', type: 'text' },
        { key: 'event_day', label: '開催日', type: 'text' },
        { key: 'exit_method', label: '搬出方法', type: 'textarea' },
        { key: 'method', label: '搬入方法', type: 'textarea' },
        { key: 'memo', label: 'メモ', type: 'textarea' },
        { key: 'notes', label: '注意事項', type: 'textarea' },
        { key: 'vehicle_permission', label: '荷扱車格可否', type: 'vehicles' },
        { key: 'cal_out', label: '搬出カレンダー（AAの店舗で表示）', type: 'week' },
        { key: 'cal_in', label: '搬入カレンダー（AAの店舗で表示）', type: 'week' },
        { key: 'visited_by', label: '行ったことがある人', type: 'visitors' },
      ],
    }],
  },
  {
    slug: 'aa', title: 'オークション情報', description: '曜日ごとのオークション会場と締切時間です。',
    tables: [
      {
        table: 'aa_venues', label: '曜日ごとの会場', idType: 'uuid', title: 'venue_name', canCreate: true, canDelete: true, sortable: true,
        order: [['weekday', true], ['sort_order', true]],
        fields: [
          { key: 'weekday', label: '曜日', type: 'weekday', required: true, list: true },
          { key: 'venue_name', label: '会場', type: 'text', required: true, list: true },
        ],
      },
      {
        table: 'aa_deadlines', label: '締切', idType: 'uuid', title: 'venue_name', canCreate: true, canDelete: true, sortable: true,
        order: [['weekday', true], ['sort_order', true]],
        fields: [
          { key: 'weekday', label: '曜日', type: 'weekday', required: true, list: true },
          { key: 'venue_name', label: '会場', type: 'text', required: true, list: true },
          { key: 'deadline_time', label: '締切時間', type: 'text', list: true, placeholder: '例：12:00' },
        ],
      },
    ],
  },
  {
    slug: 'cars', title: '高額車', description: '積み込み時に注意が必要な高額車の一覧です。',
    tables: [{
      table: 'high_value_cars', label: '高額車', idType: 'uuid', title: 'model_name', canCreate: true, canDelete: true,
      order: [['maker', true], ['model_name', true]],
      fields: [
        { key: 'maker', label: 'メーカー', type: 'text', required: true, list: true },
        { key: 'model_name', label: '車名', type: 'text', required: true, list: true },
        { key: 'model_code', label: '型式', type: 'text', list: true },
        { key: 'memo', label: 'メモ', type: 'textarea', list: true },
      ],
    }],
  },
  {
    slug: 'emergency', title: '緊急連絡先', description: '緊急連絡先の一覧と、画面下の共有メモです。',
    tables: [
      {
        table: 'emergency_contacts', label: '連絡先', idType: 'uuid', title: 'name', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true]],
        fields: [
          { key: 'name', label: '名前', type: 'text', required: true, list: true },
          { key: 'phone', label: '電話番号', type: 'text', list: true },
          { key: 'hours', label: '受付時間', type: 'text', list: true },
          { key: 'summary', label: '概要', type: 'textarea' },
        ],
      },
      {
        table: 'emergency_contacts_memo', label: '共有メモ', idType: 'text', title: 'id', ids: ['current'],
        order: [['id', true]],
        fields: [{ key: 'content', label: 'メモ', type: 'markup', list: true, help: MARKUP_HELP }],
      },
    ],
  },
  {
    slug: 'notes', title: '初心者ノート', description: '初心者ノートの記事です。画像も追加・削除できます。',
    tables: [{
      table: 'beginner_notes', label: '記事', idType: 'uuid', title: 'title', canCreate: true, canDelete: true,
      order: [['created_at', false]],
      fields: [
        { key: 'title', label: 'タイトル', type: 'text', required: true, list: true },
        { key: 'category', label: 'カテゴリー', type: 'text', list: true },
        { key: 'body', label: '本文', type: 'markup', help: MARKUP_HELP },
        { key: 'image_paths', label: '画像', type: 'images', bucket: 'beginner-notes', list: true },
      ],
    }],
  },
  {
    slug: 'terms', title: 'ドライバー語録', description: 'ドライバー語録の分類と用語です。',
    tables: [
      {
        table: 'dictionary_categories', label: '分類', idType: 'uuid', title: 'name', canCreate: true, canDelete: true, sortable: true,
        order: [['sort_order', true]],
        fields: [{ key: 'name', label: '分類名', type: 'text', required: true, list: true }],
      },
      {
        table: 'dictionary_terms', label: '用語', idType: 'uuid', title: 'term', canCreate: true, canDelete: true,
        order: [['category', true], ['reading', true]],
        fields: [
          { key: 'category', label: '分類', type: 'ref', ref: { table: 'dictionary_categories', value: 'name', label: 'name' }, required: true, list: true },
          { key: 'term', label: '用語', type: 'text', required: true, list: true },
          { key: 'reading', label: 'よみ', type: 'text', list: true },
          { key: 'meaning', label: '意味', type: 'textarea', required: true, list: true },
          { key: 'antonym', label: '対義語', type: 'text' },
          { key: 'example', label: '例文', type: 'textarea' },
        ],
      },
    ],
  },
  {
    slug: 'qa', title: 'Q&A', description: 'よくある質問と回答です。',
    tables: [
      {
        table: 'qa_questions', label: '質問', idType: 'uuid', title: 'title', canCreate: true, canDelete: true,
        order: [['created_at', false]],
        fields: [
          { key: 'category', label: 'カテゴリー', type: 'text', list: true, placeholder: '例：車両・AA・事故処理' },
          { key: 'title', label: '質問', type: 'text', required: true, list: true },
          { key: 'body', label: '詳しく', type: 'textarea' },
        ],
        note: '質問を削除すると、その回答も削除されます。',
      },
      {
        table: 'qa_answers', label: '回答', idType: 'uuid', title: 'title', canCreate: true, canDelete: true,
        order: [['created_at', true]],
        fields: [
          { key: 'question_id', label: '質問', type: 'ref', ref: { table: 'qa_questions', value: 'id', label: 'title' }, required: true, list: true },
          { key: 'title', label: '回答の見出し', type: 'text', list: true },
          { key: 'responder', label: '回答者', type: 'text', list: true },
          { key: 'body', label: '回答', type: 'textarea', required: true },
        ],
      },
    ],
  },
  {
    slug: 'goal', title: '今月の目標', description: 'ホーム（乗務員）とタイムカードに出る今月の目標です。「来月の目標」を入れておくと、月が変わったときに自動で切り替わります。',
    tables: [{
      table: 'weekly_goal', label: '目標', idType: 'text', title: 'title', ids: ['current', 'timecard'],
      order: [['id', true]],
      fields: [
        { key: 'id', label: '表示場所', type: 'readonly', list: true },
        { key: 'title', label: '見出し', type: 'text', required: true, list: true },
        { key: 'content', label: '今月の目標', type: 'markup', list: true, help: MARKUP_HELP },
        { key: 'next_content', label: '来月の目標（月が変わると自動で切り替え）', type: 'markup', help: MARKUP_HELP },
      ],
    }],
  },
  {
    slug: 'messages', title: '確認メッセージ', description: '出庫・帰庫などのボタンを押したときに出る確認の文言です。',
    tables: [{
      table: 'confirm_action_messages', label: '確認メッセージ', idType: 'text', title: 'label',
      order: [['id', true]],
      fields: [
        { key: 'label', label: '場面', type: 'readonly', list: true },
        { key: 'message', label: 'メッセージ', type: 'markup', required: true, list: true, help: MARKUP_HELP },
        { key: 'confirm_label', label: '確定ボタン', type: 'text', list: true, placeholder: '空欄＝「開始する」' },
        { key: 'cancel_label', label: 'キャンセルボタン', type: 'text', placeholder: '空欄＝「キャンセル」' },
      ],
    }],
  },
  {
    slug: 'notifications', title: '通知のルール', description: '運行状況のタイマーが一定時間を超えたときに出す通知です。',
    tables: [{
      table: 'push_notification_rules', label: '通知', idType: 'uuid', title: 'title', canCreate: true, canDelete: true,
      order: [['timer_type', true], ['threshold_ms', true]],
      fields: [
        { key: 'timer_type', label: 'タイマー', type: 'select', options: TIMER_TYPES, required: true, list: true },
        { key: 'threshold_ms', label: '経過時間（分）', type: 'minutes', required: true, list: true },
        { key: 'title', label: 'タイトル', type: 'text', required: true, list: true },
        { key: 'message', label: '本文', type: 'markup', required: true, list: true, help: MARKUP_HELP },
      ],
    }],
  },
]

/** Tables with an updated_at column (set on every save). */
export const HAS_UPDATED_AT = new Set(['news_posts', 'staff_members', 'yards', 'yard_rows', 'yard_destinations', 'lol_entries', 'high_value_cars', 'emergency_contacts', 'emergency_contacts_memo', 'beginner_notes', 'dictionary_terms', 'weekly_goal', 'confirm_action_messages'])

export function findTable(slug: string, table: string): { section: Section; def: TableDef } | null {
  const section = SECTIONS.find((s) => s.slug === slug)
  const def = section?.tables.find((t) => t.table === table)
  return section && def ? { section, def } : null
}

/** Form values → a row for the table, or a Japanese error. Only defined, editable columns. */
export function rowFromForm(def: TableDef, get: (key: string) => string | null): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {}
  for (const field of def.fields) {
    if (field.type === 'readonly') continue
    const raw = (get(field.key) ?? '').replace(/\r\n/g, '\n')
    const text = field.type === 'markup' || field.type === 'textarea' ? raw.trimEnd() : raw.trim()
    if (field.required && !text.trim()) return { error: `「${field.label}」を入力してください。` }
    switch (field.type) {
      case 'number':
      case 'weekday': {
        if (!text) { row[field.key] = field.type === 'weekday' ? 0 : null; break }
        const n = Number(text)
        if (!Number.isInteger(n) || (field.type === 'weekday' && (n < 0 || n > 6))) return { error: `「${field.label}」を正しく入力してください。` }
        row[field.key] = n
        break
      }
      case 'minutes': {
        const n = Number(text)
        if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) return { error: `「${field.label}」は1〜1440分で入力してください。` }
        row[field.key] = Math.round(n * 60_000)
        break
      }
      case 'date':
        if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: `「${field.label}」を正しく入力してください。` }
        row[field.key] = text || null
        break
      case 'tags':
        row[field.key] = text.split(/[\n,、]/).map((s) => s.trim()).filter(Boolean)
        break
      case 'select':
        if (text && !field.options?.some(([v]) => v === text)) return { error: `「${field.label}」を選んでください。` }
        row[field.key] = text || null
        break
      case 'ref':
        row[field.key] = text || null
        break
      case 'week': {
        const week = parseJSON(raw, ['', '', '', '', '', '', ''])
        if (!Array.isArray(week) || week.length !== 7 || !week.every((c) => typeof c === 'string' && WEEK_CELL.test(c.trim()))) {
          return { error: `「${field.label}」を確認してください。` }
        }
        row[field.key] = week.map((c: string) => (c.trim() === '〜' ? '' : c.trim()))
        break
      }
      case 'vehicles': {
        const value = parseJSON(raw, {}) as Record<string, { status?: string; condition?: string }>
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return { error: `「${field.label}」を確認してください。` }
        const out: Record<string, { status: string; condition: string }> = {}
        for (const [kind] of VEHICLE_KINDS) {
          const status = String(value[kind]?.status ?? '')
          if (!VEHICLE_STATUSES.some(([v]) => v === status)) return { error: `「${field.label}」を確認してください。` }
          out[kind] = { status, condition: status === '条件あり' ? String(value[kind]?.condition ?? '').trim() : '' }
        }
        row[field.key] = out
        break
      }
      case 'visitors': {
        const list = parseJSON(raw, [])
        if (!Array.isArray(list)) return { error: `「${field.label}」を確認してください。` }
        row[field.key] = list
          .filter((p) => p && typeof p.name === 'string' && p.name.trim())
          .map((p) => ({ id: typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID(), name: p.name.trim() }))
        break
      }
      case 'images': {
        const paths = parseJSON(raw, [])
        if (!Array.isArray(paths) || !paths.every((p) => typeof p === 'string' && p && !p.includes('..'))) return { error: `「${field.label}」を確認してください。` }
        row[field.key] = paths
        break
      }
      default:
        row[field.key] = text
    }
  }
  return { row }
}

function parseJSON(raw: string, fallback: unknown): unknown {
  if (!raw.trim()) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** A cell for the list. */
export function displayValue(field: Field, value: unknown, refLabels?: Map<string, string>): string {
  if (value === null || value === undefined || value === '') return ''
  switch (field.type) {
    case 'weekday': return WEEKDAYS.find(([v]) => v === String(value))?.[1] ?? String(value)
    case 'select': return field.options?.find(([v]) => v === value)?.[1] ?? String(value)
    case 'minutes': return `${Number(value) / 60_000}分`
    case 'tags': return Array.isArray(value) ? value.join('、') : String(value)
    case 'ref': return refLabels?.get(String(value)) ?? String(value)
    case 'readonly': return String(value)
    case 'images': return Array.isArray(value) && value.length ? `${value.length}枚` : ''
    case 'week': return Array.isArray(value) && value.some((c) => c) ? '設定あり' : ''
    case 'visitors': return Array.isArray(value) ? value.map((p) => p.name).join('、') : ''
    case 'vehicles': return VEHICLE_KINDS.map(([k, l]) => {
      const status = (value as Record<string, { status?: string }>)[k]?.status
      return status ? `${l}${status === '条件あり' ? '△' : status}` : ''
    }).filter(Boolean).join(' ')
    default: return String(value)
  }
}
