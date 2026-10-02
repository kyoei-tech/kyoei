import Foundation
import Testing
@testable import KyoeiCore

@Suite struct ShiftTransitionTests {
    // 2026-09-02 is a Wednesday.
    func fresh() -> ShiftSnapshot { ShiftSnapshot(now: date(2026, 9, 2), calendar: tokyo) }

    @Test func normalDepartureAndReturn() throws {
        var s = fresh()
        let out = date(2026, 9, 2, 6)
        s.depart(at: out, viaSplitRest: false)
        #expect(s.mode == .departure && s.startedAt == out && s.trip != nil)

        s.tapBreak(.loading, at: out + hour)
        let back = date(2026, 9, 2, 18)
        let returned = s.returnToYard(at: back, calendar: tokyo)
        let completed = try #require(returned)
        #expect(completed.departedAt == out && completed.returnedAt == back)
        #expect(completed.totals.driving == hour && completed.totals.loading == 11 * hour)
        #expect(s.mode == .return && s.trip == nil && !s.isSplitRestReturn)
        #expect(s.countdownHours == 9)
        #expect(s.departableAt == date(2026, 9, 3, 3))
    }

    @Test func saturdayReturnDefaultsToThirtyThreeHours() {
        var s = fresh()
        s.depart(at: date(2026, 9, 5, 6), viaSplitRest: false)
        s.returnToYard(at: date(2026, 9, 5, 15), calendar: tokyo)
        #expect(s.countdownHours == 33)
    }

    @Test func splitRestDepartureCarriesRemainingAndFlagsNextReturn() {
        var s = fresh()
        s.depart(at: date(2026, 9, 1, 6), viaSplitRest: false)
        s.returnToYard(at: date(2026, 9, 1, 20), calendar: tokyo)
        // 4h rest, then depart via 分割休息.
        s.depart(at: date(2026, 9, 2, 0), viaSplitRest: true)
        #expect(s.trip?.splitRestRemaining == 6 * hour)
        #expect(s.splitRest == SplitRestState(cumulative: 4 * hour, splitCount: 1))

        s.returnToYard(at: date(2026, 9, 2, 10), calendar: tokyo)
        #expect(s.isSplitRestReturn)
        #expect(s.countdownHours == 3)

        // A normal departure clears the sequence.
        s.depart(at: date(2026, 9, 2, 20), viaSplitRest: false)
        #expect(s.splitRest == .initial)
        #expect(s.trip?.splitRestRemaining == nil)
    }

    @Test func returnTimeRoundsToMillisecondsAndReconciles() throws {
        var s = fresh()
        s.depart(at: date(2026, 9, 2, 6), viaSplitRest: false)
        let raw = date(2026, 9, 2, 18) + 0.000_4567
        let returned = s.returnToYard(at: raw, calendar: tokyo)
        let completed = try #require(returned)
        #expect(completed.returnedAt == date(2026, 9, 2, 18))

        s.isSplitRestReturn = true
        // Saved row without a split → flag cleared.
        s.reconcileSplitRestReturn(with: [trip("t", from: completed.departedAt, to: completed.returnedAt)])
        #expect(!s.isSplitRestReturn)
        // Row deleted → also cleared; split row → set.
        s.reconcileSplitRestReturn(with: [trip("t", from: completed.departedAt, to: completed.returnedAt, splitRest: 3 * hour)])
        #expect(s.isSplitRestReturn)
        s.reconcileSplitRestReturn(with: [])
        #expect(!s.isSplitRestReturn)
    }

    @Test func tickFiresRulesAndAppliesBreakReset() {
        let rules = [
            PushNotificationRule(id: "c", timerType: .continuous, threshold: 4 * hour, title: "t", message: "m"),
            PushNotificationRule(id: "b", timerType: .break, threshold: 0, title: "t", message: "m"),
        ]
        var s = fresh()
        let out = date(2026, 9, 2, 6)
        s.depart(at: out, viaSplitRest: false)
        let first = s.tick(at: out + 4 * hour, rules: rules, notificationsEnabled: true)
        #expect(first.map(\.ruleID) == ["c"])
        s.tapBreak(.resting, at: out + 4 * hour)
        let second = s.tick(at: out + 4 * hour + 30 * minute, rules: rules, notificationsEnabled: true)
        #expect(second.map(\.ruleID) == ["b"])
        #expect(s.trip?.breakSatisfied == true)
        // Disabled notifications still apply the 30-minute rule but emit nothing.
        var quiet = fresh()
        quiet.depart(at: out, viaSplitRest: false)
        quiet.tapBreak(.resting, at: out + hour)
        let quietEvents = quiet.tick(at: out + 2 * hour, rules: rules, notificationsEnabled: false)
        #expect(quietEvents.isEmpty)
        #expect(quiet.trip?.breakSatisfied == true)
    }

