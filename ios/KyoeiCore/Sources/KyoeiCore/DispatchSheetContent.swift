import Foundation

// 配車表の解析結果 (dispatch_sheets.extracted_data), as written by the
// parse-dispatch-sheet Edge Function (parser v2) — or by the retired web
// app's in-browser parser (v1, no version field), whose rows are decoded
// with the same defaults until the function re-reads them.

public struct DispatchVehicle: Equatable, Identifiable, Sendable {
    /// Position on the sheet (0-based), unique within one sheet.
    public var id: Int
    public var round: String
    public var vehicleName: String
    public var auctionInfo: String
    public var chassisNumber: String
    public var billTo: String
    public var pickup: String
    public var pickupRef: String
    public var dropoff: String
    public var dropoffRef: String
    /// "MM/DD", or nil when the sheet gives none.
    public var pickupDate: String?
    public var pickupCondition: String
    public var dropoffDate: String?
    public var dropoffCondition: String
    public var notes: String
    public var phones: [String]
    public var alerts: [String]
    public var shipFrom: String
    public var deliverTo: String
    public var lashing: String
    public var warnings: [String]

    public init(
        id: Int, round: String, vehicleName: String, auctionInfo: String = "", chassisNumber: String,
        billTo: String = "", pickup: String, pickupRef: String = "", dropoff: String, dropoffRef: String = "",
        pickupDate: String? = nil, pickupCondition: String = "", dropoffDate: String? = nil, dropoffCondition: String = "",
        notes: String = "", phones: [String] = [], alerts: [String] = [], shipFrom: String = "", deliverTo: String = "",
        lashing: String = "", warnings: [String] = []
    ) {
        self.id = id
        self.round = round
        self.vehicleName = vehicleName
        self.auctionInfo = auctionInfo
        self.chassisNumber = chassisNumber
        self.billTo = billTo
        self.pickup = pickup
        self.pickupRef = pickupRef
        self.dropoff = dropoff
        self.dropoffRef = dropoffRef
        self.pickupDate = pickupDate
        self.pickupCondition = pickupCondition
        self.dropoffDate = dropoffDate
        self.dropoffCondition = dropoffCondition
        self.notes = notes
        self.phones = phones
        self.alerts = alerts
        self.shipFrom = shipFrom
        self.deliverTo = deliverTo
        self.lashing = lashing
        self.warnings = warnings
    }

    /// The form chassis checks are stored and compared in.
    public var normalizedChassis: String { ChassisNumber.normalize(chassisNumber) }

    /// The sheet left 車体番号 blank: the driver records it from the real car
    /// instead of matching against the sheet.
    public var needsRecording: Bool { chassisNumber.isEmpty }
}

public struct DispatchSheetContent: Equatable, Sendable {
    public var parserVersion: Int
    public var dispatchDate: String?
    public var vehicleNumber: String?
    public var dispatchNumber: String?
    public var rounds: [DispatchRound]
    public var warnings: [String]

    public init(parserVersion: Int = 2, dispatchDate: String? = nil, vehicleNumber: String? = nil, dispatchNumber: String? = nil, rounds: [DispatchRound], warnings: [String] = []) {
        self.parserVersion = parserVersion
        self.dispatchDate = dispatchDate
        self.vehicleNumber = vehicleNumber
        self.dispatchNumber = dispatchNumber
        self.rounds = rounds
        self.warnings = warnings
    }

    public var vehicles: [DispatchVehicle] { rounds.flatMap(\.vehicles) }
}

public struct DispatchRound: Equatable, Identifiable, Sendable {
    public var round: String
    public var vehicles: [DispatchVehicle]
    public var id: String { round }

    public init(round: String, vehicles: [DispatchVehicle]) {
        self.round = round
        self.vehicles = vehicles
    }

    /// "2回戦", or "回戦不明".
    public var title: String { round == "不明" ? "回戦不明" : "\(round)回戦" }

    /// Vehicles grouped by 積地 → 降地, in sheet order.
    public var routes: [DispatchRoute] {
        var order: [String] = []
        var groups: [String: [DispatchVehicle]] = [:]
        for vehicle in vehicles {
            let key = vehicle.pickup + "\u{1F}" + vehicle.dropoff
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(vehicle)
        }
        return order.map { key in
            let members = groups[key]!
            return DispatchRoute(pickup: members[0].pickup, dropoff: members[0].dropoff, vehicles: members)
        }
    }
}

