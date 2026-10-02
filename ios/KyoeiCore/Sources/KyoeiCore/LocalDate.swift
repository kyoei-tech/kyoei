import Foundation

/// A calendar day with no time or zone, matching the web app's `'YYYY-MM-DD'`
/// strings (Postgres `date` columns, attendance calendar keys, etc).
public struct LocalDate: Hashable, Comparable, Codable, Sendable, CustomStringConvertible {
    public var year: Int
    /// 1-12
    public var month: Int
    public var day: Int

    public init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    public init(_ date: Date, calendar: Calendar = .current) {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        self.init(year: c.year ?? 0, month: c.month ?? 1, day: c.day ?? 1)
    }

    /// Parses `'YYYY-MM-DD'`; returns nil for anything else.
    public init?(iso: String) {
        let parts = iso.split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m), (1...31).contains(d)
        else { return nil }
        self.init(year: y, month: m, day: d)
    }

    public var iso: String { "\(year)-\(pad2(month))-\(pad2(day))" }
    public var description: String { iso }

    /// Local midnight at the start of this day.
    public func startDate(calendar: Calendar = .current) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day)) ?? .distantPast
    }

    public func adding(days: Int, calendar: Calendar = .current) -> LocalDate {
        let date = calendar.date(byAdding: .day, value: days, to: startDate(calendar: calendar)) ?? .distantPast
        return LocalDate(date, calendar: calendar)
    }

    public static func < (lhs: LocalDate, rhs: LocalDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard let value = LocalDate(iso: raw) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid date \(raw)"))
        }
        self = value
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(iso)
    }
}

/// Postgres `timestamptz` <-> Date. Supabase returns ISO-8601 with or without
/// fractional seconds, so both shapes are accepted.
public enum DBTimestamp {
    public static func parse(_ raw: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }

    public static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
