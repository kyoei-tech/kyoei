import Foundation
import Testing
@testable import KyoeiCore

@Suite struct InspectionTests {
    let today = LocalDate(year: 2026, month: 10, day: 10)
    let items = [
        InspectionItem(id: "brake", section: "ブレーキ", label: "効き", scope: .powered, sort_order: 10),
        InspectionItem(id: "tire", section: "タイヤ", label: "空気圧", scope: .eachUnit, sort_order: 20),
        InspectionItem(id: "wear", section: "タイヤ", label: "摩耗", frequency: .weekly, scope: .eachUnit, sort_order: 30),
        InspectionItem(id: "deck", section: "積載装置", label: "昇降", scope: .deck, sort_order: 40),
        InspectionItem(id: "hang", section: "宙吊り装置", label: "吊り具", scope: .deck, classes: ["trailer_hanging", "cab_trailer_hanging"], sort_order: 50),
        InspectionItem(id: "coupler", section: "連結装置", label: "カプラー", scope: .coupling, sort_order: 60),
        InspectionItem(id: "kit", section: "非常用具", label: "発炎筒", scope: .once, sort_order: 70),
        InspectionItem(id: "old", section: "旧", label: "無効", sort_order: 80, active: false),
    ]

    func record(_ day: LocalDate, _ results: [InspectionResult], report: InspectionReport? = nil) -> InspectionRecord {
        let at = day.startDate(calendar: tokyo).addingTimeInterval(6 * 3600)
        return InspectionRecord(inspectedOn: day, startedAt: at, completedAt: at, vehicleClass: .threeCar, vehiclePlate: "A", chassisPlate: nil, results: results, report: report)
    }

    @Test func truckGetsOneBlockWithDeckAndOnceItems() {
        let parts = InspectionPlan.parts(items: items, vehicleClass: .threeCar, vehiclePlate: "A", chassisPlate: nil, history: [], today: today, calendar: tokyo)
        #expect(parts.map(\.title) == ["車両"])
        #expect(parts[0].steps.map(\.item.id) == ["brake", "tire", "wear", "deck", "kit"])
    }

    @Test func trailerChecksHeadCouplingAndChassisTogether() {
        let parts = InspectionPlan.parts(items: items, vehicleClass: .trailerHanging, vehiclePlate: "H", chassisPlate: "C", history: [], today: today, calendar: tokyo)
        #expect(parts.map(\.title) == ["ヘッド", "連結部", "台車"])
        #expect(parts[0].steps.map(\.item.id) == ["brake", "tire", "wear", "kit"])
        #expect(parts[1].steps.map(\.item.id) == ["coupler"])
        #expect(parts[2].steps.map(\.item.id) == ["tire", "wear", "deck", "hang"])
        #expect(parts[2].steps.allSatisfy { $0.unit == .chassis && $0.plate == "C" })
        // リフター has no 宙吊り装置.
        let lifter = InspectionPlan.parts(items: items, vehicleClass: .trailerLifter, vehiclePlate: "H", chassisPlate: "C", history: [], today: today, calendar: tokyo)
        #expect(!lifter[2].steps.contains { $0.item.id == "hang" })
    }

    @Test func weeklyItemsSkippedWithinSevenDaysUnlessLastWasNG() {
        let wearOK = InspectionResult(item_id: "wear", unit: .vehicle, plate: "A", section: "タイヤ", label: "摩耗", result: .ok)
        let recent = [record(today.adding(days: -6, calendar: tokyo), [wearOK])]
        var steps = InspectionPlan.parts(items: items, vehicleClass: .threeCar, vehiclePlate: "A", chassisPlate: nil, history: recent, today: today, calendar: tokyo)[0].steps
        #expect(!steps.contains { $0.item.id == "wear" })

        let old = [record(today.adding(days: -7, calendar: tokyo), [wearOK])]
        steps = InspectionPlan.parts(items: items, vehicleClass: .threeCar, vehiclePlate: "A", chassisPlate: nil, history: old, today: today, calendar: tokyo)[0].steps
        #expect(steps.first { $0.item.id == "wear" }?.lastChecked == today.adding(days: -7, calendar: tokyo))

        // A different vehicle's check doesn't count.
        steps = InspectionPlan.parts(items: items, vehicleClass: .threeCar, vehiclePlate: "B", chassisPlate: nil, history: recent, today: today, calendar: tokyo)[0].steps
        #expect(steps.contains { $0.item.id == "wear" })

        var wearNG = wearOK
        wearNG.result = .ng
        let ng = [record(today.adding(days: -1, calendar: tokyo), [wearNG], report: InspectionReport(reportedTo: "課長", reportedAt: Date(), instruction: .ok))]
        steps = InspectionPlan.parts(items: items, vehicleClass: .threeCar, vehiclePlate: "A", chassisPlate: nil, history: ng, today: today, calendar: tokyo)[0].steps
        #expect(steps.first { $0.item.id == "wear" }?.followUp == true)
        #expect(steps.first { $0.item.id == "brake" }?.followUp == false)
    }

