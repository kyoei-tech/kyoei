import Foundation

// Small helpers shared by 出勤簿 / マイページ / 無事故カレンダー / 緊急連絡先.
// Ports of lib/tenure.ts, lib/accident-streak.ts and lib/phone.ts.

public struct Tenure: Equatable, Sendable {
    public var years: Int
    public var months: Int

    /// Full years and months of service as of `now`, or nil without a valid hire date.
    public init?(hireDate: LocalDate?, now: Date = Date(), calendar: Calendar = .current) {
        guard let hire = hireDate else { return nil }
        let today = LocalDate(now, calendar: calendar)
        var totalMonths = (today.year - hire.year) * 12 + (today.month - hire.month)
        if today.day < hire.day { totalMonths -= 1 }
        totalMonths = max(totalMonths, 0)
        years = totalMonths / 12
        months = totalMonths % 12
    }

    /// e.g. "勤続3年2ヶ月"
    public var label: String { "勤続\(years)年\(months)ヶ月" }
}

/// e.g. 2021-04-01 -> "2021年4月1日"
public func formatHireDate(_ date: LocalDate?) -> String? {
    guard let date else { return nil }
    return "\(date.year)年\(date.month)月\(date.day)日"
}

public enum AccidentStreak {
    /// Whole days between `date` and today.
    public static func daysSince(_ date: LocalDate, now: Date = Date(), calendar: Calendar = .current) -> Int {
        let start = date.startDate(calendar: calendar)
        let today = calendar.startOfDay(for: now)
        return calendar.dateComponents([.day], from: start, to: today).day ?? 0
    }

    /// Days since the most recent accident, or nil if there is no record at all.
    public static func streakDays(occurredOn dates: [LocalDate], now: Date = Date(), calendar: Calendar = .current) -> Int? {
        guard let latest = dates.max() else { return nil }
        return daysSince(latest, now: now, calendar: calendar)
    }
}

/// Turns a freely-typed phone number into a `tel:` URL, keeping a leading `+`
/// and stripping everything else that isn't a digit.
public func telURL(_ phone: String) -> URL? {
    let digits = phone.trimmingCharacters(in: .whitespacesAndNewlines).filter { $0.isASCII && ($0.isNumber || $0 == "+") }
    guard !digits.isEmpty else { return nil }
    return URL(string: "tel:\(digits)")
}
