import Foundation

// Clock and duration formatting. Port of lib/shift-time.ts plus the two
// formatHoursMinutes variants from lib/trip-log.ts / lib/timecard-log.ts.

public func pad2(_ n: Int) -> String {
    n < 10 && n >= 0 ? "0\(n)" : "\(n)"
}

public enum JapaneseCalendarText {
    public static let weekdays = ["日", "月", "火", "水", "木", "金", "土"]
}

public struct ClockParts: Equatable, Sendable {
    /// e.g. "2026年9月7日"
    public var date: String
    /// e.g. "月曜日"
    public var weekday: String
    /// e.g. "14:23:05" or "2:23"
    public var time: String
    /// "午前" / "午後" in 12-hour mode, otherwise empty.
    public var meridiem: String
}

public func formatClock(
    _ date: Date,
    hour12: Bool = false,
    seconds: Bool = true,
    calendar: Calendar = .current
) -> ClockParts {
    let c = calendar.dateComponents([.year, .month, .day, .weekday, .hour, .minute, .second], from: date)
    var hour = c.hour ?? 0
    var meridiem = ""
    if hour12 {
        meridiem = hour < 12 ? "午前" : "午後"
        hour %= 12
        if hour == 0 { hour = 12 }
    }
    var time = "\(hour12 ? String(hour) : pad2(hour)):\(pad2(c.minute ?? 0))"
    if seconds { time += ":\(pad2(c.second ?? 0))" }
    return ClockParts(
        date: "\(c.year ?? 0)年\(c.month ?? 0)月\(c.day ?? 0)日",
        weekday: "\(JapaneseCalendarText.weekdays[(c.weekday ?? 1) - 1])曜日",
        time: time,
        meridiem: meridiem
    )
}

public func isSaturday(_ date: Date, calendar: Calendar = .current) -> Bool {
    calendar.component(.weekday, from: date) == 7
}

public enum DurationFormat {
    /// HH:MM:SS (hours can exceed 24, clamped at 0).
    public static func clock(_ duration: TimeInterval) -> String {
        let total = max(0, Int(duration.rounded(.down)))
        return "\(pad2(total / 3600)):\(pad2(total % 3600 / 60)):\(pad2(total % 60))"
    }

    /// e.g. 2h15m30s -> "2時間15分" (運行状況 style, minutes not padded).
    public static func hoursMinutes(_ duration: TimeInterval) -> String {
        let totalMinutes = max(0, Int((duration / 60).rounded(.down)))
        return "\(totalMinutes / 60)時間\(totalMinutes % 60)分"
    }

    /// e.g. 2h5m -> "2時間05分" (タイムカード style, minutes padded).
    public static func hoursPaddedMinutes(_ duration: TimeInterval) -> String {
        let totalMinutes = max(0, Int((duration / 60).rounded(.down)))
        return "\(totalMinutes / 60)時間\(pad2(totalMinutes % 60))分"
    }
}