public struct DispatchRoute: Equatable, Identifiable, Sendable {
    public var pickup: String
    public var dropoff: String
    public var vehicles: [DispatchVehicle]
    public var id: String { pickup + "→" + dropoff }

    /// The earliest 卸日 among the route's vehicles.
    public func earliestDropoff(today: LocalDate) -> DispatchDue? {
        vehicles.compactMap { DispatchDue(monthDay: $0.dropoffDate, today: today) }.min()
    }
}

// MARK: - 納期

/// A 卸日 relative to today: 当日 = red, 翌日 = yellow (and past dates red).
public struct DispatchDue: Comparable, Sendable {
    public enum Urgency: Int, Comparable, Sendable {
        case overdue, today, tomorrow, later
        public static func < (lhs: Urgency, rhs: Urgency) -> Bool { lhs.rawValue < rhs.rawValue }
    }

    public var date: LocalDate
    public var urgency: Urgency

    /// `monthDay` is "MM/DD"; the year is whichever puts it closest to today
    /// (a sheet read in late December can carry January dates).
    public init?(monthDay: String?, today: LocalDate, calendar: Calendar = .current) {
        guard let monthDay else { return nil }
        let parts = monthDay.split(separator: "/").compactMap { Int($0) }
        guard parts.count == 2, (1...12).contains(parts[0]), (1...31).contains(parts[1]) else { return nil }
        let todayStart = today.startDate(calendar: calendar)
        let candidates = [today.year - 1, today.year, today.year + 1].map { LocalDate(year: $0, month: parts[0], day: parts[1]) }
        func distance(_ d: LocalDate) -> Int {
            abs(calendar.dateComponents([.day], from: todayStart, to: d.startDate(calendar: calendar)).day ?? .max)
        }
        let date = candidates.min { distance($0) < distance($1) }!
        let days = calendar.dateComponents([.day], from: todayStart, to: date.startDate(calendar: calendar)).day ?? 0
        self.date = date
        urgency = days < 0 ? .overdue : days == 0 ? .today : days == 1 ? .tomorrow : .later
    }

    public static func < (lhs: DispatchDue, rhs: DispatchDue) -> Bool { lhs.date < rhs.date }

    /// Shown next to the date: "今日" / "明日" / "期限切れ".
    public var label: String? {
        switch urgency {
        case .overdue: "期限切れ"
        case .today: "今日"
        case .tomorrow: "明日"
        case .later: nil
        }
    }

    /// Red for today or earlier, yellow for tomorrow.
    public var isUrgent: Bool { urgency <= .today }
}

// MARK: - 車台番号の照合

public enum ChassisNumber {
    /// Uppercase ASCII, "-" for every dash/長音, no spaces.
    public static func normalize(_ raw: String) -> String {
        let folded = raw.precomposedStringWithCompatibilityMapping.uppercased()
        var result = ""
        for scalar in folded.unicodeScalars {
            if dashes.contains(scalar) { result.append("-") }
            else if !CharacterSet.whitespacesAndNewlines.contains(scalar) { result.unicodeScalars.append(scalar) }
        }
        return result
    }

    private static let dashes = CharacterSet(charactersIn: "-‐‑‒–—―−ーｰ－")

