import Foundation
import Testing
@testable import KyoeiCore

@Suite struct KanaSearchTests {
    let search = KanaSearch()

    @Test func kanaConversion() {
        #expect(hiraganaToKatakana("とうきょうA") == "トウキョウA")
        #expect(katakanaToHiragana("サービスー") == "さーびすー")
        #expect(isKanaOnly("サービス"))
        #expect(!isKanaOnly("東京"))
        #expect(!isKanaOnly(""))
    }

    @Test(arguments: [
        ("東京", "とうきょう"),
        ("トウキョウ", "とうきょう"),
        ("本郷", "ほんご"),
        ("共栄車輌サービス", "さーびす"),
        ("共栄車輌サービス", "きょうえい"),
        ("Yokohama", "yoko"),
    ])
    func matches(text: String, query: String) {
        #expect(search.matches(text, query: query))
    }

    @Test func nonMatchesAndEmptyQuery() {
        #expect(!search.matches("東京", query: "おおさか"))
        #expect(!search.matches(nil, query: "a"))
        #expect(search.matches("anything", query: "  "))
    }
}

@Suite struct StyledTextTests {
    @Test func parsesNestedMarkers() {
        let segments = StyledText.parse("残り**;;3時間;;**です")
        #expect(segments == [
            StyledSegment(text: "残り"),
            StyledSegment(text: "3時間", bold: true, color: .red),
            StyledSegment(text: "です"),
        ])
    }

    @Test func unterminatedMarkerIsLiteral() {
        #expect(StyledText.parse("a**b") == [StyledSegment(text: "a**b")])
    }

    @Test func colorsAndPlainText() {
        #expect(StyledText.parse("::橙::##緑##").map(\.color) == [.orange, .green])
        #expect(StyledText.plain("**;;赤;;**\n::橙::") == "赤\n橙")
    }
}

@Suite struct DrivingNotificationTests {
    let rules = [
        PushNotificationRule(id: "c4", timerType: .continuous, threshold: 4 * hour, title: "連続", message: "4時間"),
        PushNotificationRule(id: "d13", timerType: .driving, threshold: 13 * hour, title: "運行", message: "13時間"),
        PushNotificationRule(id: "b", timerType: .break, threshold: 0, title: "休憩", message: "30分達成"),
    ]

    @Test func firesOncePerThreshold() {
        var state = NotifyState.initial
        var result = DrivingNotifications.tick(state, continuous: 4 * hour, driving: 4 * hour, breakSatisfied: false, rules: rules)
        #expect(result.events.map(\.ruleID) == ["c4"])
        state = result.state
        result = DrivingNotifications.tick(state, continuous: 4 * hour + 1, driving: 4 * hour + 1, breakSatisfied: false, rules: rules)
        #expect(result.events.isEmpty)
    }

    @Test func continuousRearmsAfterReset() {
        var state = DrivingNotifications.tick(.initial, continuous: 4 * hour, driving: 0, breakSatisfied: false, rules: rules).state
        state = DrivingNotifications.tick(state, continuous: 0, driving: 0, breakSatisfied: false, rules: rules).state
        #expect(!state.firedRuleIDs.contains("c4"))
        let result = DrivingNotifications.tick(state, continuous: 4 * hour, driving: 0, breakSatisfied: false, rules: rules)
        #expect(result.events.map(\.ruleID) == ["c4"])
    }

    @Test func breakFiresOnRisingEdgeOnly() {
        let first = DrivingNotifications.tick(.initial, continuous: 0, driving: 0, breakSatisfied: true, rules: rules)
        #expect(first.events.map(\.ruleID) == ["b"])
        let second = DrivingNotifications.tick(first.state, continuous: 0, driving: 0, breakSatisfied: true, rules: rules)
        #expect(second.events.isEmpty)
    }

