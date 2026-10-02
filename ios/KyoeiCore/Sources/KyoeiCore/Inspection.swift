import Foundation

// 点検簿: the daily inspection (日常点検) before 出庫. Items come from
// inspection_items (edited in the admin console); a finished inspection is
// one vehicle_inspections row. A trailer's head, coupling and chassis are
// checked in one go.

/// How often an item is asked.
public enum InspectionFrequency: String, Codable, CaseIterable, Sendable {
    case every, weekly, monthly

    public var label: String {
        switch self {
        case .every: "毎回"
        case .weekly: "週1"
        case .monthly: "月1"
        }
    }

    /// Days after the last check before the item is asked again.
    var interval: Int {
        switch self {
        case .every: 0
        case .weekly: 7
        case .monthly: 30
        }
    }
}

/// Which part of the vehicle an item is about.
public enum InspectionScope: String, Codable, CaseIterable, Sendable {
    /// 単車・ヘッドと台車のそれぞれ (タイヤ・灯火など).
    case eachUnit = "each_unit"
    /// 単車・ヘッドのみ (エンジン・ブレーキ操作など).
    case powered
    /// 積載部: 単車は車両、トレーラーは台車.
    case deck
    /// 連結部 (トレーラーのみ).
    case coupling
    /// 1回の点検で1回 (非常用具・書類など).
    case once
}

public struct InspectionItem: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, section, label, frequency, scope, classes, sort_order, active"

    public var id: String
    public var section: String
    public var label: String
    public var frequency: InspectionFrequency
    public var scope: InspectionScope
    /// 担当車格 it applies to; nil = all.
    public var classes: [String]?
    public var sort_order: Int
    public var active: Bool

    public init(id: String, section: String, label: String, frequency: InspectionFrequency = .every, scope: InspectionScope = .eachUnit, classes: [String]? = nil, sort_order: Int = 0, active: Bool = true) {
        self.id = id
        self.section = section
        self.label = label
        self.frequency = frequency
        self.scope = scope
        self.classes = classes
        self.sort_order = sort_order
        self.active = active
    }

    func applies(to vehicleClass: VehicleClass?) -> Bool {
        guard active else { return false }
        guard let classes, let vehicleClass else { return true }
        return classes.contains(vehicleClass.rawValue)
    }
}

/// 単車・ヘッド (vehicle) or 台車 (chassis). Coupling/once items use .vehicle.
public enum InspectionUnit: String, Codable, Sendable {
    case vehicle, chassis
}

public enum InspectionAnswer: String, Codable, CaseIterable, Sendable {
    case ok, ng, na

    public var label: String {
        switch self {
        case .ok: "可"
        case .ng: "否"
        case .na: "該当なし"
        }
    }
}

/// One checked item, as stored in vehicle_inspections.results.
public struct InspectionResult: Codable, Equatable, Sendable {
    public var item_id: String
    public var unit: InspectionUnit
    public var plate: String
    public var section: String
    public var label: String
    public var result: InspectionAnswer
    public var note: String
    public var photo_path: String?
    /// Asked because it was 否 last time (前回の異常箇所).
    public var follow_up: Bool

    public init(item_id: String, unit: InspectionUnit, plate: String, section: String, label: String, result: InspectionAnswer, note: String = "", photo_path: String? = nil, follow_up: Bool = false) {
        self.item_id = item_id
        self.unit = unit
        self.plate = plate
        self.section = section
        self.label = label
        self.result = result
        self.note = note
        self.photo_path = photo_path
        self.follow_up = follow_up
    }
}

/// 運行管理者の指示 after a 否.
public enum InspectionInstruction: String, Codable, CaseIterable, Sendable {
    case ok
    case afterRepair = "after_repair"
    case noGo = "no_go"

    public var label: String {
        switch self {
        case .ok: "運行可"
        case .afterRepair: "修理後に運行"
        case .noGo: "運行不可"
        }
    }
}

/// A finished inspection (a vehicle_inspections row).
public struct InspectionRecord: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, inspected_on, started_at, completed_at, vehicle_class, vehicle_plate, chassis_plate, results, has_issue, reported_to, reported_at, instruction, instruction_note"

    public var id: String
    public var inspected_on: LocalDate
    public var started_at: String
    public var completed_at: String
    public var vehicle_class: String?
    public var vehicle_plate: String
    public var chassis_plate: String?
    public var results: [InspectionResult]
    public var has_issue: Bool
    public var reported_to: String?
    public var reported_at: String?
    public var instruction: InspectionInstruction?
    public var instruction_note: String

    public init(id: String = UUID().uuidString.lowercased(), inspectedOn: LocalDate, startedAt: Date, completedAt: Date, vehicleClass: VehicleClass?, vehiclePlate: String, chassisPlate: String?, results: [InspectionResult], report: InspectionReport? = nil) {
        self.id = id
        inspected_on = inspectedOn
        started_at = DBTimestamp.format(startedAt)
        completed_at = DBTimestamp.format(completedAt)
        vehicle_class = vehicleClass?.rawValue
        vehicle_plate = vehiclePlate
        chassis_plate = chassisPlate
        self.results = results
        has_issue = results.contains { $0.result == .ng }
        reported_to = has_issue ? report?.reportedTo : nil
        reported_at = has_issue ? report.map { DBTimestamp.format($0.reportedAt) } : nil
        instruction = has_issue ? report?.instruction : nil
        instruction_note = has_issue ? report?.note ?? "" : ""
    }

    /// 出庫できる: no 否, or the 運行管理者 said 運行可.
    public var allowsDeparture: Bool { !has_issue || instruction == .ok }

    public var issues: [InspectionResult] { results.filter { $0.result == .ng } }

    public var completedAt: Date? { DBTimestamp.parse(completed_at) }
}

