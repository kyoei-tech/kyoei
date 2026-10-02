import Foundation

// 荷姿履歴: per 回戦, which car was loaded on which floor (何番に何を積んだか)
// and photos. Floors come from the 担当車格 (VehicleClass.loadingFloors);
// ローダー is photo only. Rows are packing_records.

extension DispatchVehicle {
    /// 型式: the 車体番号 before the hyphen ("ZVW30-1234567" → "ZVW30").
    public var modelCode: String {
        let number = normalizedChassis
        guard let hyphen = number.firstIndex(of: "-"), hyphen != number.startIndex else { return "" }
        return String(number[..<hyphen])
    }
}

public struct PackingPlacement: Codable, Equatable, Sendable {
    public var vehicle_index: Int
    public var vehicle_name: String
    public var model: String
    /// Full 車体番号 (never abbreviated); empty when blank on the sheet.
    public var chassis_number: String
    public var floor: String?

    public init(vehicle: DispatchVehicle, floor: String? = nil) {
        vehicle_index = vehicle.id
        vehicle_name = vehicle.vehicleName
        model = vehicle.modelCode
        chassis_number = vehicle.chassisNumber
        self.floor = floor
    }
}

public struct PackingRecord: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, sheet_id, sheet_title, round, loaded_on, vehicle_class, vehicle_plate, chassis_plate, placements, photo_paths, note, updated_at"

    public var id: String
    public var sheet_id: String?
    public var sheet_title: String
    public var round: String
    public var loaded_on: LocalDate
    public var vehicle_class: String?
    public var vehicle_plate: String
    public var chassis_plate: String?
    public var placements: [PackingPlacement]
    public var photo_paths: [String]
    public var note: String
    public var updated_at: String?

    public init(id: String = UUID().uuidString.lowercased(), sheetID: String?, sheetTitle: String, round: String, loadedOn: LocalDate, vehicleClass: VehicleClass?, vehiclePlate: String, chassisPlate: String?, placements: [PackingPlacement], photoPaths: [String] = [], note: String = "") {
        self.id = id
        sheet_id = sheetID
        sheet_title = sheetTitle
        self.round = round
        loaded_on = loadedOn
        vehicle_class = vehicleClass?.rawValue
        vehicle_plate = vehiclePlate
        chassis_plate = chassisPlate
        self.placements = placements
        photo_paths = photoPaths
        self.note = note
    }

    public var roundTitle: String { round == "不明" ? "回戦不明" : "\(round)回戦" }

    /// Placements in floor order (unplaced last), for display.
    public func ordered(floors: [String]) -> [PackingPlacement] {
        placements.sorted { a, b in
            let ia = a.floor.flatMap(floors.firstIndex(of:)) ?? Int.max
            let ib = b.floor.flatMap(floors.firstIndex(of:)) ?? Int.max
            return ia == ib ? a.vehicle_index < b.vehicle_index : ia < ib
        }
    }
}

/// The editor's floor assignment: each floor holds at most one car.
public struct PackingDraft: Equatable, Sendable {
    public private(set) var floors: [Int: String] = [:]

    public init(placements: [PackingPlacement] = []) {
        for placement in placements {
            if let floor = placement.floor { assign(floor, to: placement.vehicle_index) }
        }
    }

    public func floor(of vehicleIndex: Int) -> String? { floors[vehicleIndex] }

    /// Tapping the car's current floor clears it; a floor taken by another
    /// car moves to this one.
    public mutating func assign(_ floor: String, to vehicleIndex: Int) {
        if floors[vehicleIndex] == floor {
            floors[vehicleIndex] = nil
            return
        }
        for (index, taken) in floors where taken == floor { floors[index] = nil }
        floors[vehicleIndex] = floor
    }

    public func placements(for vehicles: [DispatchVehicle]) -> [PackingPlacement] {
        vehicles.map { PackingPlacement(vehicle: $0, floor: floors[$0.id]) }
    }
}

public enum PackingPrompt {
    /// 回戦 whose vehicles just became all 照合済 (between two check states).
    public static func newlyCompleted(rounds: [DispatchRound], before: ChassisChecks, after: ChassisChecks) -> [DispatchRound] {
        rounds.filter { round in
            !ChassisCheckProgress(vehicles: round.vehicles, checks: before).isComplete
                && ChassisCheckProgress(vehicles: round.vehicles, checks: after).isComplete
        }
    }
}
