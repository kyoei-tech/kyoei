import Foundation
import Testing
@testable import KyoeiCore

@Suite struct LegalLimitsTests {
    // 2026-09-02 is a Wednesday; its week starts Monday 2026-08-31.
    let now = date(2026, 9, 2, 12)

    @Test func over14hCountsOnlyThisWeek() {
        let trips = [
            trip("a", from: date(2026, 8, 31, 6), to: date(2026, 8, 31, 21)), // 15h, this week
            trip("b", from: date(2026, 8, 30, 6), to: date(2026, 8, 30, 21)), // 15h, last week (Sun)
            trip("c", from: date(2026, 9, 1, 6), to: date(2026, 9, 1, 19)), // 13h
        ]
        #expect(LegalLimits.remainingOver14hCount(trips: trips, now: now, calendar: tokyo) == 1)
    }

    @Test func splitRestUsageCountsThisMonth() {
        let trips = [
            trip("a", from: date(2026, 9, 1, 6), to: date(2026, 9, 1, 18), splitRest: 3 * hour),
            trip("b", from: date(2026, 9, 2, 6), to: date(2026, 9, 2, 10)),
            trip("c", from: date(2026, 8, 31, 6), to: date(2026, 8, 31, 18), splitRest: 3 * hour),
        ]
        let usage = LegalLimits.splitRestUsageThisMonth(trips: trips, now: now, calendar: tokyo)
        #expect(usage.used == 1)
        #expect(usage.total == 2)
    }

    @Test func holidayShiftUnavailableAfter24hGap() {
        let withGap = [
            trip("a", from: date(2026, 8, 28, 6), to: date(2026, 8, 28, 18)),
            trip("b", from: date(2026, 8, 30, 6), to: date(2026, 8, 30, 18)), // 36h gap
        ]
        #expect(!LegalLimits.canTakeHolidayShift(trips: withGap, now: date(2026, 8, 31, 6)))

        let noGap = [
            trip("a", from: date(2026, 8, 28, 6), to: date(2026, 8, 28, 18)),
            trip("b", from: date(2026, 8, 29, 6), to: date(2026, 8, 29, 18)),
        ]
        #expect(LegalLimits.canTakeHolidayShift(trips: noGap, now: date(2026, 8, 30, 6)))
        // The open gap since the last 帰庫 counts too.
        #expect(!LegalLimits.canTakeHolidayShift(trips: noGap, now: date(2026, 8, 30, 18)))
    }
}

@Suite struct AttendanceCalendarTests {
    @Test func lateDepartureCrossingMidnightCountsNextDay() {
        let late = trip("a", from: date(2026, 9, 1, 18), to: date(2026, 9, 2, 4))
        #expect(AttendanceCalendar.workday(for: late, calendar: tokyo) == LocalDate(year: 2026, month: 9, day: 2))
        let earlyCrossing = trip("b", from: date(2026, 9, 1, 16), to: date(2026, 9, 2, 1))
        #expect(AttendanceCalendar.workday(for: earlyCrossing, calendar: tokyo) == LocalDate(year: 2026, month: 9, day: 1))
    }

    @Test func longRestMarksEmptyDaysAsHolidays() {
        let trips = [
            trip("b", from: date(2026, 9, 4, 6), to: date(2026, 9, 4, 18)),
            trip("a", from: date(2026, 9, 1, 6), to: date(2026, 9, 1, 18)),
        ]
        let days = AttendanceCalendar.days(for: trips, calendar: tokyo)
        #expect(days[LocalDate(year: 2026, month: 9, day: 1)] == .workday)
        #expect(days[LocalDate(year: 2026, month: 9, day: 2)] == .holiday)
        #expect(days[LocalDate(year: 2026, month: 9, day: 3)] == .holiday)
        #expect(days[LocalDate(year: 2026, month: 9, day: 4)] == .workday)
        #expect(days.count == 4)
    }

