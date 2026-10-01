import Foundation

// Weekly/monthly legal-limit counters derived from trip_history. Port of
// lib/legal-limits.ts. Based on the 改善基準告示（2024年基準）:
//   - 拘束時間14時間超えの運行は週2回まで
//   - 分割休息（2〜3分割）は当該月の総勤務回数の半分未満まで
//   - 休日は2週間に1回以上（24時間以上の休息）を確保する

public enum LegalLimits {
    static let over14hWeeklyLimit = 2
    static let twentyFourHours: TimeInterval = 24 * 3600
    static let fourteenDays: TimeInterval = 14 * 24 * 3600

    /// Monday 00:00 of the week containing `now`.
    static func startOfWeek(_ now: Date, calendar: Calendar) -> Date {
        let today = calendar.startOfDay(for: now)
        let weekday = calendar.component(.weekday, from: today) - 1 // 0=Sun
        let diffToMonday = (weekday + 6) % 7
        return calendar.date(byAdding: .day, value: -diffToMonday, to: today) ?? today
    }

    static func startOfMonth(_ now: Date, calendar: Calendar) -> Date {
        let c = calendar.dateComponents([.year, .month], from: now)
        return calendar.date(from: c) ?? now
    }

    /// Remaining number of 拘束14時間超え trips allowed this week (0 if the limit is reached).
    public static func remainingOver14hCount(
        trips: [TripHistoryEntry], now: Date, calendar: Calendar = .current
    ) -> Int {
        let weekStart = startOfWeek(now, calendar: calendar)
        let used = trips.filter {
            $0.departedAt >= weekStart && $0.returnedAt.timeIntervalSince($0.departedAt) > TripLimits.fourteenHours
        }.count
        return max(0, over14hWeeklyLimit - used)
    }

    /// This month's 分割休息 usage so far as plain used/total counts — a
    /// steady 目安 against the "半分未満" rule rather than an unstable countdown.
    public static func splitRestUsageThisMonth(
        trips: [TripHistoryEntry], now: Date, calendar: Calendar = .current
    ) -> (used: Int, total: Int) {
        let monthStart = startOfMonth(now, calendar: calendar)
        let monthTrips = trips.filter { $0.departedAt >= monthStart }
        return (monthTrips.filter { $0.splitRestRemaining != nil }.count, monthTrips.count)
    }

    /// True if no qualifying 休日（24時間以上の連続休息）has occurred within the
    /// last 14 days, meaning a 休日出勤 would still be legally available.
    public static func canTakeHolidayShift(trips: [TripHistoryEntry], now: Date) -> Bool {
        let chronological = trips.sorted { $0.departedAt < $1.departedAt }
        let windowStart = now.addingTimeInterval(-fourteenDays)

        for (current, next) in zip(chronological, chronological.dropFirst()) {
            let gap = next.departedAt.timeIntervalSince(current.returnedAt)
            if gap >= twentyFourHours && next.departedAt >= windowStart {
                return false
            }
        }
        // The ongoing gap since the most recent 帰庫 also counts, using "now" as the open end.
        if let last = chronological.last, now.timeIntervalSince(last.returnedAt) >= twentyFourHours {
            return false
        }
        return true
    }
}