    @Test func schedulesWhileDriving() {
        let start = date(2026, 9, 1, 6)
        let trip = TripState.start(at: start, splitRestRemaining: nil)
        let now = start + hour
        let fires = DrivingNotifications.upcomingFireDates(trip: trip, tripStartedAt: start, notify: .initial, rules: rules, now: now)
        #expect(fires.map(\.rule.id) == ["c4", "d13"])
        #expect(fires[0].fireDate == start + 4 * hour)
        #expect(fires[1].fireDate == start + 13 * hour)
    }

    @Test func schedulesBreakWhileOnBreakAndSkipsFiredRules() {
        let start = date(2026, 9, 1, 6)
        let trip = TripState.start(at: start, splitRestRemaining: nil)
            .tappingBreak(.resting, at: start + 2 * hour)
        let now = start + 2 * hour + 5 * minute
        let notify = NotifyState(firedRuleIDs: ["d13"])
        let fires = DrivingNotifications.upcomingFireDates(trip: trip, tripStartedAt: start, notify: notify, rules: rules, now: now)
        // Continuous is paused during a break, and d13 already fired.
        #expect(fires.map(\.rule.id) == ["b"])
        #expect(fires[0].fireDate == start + 2 * hour + 30 * minute)
    }
}

@Suite struct SettingsAndGestureTests {
    @Test func settingsDecodeToleratesMissingAndUnknownFields() throws {
        let json = #"{"theme":"dark","fontLevels":{"home":3,"bogus":2},"futureField":true}"#
        let settings = try JSONDecoder().decode(AppSettings.self, from: Data(json.utf8))
        #expect(settings.theme == .dark)
        #expect(settings.fontLevels[.home] == 3)
        #expect(settings.fontLevels[.menu] == 1)
        #expect(settings.pushNotificationsEnabled)
        #expect(settings.fontScale(for: .home) == 1.2)
        let roundTrip = try JSONDecoder().decode(AppSettings.self, from: JSONEncoder().encode(settings))
        #expect(roundTrip == settings)
    }

    @Test func deviceFontAndPartTimeMode() {
        var settings = AppSettings()
        settings.fontLevels[.news] = 6
        settings.deviceFont = true
        #expect(settings.fontScale(for: .news) == 1)
        settings.setPartTimeMode(true)
        #expect(settings.appMode == .timecard)
        settings.setPartTimeMode(false)
        #expect(settings.appMode == .driver)
    }

    @Test func secretTapNeedsFiveQuickTaps() {
        var counter = SecretTapCounter()
        let t0 = date(2026, 9, 1)
        func tap(_ offset: TimeInterval) -> Bool { counter.registerTap(at: t0 + offset) }
        let quick = [0, 0.3, 0.6, 0.9, 1.2].map(tap)
        #expect(quick == [false, false, false, false, true])
        // A slow tap restarts the count.
        let slow = [10, 10.3, 10.6, 10.9, 20].map(tap)
        #expect(slow == [false, false, false, false, false])
    }

    @Test func tripHistoryRowConversion() throws {
        let json = #"""
        {"id":"x","departed_at":"2026-09-01T06:00:00+00:00","returned_at":"2026-09-01T18:30:00.123+00:00",
         "driving_ms":3600000,"loading_ms":0,"unloading_ms":0,"waiting_ms":0,"resting_ms":1800000,
         "split_rest_remaining_ms":null,"process_memo":null,"traffic_memo":"渋滞","free_memo":null}
        """#
        let entry = try #require(try JSONDecoder().decode(TripHistoryRow.self, from: Data(json.utf8)).entry)
        #expect(entry.totals.driving == hour)
        #expect(entry.totals.resting == 30 * minute)
        #expect(entry.trafficMemo == "渋滞")
        #expect(entry.hasMemo)
        #expect(abs(entry.returnedAt.timeIntervalSince(entry.departedAt) - (12.5 * hour + 0.123)) < 0.001)

        let insert = TripHistoryInsert(deviceID: "dev", departedAt: entry.departedAt, returnedAt: entry.returnedAt,
                                       totals: entry.totals, splitRestRemaining: 3 * hour)
        #expect(insert.driving_ms == 3_600_000)
        #expect(insert.split_rest_remaining_ms == 10_800_000)
    }
}