    // A model code, a dash and the serial ("GP3-1022135", "VZNY12-103585"),
    // or a 17-character VIN. The serial may be misread as O/I/L by OCR.
    // (Computed: Regex isn't Sendable, so it can't be a stored static.)
    private static var japanese: Regex<(Substring, Substring, Substring)> { /([A-Z0-9]{2,8})-([0-9OIL]{3,8})(?![0-9A-Z])/ }
    private static var vin: Regex<(Substring, Substring)> { /(?:^|[^A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/ }

    /// Chassis-number-shaped strings in text read off a caution plate or
    /// stamping. Only the all-digit serial is repaired (O→0, I/L→1); the
    /// model code is kept exactly as read.
    public static func candidates(in lines: [String]) -> [String] {
        var found: [String] = []
        for line in lines {
            let text = normalizeDashesKeepingSpaces(line)
            for match in text.matches(of: japanese) {
                let serial = String(match.output.2).replacingOccurrences(of: "O", with: "0")
                    .replacingOccurrences(of: "I", with: "1").replacingOccurrences(of: "L", with: "1")
                let value = "\(match.output.1)-\(serial)"
                if !found.contains(value) { found.append(value) }
            }
            for match in text.matches(of: vin) {
                let value = String(match.output.1)
                if !found.contains(value) { found.append(value) }
            }
        }
        return found
    }

    /// Spaces around a dash ("GP3 - 1022135") are dropped; other spaces stay
    /// as word breaks so unrelated tokens don't run together.
    private static func normalizeDashesKeepingSpaces(_ raw: String) -> String {
        let folded = raw.precomposedStringWithCompatibilityMapping.uppercased()
        var result = ""
        for scalar in folded.unicodeScalars {
            result.unicodeScalars.append(dashes.contains(scalar) ? "-" : scalar)
        }
        return result.replacing(/\s*-\s*/, with: "-")
    }
}

public enum ChassisMatch: Equatable, Sendable {
    /// The read number equals this vehicle's 車台番号 exactly.
    case matched(vehicle: DispatchVehicle, chassis: String)
    /// A chassis number was read but no vehicle on the sheet has it.
    case mismatch(read: String)

    /// Exact match only (after normalization) — a near miss is a mismatch.
    /// Returns nil while nothing chassis-shaped has been read.
    public static func evaluate(candidates: [String], against vehicles: [DispatchVehicle]) -> ChassisMatch? {
        for candidate in candidates {
            if let vehicle = vehicles.first(where: { !$0.needsRecording && $0.normalizedChassis == candidate }) {
                return .matched(vehicle: vehicle, chassis: candidate)
            }
        }
        return candidates.first.map { .mismatch(read: $0) }
    }
}

public enum ChassisCheckMethod: String, Codable, CaseIterable, Identifiable, Sendable {
    case cautionPlate = "caution_plate"
    case stamp

    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .cautionPlate: "コーションプレート"
        case .stamp: "刻印"
        }
    }
}

/// dispatch_chassis_checks: one per vehicle the driver read with the camera
/// (personal, RLS). Either 照合 — the sheet's 車体番号 matched exactly — or
/// 記録 — the sheet left 車体番号 blank, so the real car's number is stored
/// for that vehicle (`vehicle_index` = DispatchVehicle.id).
public struct ChassisCheckRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, sheet_id, chassis_number, vehicle_index, method, checked_at"

    public var id: String
    public var sheet_id: String
    public var chassis_number: String
    public var vehicle_index: Int?
    public var method: ChassisCheckMethod
    public var checked_at: String

    public init(id: String, sheet_id: String, chassis_number: String, vehicle_index: Int? = nil, method: ChassisCheckMethod, checked_at: String) {
        self.id = id
        self.sheet_id = sheet_id
        self.chassis_number = chassis_number
        self.vehicle_index = vehicle_index
        self.method = method
        self.checked_at = checked_at
    }

    public var isRecorded: Bool { vehicle_index != nil }

    /// "07:41 コーションプレートで照合" / "…で記録" (with "9/1 " in front when not today).
    public func caption(now: Date = Date(), calendar: Calendar = .current) -> String {
        let verb = isRecorded ? "記録" : "照合"
        guard let date = DBTimestamp.parse(checked_at) else { return "\(method.label)で\(verb)" }
        let c = calendar.dateComponents([.month, .day, .hour, .minute], from: date)
        let time = "\(pad2(c.hour ?? 0)):\(pad2(c.minute ?? 0))"
        let day = calendar.isDate(date, inSameDayAs: now) ? "" : "\(c.month ?? 0)/\(c.day ?? 0) "
        return "\(day)\(time) \(method.label)で\(verb)"
    }

    /// Headline of the green box under the number: "コーションプレートで記録".
    public var headline: String { "\(method.label)で\(isRecorded ? "記録" : "照合")" }

    /// Second line: "9月1日 07:52 ・ 実車から読み取り" / "… ・ 配車表と一致".
    public func detailLine(calendar: Calendar = .current) -> String {
        let source = isRecorded ? "実車から読み取り" : "配車表と一致"
        guard let date = DBTimestamp.parse(checked_at) else { return source }
        let c = calendar.dateComponents([.month, .day, .hour, .minute], from: date)
        return "\(c.month ?? 0)月\(c.day ?? 0)日 \(pad2(c.hour ?? 0)):\(pad2(c.minute ?? 0)) ・ \(source)"
    }
}

