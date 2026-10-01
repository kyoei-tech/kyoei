import Foundation

// 出勤簿: staff_members + yard_managers. Port of the data rules inside
// components/staff-attendance-view.tsx.

public enum StaffStatus: String, Codable, Sendable {
    case working, off

    public var label: String { self == .working ? "出勤中" : "退勤済み" }
    public var toggled: StaffStatus { self == .working ? .off : .working }
}

public struct StaffMemberRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, role, vehicle_class, status, sort_order, hire_date, comment"

    public var id: String
    public var name: String
    public var role: String
    public var vehicle_class: String
    public var status: StaffStatus
    public var sort_order: Int
    public var hire_date: String?
    public var comment: String?

    public var hireDate: LocalDate? { hire_date.flatMap(LocalDate.init(iso:)) }

    /// "役職 / 担当車格", or "—" when both are empty.
    public var subtitle: String {
        let parts = [role, vehicle_class].map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return parts.isEmpty ? "—" : parts.joined(separator: " / ")
    }
}

public enum EmploymentType: String, Codable, CaseIterable, Sendable {
    case regular, parttime

    public var label: String { self == .regular ? "正社員" : "アルバイト" }
}

/// Today's ヤード管理者 — anyone on duty, not necessarily a registered employee.
public struct YardManagerRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, employment_type, checked_in, sort_order, comment"

    public var id: String
    public var name: String
    public var employment_type: EmploymentType
    public var checked_in: Bool
    public var sort_order: Int
    public var comment: String?

    public var visibleComment: String? {
        guard checked_in, let text = comment?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return comment
    }
}

public enum StaffRoster {
    /// 役職者 keep their manual order; staff without a role follow below,
    /// longest tenure first (no tenure last), ties by manual order.
    public static func arrange(
        _ staff: [StaffMemberRow],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> (roleHolders: [StaffMemberRow], others: [StaffMemberRow]) {
        let ordered = staff.sorted { $0.sort_order < $1.sort_order }
        let roleHolders = ordered.filter { !$0.role.trimmingCharacters(in: .whitespaces).isEmpty }
        func months(_ m: StaffMemberRow) -> Int {
            Tenure(hireDate: m.hireDate, now: now, calendar: calendar).map { $0.years * 12 + $0.months } ?? -1
        }
        let others = ordered
            .filter { $0.role.trimmingCharacters(in: .whitespaces).isEmpty }
            .sorted { a, b in
                let (ma, mb) = (months(a), months(b))
                return ma != mb ? ma > mb : a.sort_order < b.sort_order
            }
        return (roleHolders, others)
    }

    /// Yard manager cards drop from 4 to 3 per row whenever a comment shows.
    public static func yardManagerColumns(_ managers: [YardManagerRow]) -> Int {
        managers.contains { $0.visibleComment != nil } ? 3 : 4
    }
}

/// Resolves the 出勤簿 card gestures: a rapid triple tap fires at once, while
/// a sequence that stops at exactly two taps fires once input pauses (a 2nd
/// tap can't be known to be final until no 3rd follows).
public struct TapSequence: Sendable {
    public enum Action: Equatable, Sendable { case double, triple }

    public static let pause: TimeInterval = 0.5

    private var count = 0

    public init() {}

    /// Returns `.triple` immediately on the third tap.
    public mutating func tap() -> Action? {
        count += 1
        if count >= 3 {
            count = 0
            return .triple
        }
        return nil
    }

    /// Call after `pause` without further taps.
    public mutating func settle() -> Action? {
        defer { count = 0 }
        return count == 2 ? .double : nil
    }
}

/// Hire-date editing with separate year/month/day pickers.
public struct HireDateInput: Equatable, Sendable {
    public var year: Int?
    public var month: Int?
    public var day: Int?

    public init(year: Int? = nil, month: Int? = nil, day: Int? = nil) {
        self.year = year
        self.month = month
        self.day = day
    }

    public init(_ date: LocalDate?) {
        self.init(year: date?.year, month: date?.month, day: date?.day)
    }

    /// nil unless all three parts are chosen.
    public var date: LocalDate? {
        guard let year, let month, let day else { return nil }
        return LocalDate(year: year, month: month, day: min(day, Self.daysIn(year: year, month: month)))
    }

    public static func daysIn(year: Int?, month: Int?, calendar: Calendar = .current) -> Int {
        guard let year, let month,
              let date = calendar.date(from: DateComponents(year: year, month: month, day: 1))
        else { return 31 }
        return calendar.range(of: .day, in: .month, for: date)?.count ?? 31
    }

    /// The current year and the 60 before it, newest first.
    public static func yearOptions(now: Date = Date(), calendar: Calendar = .current) -> [Int] {
        let current = calendar.component(.year, from: now)
        return (0...60).map { current - $0 }
    }
}
