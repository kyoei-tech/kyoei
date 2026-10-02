import Foundation

// 運行履歴: the list's rest/休日 gaps and the カレンダー's manual overrides.
// Ports of trip-history-view.tsx, attendance-overrides.ts and
// use-attendance-calendar.ts.

// MARK: - Manual overrides (attendance_day_overrides, per device)

public enum AttendanceOverrideKind: String, Codable, Sendable {
    case workdayShift = "workday_shift"
    case holidayLabel = "holiday_label"
    case holidayRemoved = "holiday_removed"
}

public struct AttendanceOverrideRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, day, kind, shift_days, label"

    public var id: String
    public var day: String
    public var kind: AttendanceOverrideKind
    public var shift_days: Int?
    public var label: String?
}

/// One calendar cell after applying overrides.
public enum ResolvedAttendanceDay: Equatable, Sendable {
    /// Shows 〇. `origin` is the computed workday it came from.
    case workday(origin: LocalDate, shiftDays: Int)
    /// A workday whose 〇 was moved elsewhere: blank, but still editable so
    /// 元に戻す stays reachable from where the shift was applied.
    case workdayOrigin(origin: LocalDate, shiftDays: Int)
    case holiday(label: String?)

    public var showsMark: Bool {
        if case .workday = self { return true }
        return false
    }
}

extension AttendanceCalendar {
    public static let defaultHolidayLabel = "休日"

    public static func resolve(
        trips: [TripHistoryEntry],
        overrides: [AttendanceOverrideRow],
        calendar: Calendar = .current
    ) -> [LocalDate: ResolvedAttendanceDay] {
        var shiftByDay: [LocalDate: Int] = [:]
        var labelByDay: [LocalDate: String] = [:]
        var removed: Set<LocalDate> = []
        for override in overrides {
            guard let day = LocalDate(iso: override.day) else { continue }
            switch override.kind {
            case .workdayShift: if let shift = override.shift_days, shift != 0 { shiftByDay[day] = shift }
            case .holidayLabel: if let label = override.label, !label.isEmpty { labelByDay[day] = label }
            case .holidayRemoved: removed.insert(day)
            }
        }

        var resolved: [LocalDate: ResolvedAttendanceDay] = [:]
        for (day, kind) in days(for: trips, calendar: calendar) {
            switch kind {
            case .holiday:
                if !removed.contains(day) { resolved[day] = .holiday(label: labelByDay[day]) }
            case .workday:
                let shift = shiftByDay[day] ?? 0
                if shift == 0 {
                    resolved[day] = .workday(origin: day, shiftDays: 0)
                } else {
                    resolved[day] = .workdayOrigin(origin: day, shiftDays: shift)
                    resolved[day.adding(days: shift, calendar: calendar)] = .workday(origin: day, shiftDays: shift)
                }
            }
        }
        return resolved
    }

    /// The display shift for one trip in the list, mirroring a カレンダー shift.
    public static func dayShift(for trip: TripHistoryEntry, overrides: [AttendanceOverrideRow], calendar: Calendar = .current) -> Int {
        let workday = workday(for: trip, calendar: calendar).iso
        return overrides.first { $0.kind == .workdayShift && $0.day == workday }?.shift_days ?? 0
    }
}

// MARK: - 全表示 list

public struct RestDayNoteRow: Codable, Equatable, Sendable {
    public var trip_id: String
    public var memo: String
}

public enum TripHistoryTimeline {
    /// Gaps this long between 帰庫 and the next 出庫 become a 休日 card.
    public static let restDayThreshold: TimeInterval = 33 * 3600

    public enum RestBefore: Equatable, Sendable {
        /// Small "休息時間" note inside the trip card.
        case rest(TimeInterval)
        /// Separate 休日 card above the trip; 通常休日 when it spans a Sunday,
        /// otherwise it takes a memo (点検・車検など).
        case restDay(gap: TimeInterval, isRegularHoliday: Bool)
    }

    public struct Item: Equatable, Identifiable, Sendable {
        public var trip: TripHistoryEntry
        public var restBefore: RestBefore?
        public var id: String { trip.id }
    }

    /// `trips` newest-first, as fetched.
    public static func items(_ trips: [TripHistoryEntry], calendar: Calendar = .current) -> [Item] {
        trips.enumerated().map { index, trip in
            guard index + 1 < trips.count else { return Item(trip: trip, restBefore: nil) }
            let previous = trips[index + 1]
            let gap = trip.departedAt.timeIntervalSince(previous.returnedAt)
            if gap >= restDayThreshold {
                return Item(trip: trip, restBefore: .restDay(
                    gap: gap,
                    isRegularHoliday: containsSunday(from: previous.returnedAt, to: trip.departedAt, calendar: calendar)
                ))
            }
            return Item(trip: trip, restBefore: .rest(gap))
        }
    }

    public static func containsSunday(from start: Date, to end: Date, calendar: Calendar = .current) -> Bool {
        var cursor = calendar.startOfDay(for: start)
        while cursor <= end {
            if calendar.component(.weekday, from: cursor) == 1 { return true }
            guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { return false }
            cursor = next
        }
        return false
    }

    /// e.g. ("9/1", "06:05")
    public static func dateAndTime(_ date: Date, shiftDays: Int = 0, calendar: Calendar = .current) -> (date: String, time: String) {
        let shifted = calendar.date(byAdding: .day, value: shiftDays, to: date) ?? date
        let c = calendar.dateComponents([.month, .day, .hour, .minute], from: shifted)
        return ("\(c.month ?? 0)/\(c.day ?? 0)", "\(pad2(c.hour ?? 0)):\(pad2(c.minute ?? 0))")
    }

    /// 出庫・帰庫日時の隠し編集: 帰庫 must come after 出庫.
    public static func validateTimes(departedAt: Date, returnedAt: Date) -> String? {
        returnedAt > departedAt ? nil : "帰庫日時は出庫日時より後にしてください"
    }
}
