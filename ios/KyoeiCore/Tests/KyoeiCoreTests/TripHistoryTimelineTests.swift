import Foundation
import Testing
@testable import KyoeiCore

@Suite struct TripHistoryTimelineTests {
    func override(_ day: String, _ kind: AttendanceOverrideKind, shift: Int? = nil, label: String? = nil) -> AttendanceOverrideRow {
        AttendanceOverrideRow(id: UUID().uuidString, day: day, kind: kind, shift_days: shift, label: label)
    }

    @Test func listGapsBecomeRestNotesOrRestDays() {
        // Newest first. 9/6 (Sun) lies between 9/5 and 9/7; 9/2→9/4 has no Sunday.
        let trips = [
            trip("d", from: date(2026, 9, 7, 6), to: date(2026, 9, 7, 18)),
            trip("c", from: date(2026, 9, 4, 6), to: date(2026, 9, 5, 2)),
            trip("b", from: date(2026, 9, 2, 6), to: date(2026, 9, 2, 18)),
            trip("a", from: date(2026, 9, 1, 6), to: date(2026, 9, 1, 20)),
        ]
        let items = TripHistoryTimeline.items(trips, calendar: tokyo)
        #expect(items[0].restBefore == .restDay(gap: 52 * hour, isRegularHoliday: true))
        #expect(items[1].restBefore == .restDay(gap: 36 * hour, isRegularHoliday: false))
        #expect(items[2].restBefore == .rest(10 * hour))
        #expect(items[3].restBefore == nil)
    }

    @Test func dateAndTimeFormattingWithShift() {
        let parts = TripHistoryTimeline.dateAndTime(date(2026, 8, 31, 6, 5), shiftDays: 1, calendar: tokyo)
        #expect(parts.date == "9/1" && parts.time == "06:05")
        #expect(TripHistoryTimeline.validateTimes(departedAt: date(2026, 9, 1, 6), returnedAt: date(2026, 9, 1, 6)) != nil)
        #expect(TripHistoryTimeline.validateTimes(departedAt: date(2026, 9, 1, 6), returnedAt: date(2026, 9, 1, 7)) == nil)
    }

    @Test func overridesShiftRelabelAndRemove() {
        let trips = [
            trip("a", from: date(2026, 9, 1, 6), to: date(2026, 9, 1, 18)),
            trip("b", from: date(2026, 9, 4, 6), to: date(2026, 9, 4, 18)),
        ]
        let d = { LocalDate(iso: $0)! }
        let plain = AttendanceCalendar.resolve(trips: trips, overrides: [], calendar: tokyo)
        #expect(plain[d("2026-09-01")] == .workday(origin: d("2026-09-01"), shiftDays: 0))
        #expect(plain[d("2026-09-02")] == .holiday(label: nil))

        let resolved = AttendanceCalendar.resolve(trips: trips, overrides: [
            override("2026-09-01", .workdayShift, shift: -1),
            override("2026-09-02", .holidayLabel, label: "車検"),
            override("2026-09-03", .holidayRemoved),
        ], calendar: tokyo)
        #expect(resolved[d("2026-09-01")] == .workdayOrigin(origin: d("2026-09-01"), shiftDays: -1))
        #expect(resolved[d("2026-08-31")] == .workday(origin: d("2026-09-01"), shiftDays: -1))
        #expect(resolved[d("2026-08-31")]?.showsMark == true)
        #expect(resolved[d("2026-09-01")]?.showsMark == false)
        #expect(resolved[d("2026-09-02")] == .holiday(label: "車検"))
        #expect(resolved[d("2026-09-03")] == nil)

        #expect(AttendanceCalendar.dayShift(for: trips[0], overrides: [override("2026-09-01", .workdayShift, shift: 1)], calendar: tokyo) == 1)
        #expect(AttendanceCalendar.dayShift(for: trips[1], overrides: [override("2026-09-01", .workdayShift, shift: 1)], calendar: tokyo) == 0)
    }
}
