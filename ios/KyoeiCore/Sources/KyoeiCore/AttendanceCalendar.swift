import Foundation

// Derives 出勤日 / 休日 per calendar date from trip_history, for the 運行履歴
// calendar view only. Port of lib/attendance-calendar.ts.
//
// 出勤日判定: 17時以降に出庫し、帰庫が日付をまたいだ場合は「翌日」を出勤日とする。
// それ以外は出庫した日付を出勤日とする。
// 休日判定: 連続する2つの運行の間の休息時間が33時間以上の場合、その間に
// カレンダー上で完全に空いている日（どちらの出勤日でもない日）を休日とする。

public enum AttendanceDayKind: String, Sendable {
    case workday, holiday
}

public enum AttendanceCalendar {
    static let holidayRestThreshold: TimeInterval = 33 * 3600

    /// 出勤日 that a single trip counts toward.
    public static func workday(for trip: TripHistoryEntry, calendar: Calendar = .current) -> LocalDate {
        let departureDay = LocalDate(trip.departedAt, calendar: calendar)
        let returnDay = LocalDate(trip.returnedAt, calendar: calendar)
        let hour = calendar.component(.hour, from: trip.departedAt)
        if hour >= 17 && returnDay != departureDay {
            return departureDay.adding(days: 1, calendar: calendar)
        }
        return departureDay
    }

    /// Base (pre-override) status for every relevant date.
    public static func days(
        for trips: [TripHistoryEntry], calendar: Calendar = .current
    ) -> [LocalDate: AttendanceDayKind] {
        var days: [LocalDate: AttendanceDayKind] = [:]
        let chronological = trips.sorted { $0.departedAt < $1.departedAt }

        for trip in chronological {
            days[workday(for: trip, calendar: calendar)] = .workday
        }

        for (current, next) in zip(chronological, chronological.dropFirst()) {
            guard next.departedAt.timeIntervalSince(current.returnedAt) >= holidayRestThreshold else { continue }
            var cursor = LocalDate(current.returnedAt, calendar: calendar).adding(days: 1, calendar: calendar)
            let stop = LocalDate(next.departedAt, calendar: calendar)
            while cursor < stop {
                if days[cursor] == nil { days[cursor] = .holiday }
                cursor = cursor.adding(days: 1, calendar: calendar)
            }
        }
        return days
    }
}
