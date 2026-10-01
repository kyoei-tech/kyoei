import Foundation
import Testing
@testable import KyoeiCore

@Suite struct StaffRosterTests {
    func member(_ id: String, role: String = "", hire: String? = nil, order: Int) -> StaffMemberRow {
        StaffMemberRow(id: id, name: id, role: role, vehicle_class: "", status: .off, sort_order: order, hire_date: hire, comment: nil)
    }

    @Test func roleHoldersKeepOrderOthersByTenure() {
        let now = date(2026, 9, 1)
        let staff = [
            member("new", hire: "2025-04-01", order: 0),
            member("boss", role: "部長", order: 5),
            member("veteran", hire: "2010-04-01", order: 3),
            member("unknown", order: 1),
            member("chief", role: "課長", order: 2),
            member("mid", hire: "2020-04-01", order: 4),
            member("mid2", hire: "2020-04-01", order: 6),
        ]
        let arranged = StaffRoster.arrange(staff, now: now, calendar: tokyo)
        #expect(arranged.roleHolders.map(\.id) == ["chief", "boss"])
        #expect(arranged.others.map(\.id) == ["veteran", "mid", "mid2", "new", "unknown"])
    }

    @Test func memberSubtitleAndStatus() {
        var m = member("a", role: "部長", order: 0)
        m.vehicle_class = "大型"
        #expect(m.subtitle == "部長 / 大型")
        #expect(member("b", order: 0).subtitle == "—")
        #expect(StaffStatus.working.toggled == .off)
        #expect(StaffStatus.off.label == "退勤済み")
    }

    @Test func yardManagerColumnsShrinkWhenACommentShows() {
        let base = YardManagerRow(id: "1", name: "a", employment_type: .regular, checked_in: false, sort_order: 0, comment: "休憩中")
        #expect(StaffRoster.yardManagerColumns([base]) == 4) // not checked in → hidden
        var shown = base
        shown.checked_in = true
        #expect(StaffRoster.yardManagerColumns([base, shown]) == 3)
        shown.comment = "  "
        #expect(StaffRoster.yardManagerColumns([shown]) == 4)
    }

    @Test func tapSequence() {
        var taps = TapSequence()
        var log: [TapSequence.Action?] = []
        log.append(taps.tap()); log.append(taps.tap()); log.append(taps.settle())
        #expect(log == [nil, nil, .double])
        log = [taps.tap(), taps.settle()] // a single tap does nothing
        #expect(log == [nil, nil])
        log = [taps.tap(), taps.tap(), taps.tap(), taps.settle()]
        #expect(log == [nil, nil, .triple, nil])
    }

    @Test func hireDateInput() {
        #expect(HireDateInput(year: 2024, month: 2, day: nil).date == nil)
        #expect(HireDateInput(year: 2023, month: 2, day: 31).date == LocalDate(year: 2023, month: 2, day: 28))
        #expect(HireDateInput(LocalDate(iso: "2021-04-01")) == HireDateInput(year: 2021, month: 4, day: 1))
        #expect(HireDateInput.daysIn(year: 2024, month: 2, calendar: tokyo) == 29)
        #expect(HireDateInput.daysIn(year: nil, month: 2) == 31)
        let years = HireDateInput.yearOptions(now: date(2026, 1, 1), calendar: tokyo)
        #expect(years.first == 2026 && years.last == 1966 && years.count == 61)
    }
}

@Suite struct NewsAndYardTests {
    @Test func newsTrackerAnnouncesOnlyNewerPosts() {
        var tracker = NewsSeenTracker()
        tracker.initializeIfNeeded(now: date(2026, 9, 1, 12))
        let results = [
            tracker.observe(createdAt: "2026-09-01T02:00:00+00:00"), // 11:00 JST, before init
            tracker.observe(createdAt: "2026-09-01T04:00:00.123+00:00"),
            tracker.observe(createdAt: "2026-09-01T04:00:00.123+00:00"), // same post twice
            tracker.observe(createdAt: "2026-09-01T05:00:00+00:00"),
        ]
        #expect(results == [false, true, false, true])
        var initialized = tracker
        initialized.initializeIfNeeded(now: date(2030, 1, 1))
        #expect(initialized == tracker) // never re-initialized
    }

