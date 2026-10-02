import Foundation

// 引取不可: the driver went to the 積地 but could not take the car. The
// driver picks an approver who is 出勤中; that person either 承認 (引取不可 is
// settled) or, after talking it over, both press 解決 and the car is carried
// as usual. Mirrors public.pickup_failures and its functions.

public enum PickupReason: String, Codable, CaseIterable, Identifiable, Sendable {
    case noVehicle = "no_vehicle"
    case noKey = "no_key"
    case documents
    case damaged
    case customer
    case other

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .noVehicle: "車両が無い"
        case .noKey: "鍵が無い"
        case .documents: "書類の不備"
        case .damaged: "車両の損傷・不動"
        case .customer: "先方の都合"
        case .other: "その他"
        }
    }

    /// その他 needs the 詳細 to say what happened.
    public var needsDetail: Bool { self == .other }
}

public enum PickupStatus: String, Codable, Sendable {
    case pending, approved, resolved

    public var label: String {
        switch self {
        case .pending: "承認待ち"
        case .approved: "引取不可（承認済み）"
        case .resolved: "解決済み（通常どおり輸送）"
        }
    }
}

/// One record as returned by my_pickup_failures / pickup_failure_board /
/// pickup_requests_for_me (kyoei_pickup_json).
public struct PickupFailure: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var user_id: String
    public var driver_name: String
    public var driver_phone: String?
    public var sheet_id: String?
    public var sheet_title: String
    public var vehicle_index: Int
    public var round: String
    public var vehicle_name: String
    public var chassis_number: String
    public var pickup: String
    public var pickup_ref: String
    public var dropoff: String
    public var dropoff_ref: String
    public var pickup_date: String
    public var dropoff_date: String
    public var reason: PickupReason
    public var detail: String
    public var photo_paths: [String]
    public var approver_id: String?
    public var approver_name: String?
    public var approver_phone: String?
    public var approved_at: String?
    public var approved_by_name: String?
    public var driver_resolved_at: String?
    public var approver_resolved_at: String?
    public var approver_resolved_by_name: String?
    public var resolved_at: String?
    public var status: PickupStatus
    public var created_at: String
    public var updated_at: String

    public var isOpen: Bool { status == .pending }

    /// Whether `userID` (the driver or the approver) has pressed 解決.
    public func hasPressedResolve(userID: String) -> Bool {
        if userID.lowercased() == user_id.lowercased() { return driver_resolved_at != nil }
        if userID.lowercased() == approver_id?.lowercased() { return approver_resolved_at != nil }
        return false
    }

    /// "○○さんの承認待ち" and, once one side pressed 解決, who is still to press it.
    public var waitingLine: String? {
        guard status == .pending else { return nil }
        let approver = approver_name.map { "\($0)さん" } ?? "役職者"
        switch (driver_resolved_at != nil, approver_resolved_at != nil) {
        case (true, false): return "解決を押しました。\(approver)の解決待ち"
        case (false, true): return "\(approver)が解決を押しました。ドライバーも解決を押すと解決済みになります"
        default: return "\(approver)の承認待ち"
        }
    }

    /// Changes worth telling the driver about, keyed so each is told once.
    public var noticeKey: String {
        "\(status.rawValue)|\(approver_resolved_at != nil)|\(approver_id ?? "")"
    }

    /// "9/21 07:41" (local time) of `created_at`.
    public func createdLabel(calendar: Calendar = .current) -> String {
        guard let date = DBTimestamp.parse(created_at) else { return "" }
        let c = calendar.dateComponents([.month, .day, .hour, .minute], from: date)
        return "\(c.month ?? 0)/\(c.day ?? 0) \(pad2(c.hour ?? 0)):\(pad2(c.minute ?? 0))"
    }
}

/// Someone the driver can ask: may approve and is 出勤中 (pickup_approvers_on_duty).
public struct PickupApprover: Codable, Equatable, Identifiable, Sendable {
    public var user_id: String
    public var name: String
    public var position: String?
    public var phone: String?

    public var id: String { user_id }

    public init(user_id: String, name: String, position: String? = nil, phone: String? = nil) {
        self.user_id = user_id
        self.name = name
        self.position = position
        self.phone = phone
    }
}