    @Test func departureNeedsTodaysInspectionWithoutUnresolvedIssues() {
        let ok = InspectionResult(item_id: "brake", unit: .vehicle, plate: "A", section: "ブレーキ", label: "効き", result: .ok)
        var ng = ok
        ng.result = .ng
        #expect(!InspectionGate.canDepart(records: [record(today.adding(days: -1, calendar: tokyo), [ok])], today: today))
        #expect(InspectionGate.canDepart(records: [record(today, [ok])], today: today))

        let noGo = record(today, [ng], report: InspectionReport(reportedTo: "課長", reportedAt: Date(), instruction: .noGo))
        #expect(noGo.has_issue && !noGo.allowsDeparture)
        #expect(!InspectionGate.canDepart(records: [noGo], today: today))
        let allowed = record(today, [ng], report: InspectionReport(reportedTo: "課長", reportedAt: Date(), instruction: .ok))
        #expect(InspectionGate.canDepart(records: [noGo, allowed], today: today))

        // The report is dropped when nothing was 否.
        let clean = record(today, [ok], report: InspectionReport(reportedTo: "課長", reportedAt: Date(), instruction: .noGo))
        #expect(clean.reported_to == nil && clean.instruction == nil && clean.allowsDeparture)
    }

    @Test func calendarMarks() {
        let ok = InspectionResult(item_id: "brake", unit: .vehicle, plate: "A", section: "ブレーキ", label: "効き", result: .ok)
        let records = [record(today.adding(days: -2, calendar: tokyo), [ok])]
        #expect(InspectionDayMark.resolve(day: today.adding(days: -2, calendar: tokyo), records: records, isWorkday: true, today: today) == .done)
        #expect(InspectionDayMark.resolve(day: today.adding(days: -1, calendar: tokyo), records: records, isWorkday: true, today: today) == .missing)
        #expect(InspectionDayMark.resolve(day: today.adding(days: -3, calendar: tokyo), records: records, isWorkday: false, today: today) == .off)
        #expect(InspectionDayMark.resolve(day: today, records: records, isWorkday: true, today: today) == nil)
        #expect(InspectionDayMark.resolve(day: today.adding(days: 1, calendar: tokyo), records: records, isWorkday: false, today: today) == nil)
    }

    @Test func recordRoundTripsThroughJSON() throws {
        let json = #"[{"id":"b1","inspected_on":"2026-10-10","started_at":"2026-10-10T06:00:00+09:00","completed_at":"2026-10-10T06:10:00+09:00","vehicle_class":"three_car","vehicle_plate":"A","chassis_plate":null,"results":[{"item_id":"x","unit":"vehicle","plate":"A","section":"タイヤ","label":"亀裂","result":"ng","note":"右前に亀裂","photo_path":null,"follow_up":false}],"has_issue":true,"reported_to":"運輸課長","reported_at":"2026-10-10T06:12:00+09:00","instruction":"after_repair","instruction_note":""}]"#
        let records = try JSONDecoder().decode([InspectionRecord].self, from: Data(json.utf8))
        #expect(records[0].issues.map(\.note) == ["右前に亀裂"])
        #expect(records[0].instruction == .afterRepair && !records[0].allowsDeparture)
        let again = try JSONDecoder().decode([InspectionRecord].self, from: JSONEncoder().encode(records))
        #expect(again == records)
    }
}

@Suite struct InspectionLeaveTests {
    @Test func leaveDayIsNotMissing() {
        let today = LocalDate(year: 2026, month: 10, day: 10)
        let day = LocalDate(year: 2026, month: 10, day: 8)
        #expect(InspectionDayMark.resolve(day: day, records: [], isWorkday: true, today: today, onLeave: true) == .leave)
        #expect(InspectionDayMark.resolve(day: day, records: [], isWorkday: true, today: today) == .missing)
    }
}
