import Foundation
import Testing
@testable import KyoeiCore

@Suite struct PackingTests {
    let note = DispatchVehicle(id: 0, round: "1", vehicleName: "ノート", chassisNumber: "E12-123456", pickup: "A", dropoff: "B")
    let fit = DispatchVehicle(id: 1, round: "1", vehicleName: "フィット", chassisNumber: "GK3-1234567", pickup: "A", dropoff: "B")
    let blank = DispatchVehicle(id: 2, round: "1", vehicleName: "フリード", chassisNumber: "", pickup: "A", dropoff: "B")

    @Test func modelCodeIsTheChassisPrefix() {
        #expect(note.modelCode == "E12")
        #expect(blank.modelCode == "")
        #expect(DispatchVehicle(id: 3, round: "1", vehicleName: "x", chassisNumber: "ZVW301234567", pickup: "A", dropoff: "B").modelCode == "")
    }

    @Test func eachFloorHoldsOneCar() {
        var draft = PackingDraft()
        draft.assign("上段", to: 0)
        draft.assign("上段", to: 1) // moves from ノート to フィット
        #expect(draft.floor(of: 0) == nil && draft.floor(of: 1) == "上段")
        draft.assign("下段前", to: 1) // a car has one floor
        #expect(draft.floor(of: 1) == "下段前")
        draft.assign("下段前", to: 1) // tapping again clears it
        #expect(draft.floor(of: 1) == nil)

        draft.assign("下段後", to: 2)
        let placements = draft.placements(for: [note, fit, blank])
        #expect(placements.map(\.floor) == [nil, nil, "下段後"])
        #expect(placements[1].chassis_number == "GK3-1234567" && placements[1].model == "GK3")
        #expect(PackingDraft(placements: placements) == draft)
    }

    @Test func orderedByFloor() {
        let record = PackingRecord(sheetID: nil, sheetTitle: "", round: "1", loadedOn: LocalDate(year: 2026, month: 10, day: 3), vehicleClass: .trailerHanging, vehiclePlate: "H", chassisPlate: "C", placements: [
            PackingPlacement(vehicle: note, floor: "6番"),
            PackingPlacement(vehicle: fit, floor: "宙吊り"),
            PackingPlacement(vehicle: blank, floor: nil),
        ])
        #expect(record.ordered(floors: VehicleClass.trailerHanging.loadingFloors).map(\.vehicle_name) == ["フィット", "ノート", "フリード"])
        #expect(record.roundTitle == "1回戦")
    }

    @Test func promptsWhenARoundBecomesFullyChecked() {
        let round1 = DispatchRound(round: "1", vehicles: [note, fit])
        let round2 = DispatchRound(round: "2", vehicles: [DispatchVehicle(id: 5, round: "2", vehicleName: "ヴェゼル", chassisNumber: "RU1-1306182", pickup: "A", dropoff: "B")])
        let check = { (n: String) in ChassisCheckRow(id: n, sheet_id: "s", chassis_number: n, method: .cautionPlate, checked_at: "2026-10-03T00:00:00+00:00") }
        let before = ChassisChecks([check("E12-123456")])
        let after = ChassisChecks([check("E12-123456"), check("GK3-1234567")])
        #expect(PackingPrompt.newlyCompleted(rounds: [round1, round2], before: before, after: after).map(\.round) == ["1"])
        #expect(PackingPrompt.newlyCompleted(rounds: [round1, round2], before: after, after: after).isEmpty)
    }

    @Test func settingDefaultsOnAndSurvivesOldData() throws {
        #expect(AppSettings().packingPrompt)
        let old = try JSONDecoder().decode(AppSettings.self, from: Data(#"{"theme":"dark"}"#.utf8))
        #expect(old.packingPrompt)
    }
}

@Suite struct PackingOrderTests {
    let cars = (0..<3).map { DispatchVehicle(id: $0, round: "1", vehicleName: "車\($0)", chassisNumber: "A-\($0)", pickup: "A", dropoff: "B") }
    let floors = ["上段", "下段前", "下段後"]

    @Test func startsInSheetOrderWhenNothingIsPlaced() {
        let order = PackingOrder(vehicles: cars, floors: floors, draft: PackingDraft())
        #expect(order.slots == [.vehicle(0), .vehicle(1), .vehicle(2)])
        #expect(order.draft.floor(of: 2) == "下段後")
    }

    @Test func draggingPushesTheOthersDown() {
        var order = PackingOrder(vehicles: cars, floors: floors, draft: PackingDraft())
        order.move(fromOffsets: [2], toOffset: 0)
        #expect(order.slots == [.vehicle(2), .vehicle(0), .vehicle(1)])
        #expect(order.draft.floor(of: 2) == "上段" && order.draft.floor(of: 1) == "下段後")
        order.step(0, by: 1)
        #expect(order.slots == [.vehicle(0), .vehicle(2), .vehicle(1)])
    }

    @Test func keepsExistingFloorsAndEmptySlots() {
        var draft = PackingDraft()
        draft.assign("下段後", to: 1)
        let order = PackingOrder(vehicles: cars, floors: floors, draft: draft)
        #expect(order.slots == [.empty(0), .empty(1), .vehicle(1), .vehicle(0), .vehicle(2)])
        // Cars below the last floor have none.
        #expect(order.floor(at: 3) == nil)
        #expect(order.draft == draft)
    }

    @Test func moreCarsThanFloors() {
        let order = PackingOrder(vehicles: cars, floors: ["1番", "2番"], draft: PackingDraft())
        #expect(order.slots == [.vehicle(0), .vehicle(1), .vehicle(2)])
        #expect(order.draft.floor(of: 2) == nil)
    }
}