/// dispatch_blank_acknowledgments: the driver confirmed (原本・伝票) that a
/// vehicle's 車体番号 really is blank on the sheet. Required before recording.
public struct BlankAcknowledgmentRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, sheet_id, vehicle_index, acknowledged_at"

    public var id: String
    public var sheet_id: String
    public var vehicle_index: Int
    public var acknowledged_at: String

    public init(id: String, sheet_id: String, vehicle_index: Int, acknowledged_at: String) {
        self.id = id
        self.sheet_id = sheet_id
        self.vehicle_index = vehicle_index
        self.acknowledged_at = acknowledged_at
    }
}

public struct BlankAcknowledgmentInsert: Encodable, Equatable, Sendable {
    public var sheet_id: String
    public var vehicle_index: Int

    public init(sheetID: String, vehicle: DispatchVehicle) {
        sheet_id = sheetID
        vehicle_index = vehicle.id
    }
}

/// Where a vehicle stands on 車体番号 (drives the badge, the card's middle
/// section and the 回戦まとめ row).
public enum ChassisStatus: Equatable, Sendable {
    /// Printed number, not yet matched.
    case unmatched
    /// Printed number, matched (or a blank one recorded).
    case done(ChassisCheckRow)
    /// Blank on the sheet and not yet confirmed as blank: 要確認.
    case blankNeedsReview
    /// Blank, confirmed against 原本・伝票, waiting for 記録.
    case blankConfirmed(BlankAcknowledgmentRow)

    public static func of(_ vehicle: DispatchVehicle, checks: ChassisChecks, acknowledgments: [BlankAcknowledgmentRow]) -> ChassisStatus {
        if let check = checks.check(for: vehicle) { return .done(check) }
        guard vehicle.needsRecording else { return .unmatched }
        if let ack = acknowledgments.first(where: { $0.vehicle_index == vehicle.id }) { return .blankConfirmed(ack) }
        return .blankNeedsReview
    }

    public var needsReview: Bool { self == .blankNeedsReview }
}

public extension Array where Element == DispatchVehicle {
    /// 要確認: blank 車体番号 not yet confirmed (and not recorded).
    func needingReview(checks: ChassisChecks, acknowledgments: [BlankAcknowledgmentRow]) -> [DispatchVehicle] {
        filter { ChassisStatus.of($0, checks: checks, acknowledgments: acknowledgments).needsReview }
    }
}

public struct ChassisCheckInsert: Encodable, Equatable, Sendable {
    public var sheet_id: String
    public var chassis_number: String
    /// Set only when recording a number for a vehicle whose 車体番号 is blank.
    public var vehicle_index: Int?
    public var method: ChassisCheckMethod

    /// 照合 of a printed number, or 記録 of the read number for a blank one.
    public init(sheetID: String, vehicle: DispatchVehicle, read: String, method: ChassisCheckMethod) {
        sheet_id = sheetID
        chassis_number = ChassisNumber.normalize(vehicle.needsRecording ? read : vehicle.chassisNumber)
        vehicle_index = vehicle.needsRecording ? vehicle.id : nil
        self.method = method
    }
}

/// A sheet's checks, looked up per vehicle.
public struct ChassisChecks: Equatable, Sendable {
    private var byChassis: [String: ChassisCheckRow] = [:]
    private var byVehicle: [Int: ChassisCheckRow] = [:]

    public init(_ rows: [ChassisCheckRow]) {
        for row in rows {
            if let index = row.vehicle_index {
                byVehicle[index] = byVehicle[index] ?? row
            } else {
                byChassis[row.chassis_number] = byChassis[row.chassis_number] ?? row
            }
        }
    }

    /// The 照合 of a printed number, or the 記録 for a blank one.
    public func check(for vehicle: DispatchVehicle) -> ChassisCheckRow? {
        vehicle.needsRecording ? byVehicle[vehicle.id] : byChassis[vehicle.normalizedChassis]
    }
}

/// 照合/記録済み vs. remaining counts for a set of vehicles.
public struct ChassisCheckProgress: Equatable, Sendable {
    public var checked: Int
    public var total: Int
    public var remaining: Int { total - checked }
    public var isComplete: Bool { remaining == 0 }

    public init(vehicles: [DispatchVehicle], checks: ChassisChecks) {
        total = vehicles.count
        checked = vehicles.filter { checks.check(for: $0) != nil }.count
    }
}

/// What a number read for a blank-numbered vehicle turned out to be.
public enum ChassisRecording: Equatable, Sendable {
    /// Not on the sheet — fine to record for the blank vehicle.
    case record(String)
    /// It is another vehicle's printed number: probably the wrong car.
    case belongsTo(DispatchVehicle)