    @Test func upcomingNotificationsOnlyWhileDeparted() {
        let rules = [PushNotificationRule(id: "d", timerType: .driving, threshold: 13 * hour, title: "t", message: "m")]
        var s = fresh()
        #expect(s.upcomingNotifications(rules: rules, now: date(2026, 9, 2)).isEmpty)
        s.depart(at: date(2026, 9, 2, 6), viaSplitRest: false)
        #expect(s.upcomingNotifications(rules: rules, now: date(2026, 9, 2, 7)).map(\.fireDate) == [date(2026, 9, 2, 19)])
    }
}

@Suite struct DepartureConfirmationTests {
    func status(restHours: Double, splitCount: Int = 0, cumulative: TimeInterval = 0, trips: [TripHistoryEntry] = []) -> DriverHomeStatus {
        var s = ShiftSnapshot(now: date(2026, 9, 2), calendar: tokyo)
        s.mode = .return
        s.startedAt = date(2026, 9, 2, 0)
        s.splitRest = SplitRestState(cumulative: cumulative, splitCount: splitCount)
        return DriverHomeStatus(snapshot: s, trips: trips, now: date(2026, 9, 2) + restHours * hour, calendar: tokyo)
    }

    @Test func fullRestIsANormalDeparture() {
        let st = status(restHours: 9)
        #expect(!st.isSplitRestEligible)
        #expect(st.firstConfirmation == .departure)
        #expect(st.confirmation(after: .departure) == nil)
    }

    @Test func plainSplitRestGoesStraightToRules() {
        let st = status(restHours: 4)
        #expect(st.firstConfirmation == .splitRestMessage)
        #expect(st.confirmation(after: .splitRestMessage) == nil)
    }

    @Test func nearNineHoursWarnsFirst() {
        let st = status(restHours: 8.5)
        #expect(st.firstConfirmation == .splitRestNearFull)
        #expect(st.confirmation(after: .splitRestNearFull) == .splitRestMessage)
        #expect(st.remainingToNineHours == 0.5 * hour)
    }

    @Test func escalationWarning() {
        // One 8h split so far; a 1h segment can't close the 10h sequence.
        let st = status(restHours: 1, splitCount: 1, cumulative: 8 * hour)
        #expect(st.isSplitRestEscalating)
        #expect(st.firstConfirmation == .splitRestEscalation)
    }

    @Test func overLimitChainsIntoTheOtherWarnings() {
        let trips = [
            trip("a", from: date(2026, 9, 1, 6), to: date(2026, 9, 1, 18), splitRest: 3 * hour),
            trip("b", from: date(2026, 9, 1, 19), to: date(2026, 9, 1, 23)),
        ]
        let st = status(restHours: 8.5, trips: trips)
        #expect(st.splitRestOverHalfLimit)
        #expect(st.firstConfirmation == .splitRestOverLimit)
        #expect(st.confirmation(after: .splitRestOverLimit) == .splitRestNearFull)
    }

    @Test func confirmMessageLookups() {
        let messages = ConfirmMessages(rows: [
            ConfirmActionMessageRow(id: "home-departure", label: "", message: "**出庫**？", confirm_label: nil, cancel_label: "やめる"),
        ])
        #expect(messages.message("home-departure", fallback: "x") == "**出庫**？")
        #expect(messages.message("missing", fallback: "fb") == "fb")
        #expect(messages.cancelLabel("home-departure") == "やめる")
        #expect(messages.confirmLabel("home-departure") == "開始する")
        #expect(messages.confirmLabel("timecard-clock-in") == "押しました")
        #expect(messages.confirmLabel("home-split-rest-over-limit", fallback: "分割休息で出庫する") == "分割休息で出庫する")
    }

    @Test func weeklyGoalRollover() {
        let row = WeeklyGoalRow(id: "current", title: "今月の目標", content: "安全運転", next_content: "整理整頓",
                                next_content_set_at: nil, content_month: "2026-08", updated_at: "")
        #expect(row.needsRollover(currentMonth: YearMonth(year: 2026, month: 9)))
        #expect(!row.needsRollover(currentMonth: YearMonth(year: 2026, month: 8)))
        var empty = row
        empty.next_content = ""
        #expect(!empty.needsRollover(currentMonth: YearMonth(year: 2026, month: 9)))
    }
}
