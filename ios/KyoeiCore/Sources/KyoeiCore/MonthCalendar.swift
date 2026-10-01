import Foundation

// Shared date/grid helpers for month-swipe calendars (無事故カレンダー,
// 運行履歴's calendar, etc). Port of lib/month-calendar.ts.

public struct YearMonth: Hashable, Comparable, Sendable {
    public var year: Int
    /// 1-12
    public var month: Int

    public init(year: Int, month: Int) {
        self.year = year
        self.month = month
    }

    public init(_ date: Date, calendar: Calendar = .current) {
        let c = calendar.dateComponents([.year, .month], from: date)
        self.init(year: c.year ?? 0, month: c.month ?? 1)
    }

    public func adding(months: Int) -> YearMonth {
        let index = year * 12 + (month - 1) + months
        return YearMonth(year: index / 12, month: index % 12 + 1)
    }

    /// e.g. "2026年9月"
    public var label: String { "\(year)年\(month)月" }

    /// `'YYYY-MM'`, e.g. for weekly_goal_history.month.
    public var key: String { "\(year)-\(pad2(month))" }

    public static func < (lhs: YearMonth, rhs: YearMonth) -> Bool {
        (lhs.year, lhs.month) < (rhs.year, rhs.month)
    }

    /// Sun-start weekly grid for this month, padded with nil cells so the
    /// count is always a multiple of 7.
    public func cells(calendar: Calendar = .current) -> [LocalDate?] {
        let first = LocalDate(year: year, month: month, day: 1)
        let firstDate = first.startDate(calendar: calendar)
        let firstWeekday = calendar.component(.weekday, from: firstDate) - 1
        let daysInMonth = calendar.range(of: .day, in: .month, for: firstDate)?.count ?? 30
        var list: [LocalDate?] = Array(repeating: nil, count: firstWeekday)
        for d in 1...daysInMonth {
            list.append(LocalDate(year: year, month: month, day: d))
        }
        while list.count % 7 != 0 { list.append(nil) }
        return list
    }
}

/// Japanese era (元号) label for a western year, e.g. 2019 -> "令和元年".
public func eraLabel(_ westernYear: Int) -> String {
    let eras: [(name: String, startYear: Int)] = [("令和", 2019), ("平成", 1989), ("昭和", 1926)]
    for era in eras where westernYear >= era.startYear {
        let eraYear = westernYear - era.startYear + 1
        return eraYear == 1 ? "\(era.name)元年" : "\(era.name)\(eraYear)年"
    }
    return "\(westernYear)年"
}