    public static func evaluate(read: String, against vehicles: [DispatchVehicle]) -> ChassisRecording {
        let normalized = ChassisNumber.normalize(read)
        if let other = vehicles.first(where: { !$0.needsRecording && $0.normalizedChassis == normalized }) {
            return .belongsTo(other)
        }
        return .record(normalized)
    }
}

// MARK: - Decoding (v1 and v2)

extension DispatchSheetContent: Decodable {
    private enum CodingKeys: String, CodingKey {
        case parserVersion, dispatchDate, vehicleNumber, dispatchNumber, rounds, warnings
    }

    private struct RawRound: Decodable {
        var round: String?
        var vehicles: [RawVehicle]?
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        parserVersion = try c.decodeIfPresent(Int.self, forKey: .parserVersion) ?? 1
        dispatchDate = try c.decodeIfPresent(String.self, forKey: .dispatchDate).map(Self.fold)
        vehicleNumber = try c.decodeIfPresent(String.self, forKey: .vehicleNumber)
        dispatchNumber = try c.decodeIfPresent(String.self, forKey: .dispatchNumber)
        warnings = try c.decodeIfPresent([String].self, forKey: .warnings) ?? []
        var index = 0
        rounds = (try c.decodeIfPresent([RawRound].self, forKey: .rounds) ?? []).map { raw in
            let round = Self.fold(raw.round ?? "不明")
            let vehicles = (raw.vehicles ?? []).map { v -> DispatchVehicle in
                defer { index += 1 }
                return v.vehicle(id: index, round: round)
            }
            return DispatchRound(round: round, vehicles: vehicles)
        }
    }

    /// v1 text is raw PDF text (半角カナ etc.); v2 is already NFKC.
    static func fold(_ s: String) -> String {
        s.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespaces)
    }
}

private struct RawVehicle: Decodable {
    var vehicleName: String?
    var auctionInfo: String?
    var chassisNumber: String?
    var billTo: String?
    var pickup: String?
    var pickupRef: String?
    var dropoff: String?
    var dropoffRef: String?
    var pickupDateDetail: String?
    var dropoffDateDetail: String?
    var pickupDate: String?
    var pickupCondition: String?
    var dropoffDate: String?
    var dropoffCondition: String?
    var notes: String?
    var phone: String?
    var phones: [String]?
    var alerts: [String]?
    var shipFrom: String?
    var deliverTo: String?
    var lashing: String?
    var warnings: [String]?

    func vehicle(id: Int, round: String) -> DispatchVehicle {
        let f = DispatchSheetContent.fold
        let pickupSplit = Self.splitDate(pickupDateDetail)
        let dropoffSplit = Self.splitDate(dropoffDateDetail)
        return DispatchVehicle(
            id: id,
            round: round,
            vehicleName: f(vehicleName ?? ""),
            auctionInfo: f(auctionInfo ?? ""),
            chassisNumber: ChassisNumber.normalize(chassisNumber ?? ""),
            billTo: f(billTo ?? ""),
            pickup: f(pickup ?? ""),
            pickupRef: pickupRef ?? "",
            dropoff: f(dropoff ?? ""),
            dropoffRef: dropoffRef ?? "",
            pickupDate: pickupDate ?? pickupSplit.date,
            pickupCondition: f(pickupCondition ?? pickupSplit.condition),
            dropoffDate: dropoffDate ?? dropoffSplit.date,
            dropoffCondition: f(dropoffCondition ?? dropoffSplit.condition),
            notes: f(notes ?? ""),
            phones: phones ?? phone.map { [$0] } ?? [],
            alerts: alerts ?? [],
            shipFrom: f(shipFrom ?? ""),
            deliverTo: f(deliverTo ?? ""),
            lashing: f(lashing ?? ""),
            warnings: warnings ?? []
        )
    }

    /// v1's "08/25 以降" / "迄" → ("08/25", "以降") / (nil, "迄").
    static func splitDate(_ detail: String?) -> (date: String?, condition: String) {
        let text = DispatchSheetContent.fold(detail ?? "")
        guard let match = text.firstMatch(of: /^(\d{1,2})\/(\d{1,2})\s*(.*)$/) else { return (nil, text) }
        return ("\(pad2(Int(match.output.1)!))/\(pad2(Int(match.output.2)!))", String(match.output.3))
    }
}
