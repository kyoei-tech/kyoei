import Foundation

// 修理申請 (車両修理依頼書): the driver reports, the 社長 decides 自社整備／外注
// with the dates and stamps, 整備 records the work and stamps.

public struct RepairRequest: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, reported_on, vehicle_class, head_plate, chassis_plate, part, symptom, cause, desired_on, urgency, photo_paths, inspection_id, withdrawn_at, method, vendor, requested_on, entry_on, president_note, president_stamped_at, work_done, completed_on, slip_paths, maintenance_stamped_at, created_at, updated_at"

    public var id: String
    public var reported_on: LocalDate
    public var vehicle_class: String?
    public var head_plate: String
    public var chassis_plate: String?
    public var part: RepairPart
    public var symptom: String
    public var cause: String
    public var desired_on: LocalDate?
    public var urgency: RepairUrgency
    public var photo_paths: [String]
    public var inspection_id: String?
    public var withdrawn_at: String?
    public var method: RepairMethod?
    public var vendor: String?
    public var requested_on: LocalDate?
    public var entry_on: LocalDate?
    public var president_note: String
    public var president_stamped_at: String?
    public var work_done: String
    public var completed_on: LocalDate?
    public var slip_paths: [String]
    public var maintenance_stamped_at: String?
    public var created_at: String
    public var updated_at: String

    public var status: RepairStatus {
        if withdrawn_at != nil { return .withdrawn }
        if completed_on != nil { return .done }
        if president_stamped_at != nil { return .scheduled }
        return .submitted
    }

    /// The driver may edit or withdraw until the 社長印.
    public var isEditable: Bool { status == .submitted }

    /// 依頼先 as shown: 自社整備 or the vendor.
    public var destinationLabel: String? {
        switch method {
        case .inHouse: "自社整備"
        case .outsource: vendor.map { "外注（\($0)）" } ?? "外注"
        case nil: nil
        }
    }

    /// Changes worth telling the driver about, keyed so each is told once.
    public var noticeKey: String { "\(status.rawValue)|\(entry_on?.iso ?? "")|\(completed_on?.iso ?? "")" }
}

public enum RepairPart: String, Codable, CaseIterable, Sendable {
    case head, chassis
    public var label: String { self == .head ? "ヘッド" : "台車" }
}

public enum RepairUrgency: String, Codable, CaseIterable, Sendable {
    case urgent, asap
    public var label: String { self == .urgent ? "早急に" : "出来るだけ早く" }
}

public enum RepairMethod: String, Codable, Sendable {
    case inHouse = "in_house"
    case outsource
}

public enum RepairStatus: String, Codable, Sendable {
    case submitted, scheduled, done, withdrawn

    public var label: String {
        switch self {
        case .submitted: "社長の確認待ち"
        case .scheduled: "修理の予定が決まりました"
        case .done: "修理完了"
        case .withdrawn: "取り下げ"
        }
    }
}

/// A new request (the driver's part only).
public struct RepairRequestInsert: Encodable, Equatable, Sendable {
    public var vehicle_class: String?
    public var head_plate: String
    public var chassis_plate: String?
    public var part: RepairPart
    public var symptom: String
    public var cause: String
    public var desired_on: String?
    public var urgency: RepairUrgency
    public var photo_paths: [String]
    public var inspection_id: String?

    public init(vehicleClass: VehicleClass?, headPlate: String, chassisPlate: String?, part: RepairPart, symptom: String, cause: String, desiredOn: LocalDate?, urgency: RepairUrgency, photoPaths: [String], inspectionID: String?) {
        vehicle_class = vehicleClass?.rawValue
        head_plate = headPlate
        chassis_plate = vehicleClass?.isTrailer == true ? chassisPlate : nil
        // 5積み以下（トレーラー以外）はヘッドのみ.
        self.part = vehicleClass?.isTrailer == true ? part : .head
        self.symptom = symptom.trimmingCharacters(in: .whitespacesAndNewlines)
        self.cause = cause.trimmingCharacters(in: .whitespacesAndNewlines)
        desired_on = desiredOn?.iso
        self.urgency = urgency
        photo_paths = photoPaths
        inspection_id = inspectionID
    }
}

public enum RepairDraft {
    /// 修理申請 prefilled from an inspection's 否 items.
    public static func symptom(from record: InspectionRecord) -> (part: RepairPart, text: String) {
        let issues = record.issues
        let part: RepairPart = issues.contains { $0.unit == .chassis } && !issues.contains { $0.unit == .vehicle } ? .chassis : .head
        let lines = issues.map { "・\($0.unit == .chassis ? "台車 " : "")\($0.section)：\($0.label)\n　→ \($0.note)" }
        return (part, "日常点検（\(record.inspected_on.month)/\(record.inspected_on.day)）で否：\n" + lines.joined(separator: "\n"))
    }
}

public enum RepairNotice {
    /// Messages for requests whose state changed since `seen` (id → noticeKey).
    /// Requests never seen before are recorded silently.
    public static func changes(_ requests: [RepairRequest], seen: [String: String]) -> [(id: String, message: String)] {
        requests.compactMap { request in
            guard let previous = seen[request.id], previous != request.noticeKey else { return nil }
            switch request.status {
            case .scheduled:
                let entry = request.entry_on.map { "入庫予定日 \($0.month)月\($0.day)日" } ?? ""
                return (request.id, "修理の予定が決まりました（\(request.destinationLabel ?? "")・\(entry)）")
            case .done:
                return (request.id, "修理が完了しました（\(request.head_plate)）")
            case .submitted, .withdrawn:
                return nil
            }
        }
    }
}