    @Test func newsDateLabel() {
        let row = NewsPostRow(id: "1", title: "t", category: "", content: "", author: "", created_at: "2026-08-31T16:00:00+00:00")
        #expect(row.dateLabel(calendar: tokyo) == "2026年9月1日")
    }

    @Test func yardPositionDecodesNullDestinations() throws {
        let json = #"{"id":"r","yard_id":"y","label":null,"destinations":null,"sort_order":2,"updated_at":"2026-09-01T00:00:00+00:00"}"#
        let row = try JSONDecoder().decode(YardPositionRow.self, from: Data(json.utf8))
        #expect(row.label.isEmpty && row.destinations.isEmpty)
    }

    @Test func latestUpdateAndToday() {
        let yards = [YardRow(id: "y", name: "本郷", sort_order: 0, updated_at: "2026-08-30T00:00:00+00:00")]
        let rows = [YardPositionRow(id: "r", yard_id: "y", label: "A", destinations: [], sort_order: 0, updated_at: "2026-09-01T01:00:00+00:00")]
        let latest = YardLayout.latestUpdate(yards: yards, positions: rows)!
        #expect(YardLayout.isUpdatedToday(latest, now: date(2026, 9, 1, 23), calendar: tokyo))
        #expect(!YardLayout.isUpdatedToday(latest, now: date(2026, 9, 2, 0, 1), calendar: tokyo))
        #expect(YardLayout.latestUpdate(yards: [], positions: []) == nil)
    }

    @Test func positionsGroupingTogglingAndRenaming() {
        let rows = [
            YardPositionRow(id: "b", yard_id: "y1", label: "", destinations: ["横浜", "川崎"], sort_order: 1, updated_at: ""),
            YardPositionRow(id: "a", yard_id: "y1", label: "", destinations: ["横浜"], sort_order: 0, updated_at: ""),
            YardPositionRow(id: "c", yard_id: "y2", label: "", destinations: ["千葉"], sort_order: 0, updated_at: ""),
        ]
        #expect(YardLayout.positionsByYard(rows)["y1"]?.map(\.id) == ["a", "b"])
        #expect(YardLayout.toggling("川崎", in: ["横浜"]) == ["横浜", "川崎"])
        #expect(YardLayout.toggling("横浜", in: ["横浜", "川崎"]) == ["川崎"])
        let renamed = YardLayout.renaming("横浜", to: "横浜港", in: rows)
        #expect(renamed.map(\.id) == ["b", "a"])
        #expect(renamed.first?.destinations == ["横浜港", "川崎"])
        #expect(YardLayout.renaming("横浜", to: "横浜", in: rows).isEmpty)
        #expect(!YardLayout.canAddPosition(label: " ", destinations: []))
        #expect(YardLayout.canAddPosition(label: "", destinations: ["横浜"]))
    }

    @Test func destinationSearchUsesKanaReadings() {
        let titles = [DestinationTitleRow(id: "t1", title: "一般", sort_order: 0)]
        let stores = [
            DestinationStoreRow(id: "s1", title_id: "t1", name: "東京ベイ店"),
            DestinationStoreRow(id: "s2", title_id: "missing", name: "トウキョウ南"),
            DestinationStoreRow(id: "s3", title_id: "t1", name: "大阪店"),
        ]
        let results = YardLayout.search("とうきょう", stores: stores, titles: titles, using: KanaSearch())
        #expect(results?.map(\.store.id) == ["s1", "s2"])
        #expect(results?.map(\.title) == ["一般", "不明"])
        #expect(YardLayout.search("  ", stores: stores, titles: titles) == nil)
    }
}
