import Foundation

// 自己評価・目標設定シート: 項目0 (free answer), 項目1〜10 scored ◎3 ○2 △1 ×0
// by the driver, the driver's 上長 and the 社長, 目標4問・反省4問. The
// monthly template (questions, items, deadline) comes from the console.

public enum ReviewMark: Int, CaseIterable, Codable, Sendable {
    case excellent = 3, good = 2, half = 1, poor = 0

    public var symbol: String {
        switch self {
        case .excellent: "◎"
        case .good: "○"
        case .half: "△"
        case .poor: "×"
        }
    }

    public var label: String {
        switch self {
        case .excellent: "いつも完璧"
        case .good: "ほとんど完璧"
        case .half: "半分くらいは出来た"
        case .poor: "ほとんど出来ない"
        }
    }
}

public struct ReviewTemplate: Codable, Equatable, Sendable {
    public var purpose_question: String
    public var items: [String]
    public var goal_questions: [String]
    public var reflection_questions: [String]
    public var deadline_day: Int
}

public struct ReviewResult: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable { case pending, excluded, final }
    public var status: Status
    public var total: Int?
    public var allowance: Int?
}

public struct SelfReviewAnswers: Codable, Equatable, Sendable {
    public var vehicle_class: String?
    public var purpose: String
    public var self_scores: [Int]
    public var goals: [String]
    public var reflections: [String]
    public var missing_inspection_days: [LocalDate]
    public var submitted_at: String?
}

/// my_self_review(): the month, its template, my answers and (only) the total.
public struct MySelfReview: Codable, Equatable, Sendable {
    public var period: LocalDate
    public var deadline: LocalDate?
    public var is_open: Bool
    public var template: ReviewTemplate
    public var review: SelfReviewAnswers?
    public var result: ReviewResult

    /// "9月分"
    public var title: String { "\(period.month)月分" }
    /// 目標 is for the month after the reviewed one.
    public var goalTitle: String { "\(period.adding(days: 40).year)年\(period.adding(days: 40).month)月の目標" }
    public var reflectionTitle: String { "\(period.month)月の反省や良かった事" }
}

public struct SubordinateReview: Codable, Equatable, Identifiable, Sendable {
    public var user_id: String
    public var name: String
    public var vehicle_class: String?
    public var submitted_at: String?
    public var purpose: String?
    public var self_scores: [Int]?
    public var goals: [String]?
    public var reflections: [String]?
    public var my_scores: [Int]?
    public var scored_at: String?

    public var id: String { user_id }
}

public struct SubordinateReviews: Codable, Equatable, Sendable {
    public var period: LocalDate
    public var deadline: LocalDate
    public var is_open: Bool
    public var template: ReviewTemplate
    public var people: [SubordinateReview]
}

public enum SelfReviewRules {
    /// What's missing before the sheet can be sent, or nil.
    public static func problem(purpose: String, scores: [Int?], goals: [String], reflections: [String]) -> String? {
        if purpose.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "項目0を入力してください。" }
        if scores.count != 10 || scores.contains(where: { $0 == nil }) { return "項目1〜10をすべて採点してください。" }
        if goals.count != 4 || goals.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) { return "目標を4つとも入力してください。" }
        if reflections.count != 4 || reflections.contains(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) { return "反省や良かった事を4つとも入力してください。" }
        return nil
    }

    /// 出勤日 of the month without a 日常点検 record (「日常点検表の提出が無い」).
    public static func missingInspectionDays(period: LocalDate, workdays: Set<LocalDate>, inspected: Set<LocalDate>) -> [LocalDate] {
        workdays.filter { $0.year == period.year && $0.month == period.month && !inspected.contains($0) }.sorted()
    }

    public static func subtotal(_ scores: [Int?]) -> Int { scores.compactMap { $0 }.reduce(0, +) }
}