/// The car's lines copied into the record (p_vehicle of submit_pickup_failure).
public struct PickupVehicleSnapshot: Codable, Equatable, Sendable {
    public var vehicle_index: Int
    public var round: String
    public var vehicle_name: String
    public var chassis_number: String
    public var pickup: String
    public var pickup_ref: String
    public var dropoff: String
    public var dropoff_ref: String
    public var pickup_date: String
    public var dropoff_date: String

    public init(_ vehicle: DispatchVehicle) {
        vehicle_index = vehicle.id
        round = vehicle.round
        vehicle_name = vehicle.vehicleName
        chassis_number = vehicle.chassisNumber
        pickup = vehicle.pickup
        pickup_ref = vehicle.pickupRef
        dropoff = vehicle.dropoff
        dropoff_ref = vehicle.dropoffRef
        pickup_date = vehicle.pickupDate ?? ""
        dropoff_date = vehicle.dropoffDate ?? ""
    }
}

/// What the form must still have before it can be sent, or nil.
public enum PickupForm {
    public static func problem(reason: PickupReason?, detail: String, photoCount: Int) -> String? {
        guard let reason else { return "理由を選んでください。" }
        if reason.needsDetail && detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "「その他」のときは、詳細を入力してください。"
        }
        if photoCount == 0 { return "写真を1枚以上入れてください。" }
        if photoCount > maxPhotos { return "写真は\(maxPhotos)枚までです。" }
        return nil
    }

    public static let maxPhotos = 10

    /// The server's "pickup:…" errors, in words.
    public static func message(forServerError raw: String) -> String {
        if raw.contains("pickup:approver") { return "選んだ人が退勤したか、承認できなくなりました。選び直してください。" }
        if raw.contains("pickup:open") { return "この車はすでに引取不可を申請中です。" }
        if raw.contains("pickup:closed") { return "この申請はすでに承認または解決されています。" }
        return "送信できませんでした。通信状況を確認してください。"
    }
}

/// A sheet's records, looked up per car (the newest one decides).
public struct PickupFailures: Equatable, Sendable {
    private var byVehicle: [Int: PickupFailure] = [:]

    public init(_ records: [PickupFailure] = [], sheetID: String? = nil) {
        for record in records where sheetID == nil || record.sheet_id?.lowercased() == sheetID?.lowercased() {
            if let current = byVehicle[record.vehicle_index], current.created_at >= record.created_at { continue }
            byVehicle[record.vehicle_index] = record
        }
    }

    public func record(for vehicle: DispatchVehicle) -> PickupFailure? { byVehicle[vehicle.id] }

    /// Cars whose 引取不可 was approved: left out of the 照合 counts.
    public var notPickedUp: Set<Int> {
        Set(byVehicle.values.filter { $0.status == .approved }.map(\.vehicle_index))
    }
}

public enum PickupNotice {
    /// Messages for the driver about their records that changed since `seen`
    /// (id → noticeKey). Records never seen before are recorded silently.
    public static func driverChanges(_ records: [PickupFailure], seen: [String: String]) -> [(id: String, message: String)] {
        records.compactMap { record in
            guard let previous = seen[record.id], previous != record.noticeKey else { return nil }
            let name = record.vehicle_name.isEmpty ? "車両" : record.vehicle_name
            switch record.status {
            case .approved:
                return (record.id, "\(name)の引取不可が承認されました（\(record.approved_by_name ?? "役職者")）")
            case .resolved:
                return (record.id, "\(name)は解決済みになりました。通常どおり輸送してください")
            case .pending:
                guard record.approver_resolved_at != nil, record.driver_resolved_at == nil else { return nil }
                return (record.id, "\(record.approver_name ?? "役職者")さんが「解決」を押しました。解決なら、あなたも「解決」を押してください")
            }
        }
    }

    /// The approver's alert for a request they haven't been told about.
    public static func request(_ record: PickupFailure) -> String {
        "\(record.driver_name)さんが引取不可の許可を求めています（\(record.vehicle_name.isEmpty ? "車両" : record.vehicle_name)）"
    }
}
