import Foundation

// 休暇申請 (休暇届): requests, the 有給 balance and the 担当者's board.

public enum LeaveCategory: String, Codable, CaseIterable, Sendable {
    case personal, condolence, hospital, other

    public var label: String {
        switch self {
        case .personal: "私用"
        case .condolence: "慶弔休暇"
        case .hospital: "通院"
        case .other: "その他"
        }
    }

    /// 通院は内容、その他は理由が必要.
    public var detailPrompt: String? {
        switch self {
        case .hospital: "通院の内容"
        case .other: "その他の理由"
        case .personal, .condolence: nil
        }
    }
}

public struct LeaveRequest: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var user_id: String?
    public var name: String?
    public var filed_on: LocalDate
    public var start_on: LocalDate
    public var end_on: LocalDate
    public var days: Int
    public var category: LeaveCategory
    public var detail: String
    public var paid: Bool
    public var confirmed_at: String?
    public var confirmed_by_name: String?
    public var withdrawn_at: String?

    public var status: LeaveStatus {
        if withdrawn_at != nil { return .withdrawn }
        return confirmed_at != nil ? .confirmed : .pending
    }

    public var isEditable: Bool { status == .pending }

    public var periodLabel: String {
        let start = "\(start_on.month)月\(start_on.day)日"
        return start_on == end_on ? start : "\(start)〜\(end_on.month)月\(end_on.day)日"
    }

    public var categoryLabel: String {
        detail.isEmpty ? category.label : "\(category.label)（\(detail)）"
    }

    public func covers(_ day: LocalDate) -> Bool { start_on <= day && day <= end_on }
}

public enum LeaveStatus: Sendable {
    case pending, confirmed, withdrawn

    public var label: String {
        switch self {
        case .pending: "担当者の確認待ち"
        case .confirmed: "確認済み"
        case .withdrawn: "取り下げ"
        }
    }
}

public struct PaidLeaveBalance: Codable, Equatable, Sendable {
    public struct Expiry: Codable, Equatable, Sendable {
        public var on: LocalDate
        public var days: Int
    }

    /// Left after every use, pending requests included.
    public var available: Int
    public var pending: Int
    /// Days no grant covered (shown to the office).
    public var over: Int
    public var next_expiry: Expiry?

    /// What a new request may still use.
    public var free: Int { max(0, available - over) }
}

public struct LeaveException: Codable, Equatable, Sendable {
    public var start_on: LocalDate
    public var end_on: LocalDate
    public var note: String
}

public struct MyLeave: Codable, Equatable, Sendable {
    public var notice_days: Int
    public var is_checker: Bool
    public var balance: PaidLeaveBalance
    public var requests: [LeaveRequest]
    public var exceptions: [LeaveException]

    /// 確認済み leave days (for 出勤簿・カレンダー).
    public var confirmedDays: Set<LocalDate> {
        var days = Set<LocalDate>()
        for request in requests where request.status == .confirmed {
            var day = request.start_on
            while day <= request.end_on {
                days.insert(day)
                day = day.adding(days: 1)
            }
        }
        return days
    }
}

public struct LeaveDayStatus: Codable, Equatable, Sendable {
    public var day: LocalDate
    public var taken: Int
    public var max_people: Int?

    public var isFull: Bool { max_people.map { taken >= $0 } ?? false }
}

public struct LeaveCheckerBoard: Codable, Equatable, Sendable {
    public struct Exception: Codable, Equatable, Identifiable, Sendable {
        public var id: String
        public var name: String
        public var start_on: LocalDate
        public var end_on: LocalDate
        public var note: String
        public var granted_by_name: String?
    }

    public struct Person: Codable, Equatable, Identifiable, Sendable {
        public var user_id: String
        public var name: String
        public var id: String { user_id }
    }

    public var requests: [LeaveRequest]
    public var exceptions: [Exception]
    public var people: [Person]
}

public enum LeaveRules {
    public static func days(from start: LocalDate, to end: LocalDate, calendar: Calendar = .current) -> Int {
        (calendar.dateComponents([.day], from: start.startDate(calendar: calendar), to: end.startDate(calendar: calendar)).day ?? 0) + 1
    }

    /// Why the app won't send it (before asking the server), or nil.
    public static func problem(start: LocalDate, end: LocalDate, today: LocalDate, noticeDays: Int, exceptions: [LeaveException],
                               category: LeaveCategory, detail: String, paid: Bool, freePaidDays: Int,
                               full: Set<LocalDate>, calendar: Calendar = .current) -> String? {
        if end < start { return "終わりの日は、始まりの日以降にしてください。" }
        if days(from: start, to: end, calendar: calendar) > 31 { return "一度に申請できるのは31日までです。" }
        if start < today { return "過ぎた日は申請できません。" }
        if category.detailPrompt != nil, detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "\(category.detailPrompt!)を入力してください。"
        }
        var day = start
        let deadline = today.adding(days: noticeDays, calendar: calendar)
        while day <= end {
            let covered = exceptions.contains { $0.start_on <= day && day <= $0.end_on }
            if !covered && day < deadline { return message("notice", noticeDays: noticeDays) }
            if !covered && full.contains(day) { return message("full", noticeDays: noticeDays) }
            day = day.adding(days: 1, calendar: calendar)
        }
        if paid && days(from: start, to: end, calendar: calendar) > freePaidDays { return message("paid", noticeDays: noticeDays) }
        return nil
    }

    /// The server's "leave:<code>" errors in Japanese.
    public static func message(_ code: String, noticeDays: Int = 7) -> String {
        switch code {
        case "notice": "\(noticeDays)日より先の日しか申請できません。直近のお休みは、事務所に問い合わせてください（担当者が許可すると申請できるようになります）。"
        case "full": "この日はお休みできる人数の上限に達しています。事務所に問い合わせてください（担当者が許可すると申請できるようになります）。"
        case "paid": "有給の残り日数が足りません。"
        case "overlap": "同じ日にほかの休暇申請があります。"
        case "past": "過ぎた日は申請できません。"
        case "detail": "内容（理由）を入力してください。"
        case "dates": "日付を確認してください（一度に31日まで）。"
        default: "申請できませんでした。通信状況を確認してください。"
        }
    }

    public static func code(fromError text: String) -> String? {
        guard let range = text.range(of: "leave:") else { return nil }
        return String(text[range.upperBound...].prefix { $0.isLetter })
    }
}
