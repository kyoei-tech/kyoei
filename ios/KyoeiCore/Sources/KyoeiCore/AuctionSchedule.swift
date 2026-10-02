import Foundation

// オークション情報 (aa_venues / aa_deadlines): venues per weekday and each
// venue's 搬出期限. Port of components/aa-view.tsx.

public struct AAVenueRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, weekday, venue_name"

    public var id: String
    public var weekday: Int
    public var venue_name: String
}

public struct AADeadlineRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, weekday, venue_name, deadline_time"

    public var id: String
    public var weekday: Int
    public var venue_name: String
    public var deadline_time: String
}

public enum AuctionSchedule {
    /// 0:00〜24:00 in 30-minute steps.
    public static let deadlineTimes: [String] = (0...24).flatMap { h in h < 24 ? ["\(h):00", "\(h):30"] : ["\(h):00"] }
    public static let defaultDeadlineTime = "9:00"

    /// Index 0 = Sunday … 6 = Saturday; each day sorted by venue name.
    public static func byWeekday<Row>(_ rows: [Row], weekday: KeyPath<Row, Int>, name: KeyPath<Row, String>) -> [[Row]] {
        let ja = Locale(identifier: "ja_JP")
        return (0..<7).map { day in
            rows.filter { $0[keyPath: weekday] == day }
                .sorted { $0[keyPath: name].compare($1[keyPath: name], locale: ja) == .orderedAscending }
        }
    }
}
