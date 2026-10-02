import Foundation

// 初心者ノート (beginner_notes), ドライバー語録 (dictionary_terms) and Q&A
// (qa_questions / qa_answers). Ports of beginner-notes-view.tsx,
// driver-terms-view.tsx and qa-view.tsx.

private let japanese = Locale(identifier: "ja_JP")

private func jaLess(_ a: String, _ b: String) -> Bool {
    a.compare(b, locale: japanese) == .orderedAscending
}

public let uncategorizedLabel = "未分類"

private func categoryKey(_ raw: String) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespaces)
    return trimmed.isEmpty ? uncategorizedLabel : trimmed
}

// MARK: - 初心者ノート

public struct BeginnerNoteRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, title, body, category, image_paths, created_at"
    public static let maxImages = 6

    public var id: String
    public var title: String
    public var body: String
    public var category: String
    public var image_paths: [String]
    public var created_at: String

    public init(id: String, title: String, body: String = "", category: String = "", image_paths: [String] = [], created_at: String = "") {
        self.id = id
        self.title = title
        self.body = body
        self.category = category
        self.image_paths = image_paths
        self.created_at = created_at
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
        category = try c.decodeIfPresent(String.self, forKey: .category) ?? ""
        image_paths = try c.decodeIfPresent([String].self, forKey: .image_paths) ?? []
        created_at = try c.decodeIfPresent(String.self, forKey: .created_at) ?? ""
    }

    public var categoryLabel: String { categoryKey(category) }
    public var images: [AttachmentReference] { image_paths.compactMap { AttachmentReference(column: $0, bucket: .beginnerNotes) } }
}

public enum BeginnerNotes {
    /// Categories in Japanese order with their notes (newest first, as fetched).
    public static func byCategory(_ notes: [BeginnerNoteRow]) -> [(category: String, notes: [BeginnerNoteRow])] {
        Dictionary(grouping: notes, by: \.categoryLabel)
            .map { ($0.key, $0.value) }
            .sorted { jaLess($0.0, $1.0) }
    }

    /// How many more images may be attached.
    public static func remainingImageSlots(current: Int) -> Int {
        max(0, BeginnerNoteRow.maxImages - current)
    }

    /// Images dropped by an edit, to delete from storage after saving.
    public static func removedImages(previous: [String], next: [String]) -> [String] {
        previous.filter { !next.contains($0) }
    }
}

// MARK: - ドライバー語録

public struct DictionaryTermRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, category, term, reading, meaning, antonym, example"

    public var id: String
    public var category: String
    public var term: String
    public var reading: String
    public var meaning: String
    public var antonym: String
    public var example: String

    public var categoryLabel: String { categoryKey(category) }

    /// 50音順 key: the reading, or the term itself until a reading is filled in.
    var sortKey: String {
        let r = reading.trimmingCharacters(in: .whitespaces)
        return r.isEmpty ? term : r
    }
}

public struct DictionaryCategoryRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, sort_order"

    public var id: String
    public var name: String
    public var sort_order: Int
}

public struct DictionaryTermDraft: Equatable, Sendable {
    /// An existing category name, or nil when adding a new one.
    public var category: String?
    public var newCategory = ""
    public var term = ""
    public var reading = ""
    public var meaning = ""
    public var antonym = ""
    public var example = ""

    public init(category: String? = "") {
        self.category = category
    }

    public init(_ row: DictionaryTermRow) {
        self.init(category: row.category)
        term = row.term
        reading = row.reading
        meaning = row.meaning
        antonym = row.antonym
        example = row.example
    }

    public var finalCategory: String {
        (category ?? newCategory).trimmingCharacters(in: .whitespaces)
    }

    /// Needs a term and a category.
    public var canSave: Bool {
        !term.trimmingCharacters(in: .whitespaces).isEmpty && !finalCategory.isEmpty
    }
}

public enum DriverTerms {
    public static func kanaOrder(_ terms: [DictionaryTermRow]) -> [DictionaryTermRow] {
        terms.sorted { jaLess($0.sortKey, $1.sortKey) }
    }

    public static func byCategory(_ terms: [DictionaryTermRow]) -> [(category: String, terms: [DictionaryTermRow])] {
        Dictionary(grouping: terms, by: \.categoryLabel)
            .map { ($0.key, kanaOrder($0.value)) }
            .sorted { jaLess($0.0, $1.0) }
    }

    /// Kana-aware match on any field, in 50音順.
    public static func search(_ query: String, in terms: [DictionaryTermRow], using search: KanaSearch = .shared) -> [DictionaryTermRow]? {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return nil }
        return kanaOrder(terms).filter { t in
            [t.term, t.reading, t.meaning, t.antonym, t.example, t.category].contains { search.matches($0, query: q) }
        }
    }
}

// MARK: - Q&A

public struct QAQuestionRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, category, title, body, created_at"

    public var id: String
    public var category: String
    public var title: String
    public var body: String
    public var created_at: String

    public var categoryLabel: String { categoryKey(category) }
}

public struct QAAnswerRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, question_id, title, responder, body, created_at"

    public var id: String
    public var question_id: String
    public var title: String
    public var responder: String
    public var body: String
    public var created_at: String
}

public enum QuestionsAndAnswers {
    public static func categories(_ questions: [QAQuestionRow]) -> [(name: String, count: Int)] {
        Dictionary(grouping: questions, by: \.categoryLabel)
            .map { ($0.key, $0.value.count) }
            .sorted { jaLess($0.0, $1.0) }
    }

    /// Category suggestions for a new question (未分類 excluded).
    public static func categoryOptions(_ questions: [QAQuestionRow]) -> [String] {
        categories(questions).map(\.name).filter { $0 != uncategorizedLabel }
    }

    public static func questions(in category: String, _ questions: [QAQuestionRow]) -> [QAQuestionRow] {
        questions.filter { $0.categoryLabel == category }
    }

    public static func answers(for questionID: String, _ answers: [QAAnswerRow]) -> [QAAnswerRow] {
        answers.filter { $0.question_id == questionID }
    }

    public static func search(_ query: String, in questions: [QAQuestionRow], using search: KanaSearch = .shared) -> [QAQuestionRow]? {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return nil }
        return questions.filter { search.matches($0.title, query: q) || search.matches($0.category, query: q) || search.matches($0.body, query: q) }
    }

    /// Anonymous questions need a title; answers need a name and a body.
    public static func canAsk(title: String) -> Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    public static func canAnswer(responder: String, body: String) -> Bool {
        !responder.trimmingCharacters(in: .whitespaces).isEmpty && !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
