import Foundation
import Testing
@testable import KyoeiCore

@Suite struct RepairTests {
    func request(_ extra: String = "") -> RepairRequest {
        let json = #"{"id":"r1","reported_on":"2026-10-03","vehicle_class":"trailer_lifter","head_plate":"相模100あ1234","chassis_plate":"相模130い5678","part":"chassis","symptom":"異音","cause":"","desired_on":null,"urgency":"urgent","photo_paths":[],"inspection_id":null,"withdrawn_at":null,"method":null,"vendor":null,"requested_on":null,"entry_on":null,"president_note":"","president_stamped_at":null,"work_done":"","completed_on":null,"slip_paths":[],"maintenance_stamped_at":null,"created_at":"2026-10-03T08:00:00+09:00","updated_at":"2026-10-03T08:00:00+09:00"}"#
        var r = try! JSONDecoder().decode(RepairRequest.self, from: Data(json.utf8))
        if extra == "scheduled" { r.method = .outsource; r.vendor = "日野自動車"; r.entry_on = LocalDate(year: 2026, month: 10, day: 6); r.president_stamped_at = "2026-10-03T10:00:00+09:00" }
        if extra == "done" { r.method = .inHouse; r.entry_on = LocalDate(year: 2026, month: 10, day: 6); r.president_stamped_at = "x"; r.completed_on = LocalDate(year: 2026, month: 10, day: 7) }
        return r
    }

    @Test func statusAndLabels() {
        #expect(request().status == .submitted && request().isEditable)
        let scheduled = request("scheduled")
        #expect(scheduled.status == .scheduled && !scheduled.isEditable && scheduled.destinationLabel == "外注（日野自動車）")
        #expect(request("done").status == .done && request("done").destinationLabel == "自社整備")
    }

    @Test func noticesOnlyForChangesSinceSeen() {
        let before = request()
        let after = request("scheduled")
        #expect(RepairNotice.changes([after], seen: [:]).isEmpty)
        #expect(RepairNotice.changes([after], seen: ["r1": before.noticeKey]).map(\.message) == ["修理の予定が決まりました（外注（日野自動車）・入庫予定日 10月6日）"])
        #expect(RepairNotice.changes([after], seen: ["r1": after.noticeKey]).isEmpty)
        #expect(RepairNotice.changes([request("done")], seen: ["r1": after.noticeKey]).map(\.message) == ["修理が完了しました（相模100あ1234）"])
    }

    @Test func insertForcesHeadBelowTrailers() {
        let truck = RepairRequestInsert(vehicleClass: .fiveCar, headPlate: "T", chassisPlate: "C", part: .chassis, symptom: " 異音 ", cause: "", desiredOn: nil, urgency: .asap, photoPaths: [], inspectionID: nil)
        #expect(truck.part == .head && truck.chassis_plate == nil && truck.symptom == "異音")
        let trailer = RepairRequestInsert(vehicleClass: .trailerLifter, headPlate: "H", chassisPlate: "C", part: .chassis, symptom: "x", cause: "", desiredOn: LocalDate(year: 2026, month: 10, day: 5), urgency: .urgent, photoPaths: [], inspectionID: nil)
        #expect(trailer.part == .chassis && trailer.chassis_plate == "C" && trailer.desired_on == "2026-10-05")
    }

    @Test func draftFromInspection() {
        let at = Date()
        let record = InspectionRecord(inspectedOn: LocalDate(year: 2026, month: 10, day: 3), startedAt: at, completedAt: at, vehicleClass: .trailerLifter, vehiclePlate: "H", chassisPlate: "C", results: [
            InspectionResult(item_id: "a", unit: .chassis, plate: "C", section: "タイヤ", label: "亀裂・損傷がない", result: .ng, note: "右後ろに亀裂"),
            InspectionResult(item_id: "b", unit: .vehicle, plate: "H", section: "ブレーキ", label: "効き", result: .ok),
        ], report: InspectionReport(reportedTo: "課長", reportedAt: at, instruction: .afterRepair))
        let draft = RepairDraft.symptom(from: record)
        #expect(draft.part == .chassis)
        #expect(draft.text == "日常点検（10/3）で否：\n・台車 タイヤ：亀裂・損傷がない\n　→ 右後ろに亀裂")
    }
}