/// 運行管理者への報告.
public struct InspectionReport: Equatable, Sendable {
    public var reportedTo: String
    public var reportedAt: Date
    public var instruction: InspectionInstruction
    public var note: String

    public init(reportedTo: String, reportedAt: Date, instruction: InspectionInstruction, note: String = "") {
        self.reportedTo = reportedTo
        self.reportedAt = reportedAt
        self.instruction = instruction
        self.note = note
    }

    public var isComplete: Bool { !reportedTo.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

/// One screen of the inspection flow.
public struct InspectionStep: Equatable, Identifiable, Sendable {
    public var item: InspectionItem
    public var unit: InspectionUnit
    public var plate: String
    /// 前回の異常箇所: asked regardless of frequency.
    public var followUp: Bool
    /// When this item was last checked on this vehicle (for 週1・月1).
    public var lastChecked: LocalDate?

    public var id: String { "\(unit.rawValue):\(item.id)" }
}

/// A block of steps: 単車 / ヘッド / 連結部 / 台車.
public struct InspectionPart: Equatable, Identifiable, Sendable {
    public var title: String
    public var plate: String
    public var steps: [InspectionStep]

    public var id: String { title }
}

public enum InspectionPlan {
    /// The parts and steps for today's inspection. `history` is the user's
    /// recent records (any order); items checked within their frequency are
    /// skipped unless they were 否 on the latest inspection of that vehicle.
    public static func parts(
        items: [InspectionItem],
        vehicleClass: VehicleClass?,
        vehiclePlate: String,
        chassisPlate: String?,
        history: [InspectionRecord],
        today: LocalDate,
        calendar: Calendar = .current
    ) -> [InspectionPart] {
        let trailer = vehicleClass?.isTrailer == true
        let chassis = trailer ? chassisPlate.flatMap { $0.isEmpty ? nil : $0 } : nil
        let sorted = items.filter { $0.applies(to: vehicleClass) }.sorted { ($0.sort_order, $0.label) < ($1.sort_order, $1.label) }
        let latest = history.sorted { $0.completed_at > $1.completed_at }

        func steps(_ scopes: Set<InspectionScope>, unit: InspectionUnit, plate: String) -> [InspectionStep] {
            let lastIssues = Set(latest.first { record in record.results.contains { $0.plate == plate } }?
                .results.filter { $0.plate == plate && $0.result == .ng }.map(\.item_id) ?? [])
            return sorted.filter { scopes.contains($0.scope) }.compactMap { item in
                let last = latest.lazy.compactMap { record in
                    record.results.contains { $0.item_id == item.id && $0.plate == plate } ? record.inspected_on : nil
                }.first
                let followUp = lastIssues.contains(item.id)
                if !followUp, item.frequency != .every, let last {
                    let days = calendar.dateComponents([.day], from: last.startDate(calendar: calendar), to: today.startDate(calendar: calendar)).day ?? 0
                    if days < item.frequency.interval { return nil }
                }
                return InspectionStep(item: item, unit: unit, plate: plate, followUp: followUp, lastChecked: last)
            }
        }

        if trailer {
            var parts = [
                InspectionPart(title: "ヘッド", plate: vehiclePlate, steps: steps([.eachUnit, .powered, .once], unit: .vehicle, plate: vehiclePlate)),
                InspectionPart(title: "連結部", plate: vehiclePlate, steps: steps([.coupling], unit: .vehicle, plate: vehiclePlate)),
            ]
            if let chassis {
                parts.append(InspectionPart(title: "台車", plate: chassis, steps: steps([.eachUnit, .deck], unit: .chassis, plate: chassis)))
            }
            return parts.filter { !$0.steps.isEmpty }
        }
        return [InspectionPart(title: "車両", plate: vehiclePlate, steps: steps([.eachUnit, .powered, .deck, .once], unit: .vehicle, plate: vehiclePlate))]
            .filter { !$0.steps.isEmpty }
    }
}

public enum InspectionGate {
    /// 出庫 needs an inspection finished today that allows departure.
    public static func canDepart(records: [InspectionRecord], today: LocalDate) -> Bool {
        records.contains { $0.inspected_on == today && $0.allowsDeparture }
    }
}

/// One day on the 点検簿 calendar.
public enum InspectionDayMark: Equatable, Sendable {
    /// 点検済（異常なし）.
    case done
    /// 点検済・異常あり（報告済）.
    case issue
    /// 出勤日なのに点検の記録がない.
    case missing
    /// 非出勤日.
    case off

    public static func resolve(day: LocalDate, records: [InspectionRecord], isWorkday: Bool, today: LocalDate) -> InspectionDayMark? {
        let todays = records.filter { $0.inspected_on == day }
        if !todays.isEmpty { return todays.contains { $0.has_issue } ? .issue : .done }
        if day > today { return nil }
        return isWorkday ? (day == today ? nil : .missing) : .off
    }
}
