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

/// 並び替えで記録: the cars in a column top to bottom, the column standing
/// for the 車格's floors in order. A car dragged into a slot pushes the rest
/// down; 空き slots let a floor stay empty. Slot i is floor i; slots past the
/// last floor are 未入力.
public struct PackingOrder: Equatable, Sendable {
    public enum Slot: Hashable, Sendable {
        case vehicle(Int)
        /// An empty floor; the number only keeps the slots distinct.
        case empty(Int)
    }

    public private(set) var slots: [Slot]
    public let floors: [String]

    /// Starts from the current assignment: placed cars on their floors and
    /// the rest below the floors. With nothing placed yet, the cars fill the
    /// floors in sheet order.
    public init(vehicles: [DispatchVehicle], floors: [String], draft: PackingDraft) {
        self.floors = floors
        let ids = vehicles.map(\.id)
        let onFloor = Dictionary(ids.compactMap { id in draft.floor(of: id).map { ($0, id) } }, uniquingKeysWith: { first, _ in first })
        var rest = ids.filter { id in draft.floor(of: id).flatMap(floors.firstIndex(of:)) == nil }
        let fillFromSheet = onFloor.isEmpty
        var slots: [Slot] = []
        for (index, floor) in floors.enumerated() {
            if let id = onFloor[floor] {
                slots.append(.vehicle(id))
            } else if fillFromSheet, !rest.isEmpty {
                slots.append(.vehicle(rest.removeFirst()))
            } else {
                slots.append(.empty(index))
            }
        }
        self.slots = slots + rest.map(Slot.vehicle)
    }

    /// Floor of slot `index`, or nil past the last floor.
    public func floor(at index: Int) -> String? {
        floors.indices.contains(index) ? floors[index] : nil
    }

    public mutating func move(fromOffsets source: IndexSet, toOffset destination: Int) {
        let moving = source.sorted().map { slots[$0] }
        var remaining = slots.enumerated().filter { !source.contains($0.offset) }.map(\.element)
        let insertAt = destination - source.filter { $0 < destination }.count
        remaining.insert(contentsOf: moving, at: min(max(insertAt, 0), remaining.count))
        slots = remaining
    }

    /// Moves slot `index` one place up (-1) or down (+1).
    public mutating func step(_ index: Int, by offset: Int) {
        let target = index + offset
        guard slots.indices.contains(index), slots.indices.contains(target) else { return }
        slots.swapAt(index, target)
    }

    /// The assignment this order stands for.
    public var draft: PackingDraft {
        var draft = PackingDraft()
        for (index, slot) in slots.enumerated() {
            if case .vehicle(let id) = slot, let floor = floor(at: index) { draft.assign(floor, to: id) }
        }
        return draft
    }
}

public enum PackingPrompt {
    /// 回戦 whose vehicles just became all 照合済 (between two check states).
    public static func newlyCompleted(rounds: [DispatchRound], before: ChassisChecks, after: ChassisChecks, excluding: Set<Int> = []) -> [DispatchRound] {
        rounds.filter { round in
            !ChassisCheckProgress(vehicles: round.vehicles, checks: before, excluding: excluding).isComplete
                && ChassisCheckProgress(vehicles: round.vehicles, checks: after, excluding: excluding).isComplete
        }
    }
}