    @Test func shortRestMarksNoHoliday() {
        let trips = [
            trip("a", from: date(2026, 9, 1, 6), to: date(2026, 9, 1, 18)),
            trip("b", from: date(2026, 9, 3, 2), to: date(2026, 9, 3, 12)), // 32h
        ]
        #expect(AttendanceCalendar.days(for: trips, calendar: tokyo).values.allSatisfy { $0 == .workday })
    }
}

@Suite struct DateHelperTests {
    @Test func localDateParsingAndArithmetic() {
        let d = LocalDate(iso: "2026-02-28")!
        #expect(d.adding(days: 1, calendar: tokyo).iso == "2026-03-01")
        #expect(LocalDate(iso: "2026-13-01") == nil)
        #expect(LocalDate(iso: "garbage") == nil)
        #expect(LocalDate(iso: "2026-09-01")! < LocalDate(iso: "2026-10-01")!)
    }

    @Test func monthCellsPadToWholeWeeks() {
        // 2026-09-01 is a Tuesday.
        let cells = YearMonth(year: 2026, month: 9).cells(calendar: tokyo)
        #expect(cells.count % 7 == 0)
        #expect(cells.prefix(2).allSatisfy { $0 == nil })
        #expect(cells[2] == LocalDate(year: 2026, month: 9, day: 1))
        #expect(cells.compactMap { $0 }.count == 30)
    }

    @Test func yearMonthArithmetic() {
        #expect(YearMonth(year: 2026, month: 1).adding(months: -1) == YearMonth(year: 2025, month: 12))
        #expect(YearMonth(year: 2026, month: 12).adding(months: 1).key == "2027-01")
        #expect(YearMonth(year: 2026, month: 9).label == "2026年9月")
    }

    @Test func eraLabels() {
        #expect(eraLabel(2019) == "令和元年")
        #expect(eraLabel(2026) == "令和8年")
        #expect(eraLabel(1989) == "平成元年")
        #expect(eraLabel(1988) == "昭和63年")
    }

    @Test func tenure() {
        let now = date(2026, 9, 15)
        #expect(Tenure(hireDate: LocalDate(iso: "2021-04-01"), now: now, calendar: tokyo)?.label == "勤続5年5ヶ月")
        let t = Tenure(hireDate: LocalDate(iso: "2021-04-20"), now: now, calendar: tokyo)!
        #expect(t.years == 5 && t.months == 4)
        #expect(t.label == "勤続5年4ヶ月")
        #expect(Tenure(hireDate: nil) == nil)
        #expect(formatHireDate(LocalDate(iso: "2021-04-01")) == "2021年4月1日")
    }

    @Test func accidentStreak() {
        let now = date(2026, 9, 15, 23)
        let dates = [LocalDate(iso: "2026-09-01")!, LocalDate(iso: "2026-09-10")!]
        #expect(AccidentStreak.streakDays(occurredOn: dates, now: now, calendar: tokyo) == 5)
        #expect(AccidentStreak.streakDays(occurredOn: [], now: now, calendar: tokyo) == nil)
    }

    @Test func clockAndDurations() {
        let parts = formatClock(date(2026, 9, 7, 14, 3, 5), calendar: tokyo)
        #expect(parts == ClockParts(date: "2026年9月7日", weekday: "月曜日", time: "14:03:05", meridiem: ""))
        let pm = formatClock(date(2026, 9, 7, 12, 3), hour12: true, seconds: false, calendar: tokyo)
        #expect(pm.time == "12:03" && pm.meridiem == "午後")
        #expect(DurationFormat.clock(25 * hour + 61) == "25:01:01")
        #expect(DurationFormat.clock(-5) == "00:00:00")
        #expect(DurationFormat.hoursMinutes(2 * hour + 5 * minute + 30) == "2時間5分")
        #expect(DurationFormat.hoursPaddedMinutes(2 * hour + 5 * minute) == "2時間05分")
        #expect(isSaturday(date(2026, 9, 5), calendar: tokyo))
    }

    @Test func telURLs() {
        #expect(telURL(" 03-1234-5678 ")?.absoluteString == "tel:0312345678")
        #expect(telURL("+81 (90) 1111-2222")?.absoluteString == "tel:+819011112222")
        #expect(telURL("なし") == nil)
    }
}
