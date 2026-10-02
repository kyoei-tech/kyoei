import Foundation

// マイページのプロフィール: 役職・フルネーム・入社年月日・車格・担当車両
// (トレーラーはヘッドと台車)・車検期限・3ヶ月点検・12ヶ月点検・健康診断予定日, as returned
// by my_profile() and entered from the admin console.

/// 担当車格. Raw values match account_profiles.vehicle_class.
public enum VehicleClass: String, Codable, CaseIterable, Sendable {
    case loader
    case twoCar = "two_car"
    case heavy
    case threeCar = "three_car"
    case fiveCar = "five_car"
    case trailerHanging = "trailer_hanging"
    case trailerLifter = "trailer_lifter"
    case cabTrailerHanging = "cab_trailer_hanging"
    case cabTrailerLifter = "cab_trailer_lifter"

    public var label: String {
        switch self {
        case .loader: "ローダー"
        case .twoCar: "2積み"
        case .heavy: "増トン"
        case .threeCar: "3積み"
        case .fiveCar: "5積み"
        case .trailerHanging: "トレーラー（非キャブ・宙吊り）"
        case .trailerLifter: "トレーラー（非キャブ・リフター）"
        case .cabTrailerHanging: "トレーラー（キャブ搭・宙吊り）"
        case .cabTrailerLifter: "トレーラー（キャブ搭・リフター）"
        }
    }

    /// ヘッド + 台車.
    public var isTrailer: Bool {
        switch self {
        case .trailerHanging, .trailerLifter, .cabTrailerHanging, .cabTrailerLifter: true
        default: false
        }
    }

    /// キャブ搭: cars also ride on the head (floor 0).
    public var isCabMounted: Bool { self == .cabTrailerHanging || self == .cabTrailerLifter }
    public var isHanging: Bool { self == .trailerHanging || self == .cabTrailerHanging }

    /// 荷姿: where cars can be loaded, in order. Empty = photo only (ローダー).
    public var loadingFloors: [String] {
        switch self {
        case .loader:
            return []
        case .twoCar, .heavy, .threeCar:
            return ["上段", "下段前", "下段後"]
        case .fiveCar:
            return (1...5).map { "\($0)番" }
        case .trailerHanging, .trailerLifter, .cabTrailerHanging, .cabTrailerLifter:
            var floors = (isCabMounted ? 0...6 : 1...6).map { "\($0)番" }
            if isHanging, let six = floors.firstIndex(of: "6番") { floors.insert("宙吊り", at: six) }
            return floors
        }
    }
}

public struct ProfileVehicle: Codable, Equatable, Sendable {
    public var plate: String
    /// "truck" / "head" / "chassis"
    public var kind: String
    public var shaken_due: String?
    public var inspection_3m_due: String?
    public var inspection_12m_due: String?

    public init(plate: String, kind: String, shaken_due: String? = nil, inspection_3m_due: String? = nil, inspection_12m_due: String? = nil) {
        self.plate = plate
        self.kind = kind
        self.shaken_due = shaken_due
        self.inspection_3m_due = inspection_3m_due
        self.inspection_12m_due = inspection_12m_due
    }

    public var kindLabel: String {
        switch kind {
        case "head": "ヘッド"
        case "chassis": "台車"
        default: "車両"
        }
    }
}

public struct MyProfile: Codable, Equatable, Sendable {
    public var login_id: String
    public var full_name: String
    public var position: String?
    public var hire_date: String?
    public var vehicle_class: VehicleClass?
    public var health_check_due: String?
    public var vehicle: ProfileVehicle?
    public var chassis: ProfileVehicle?

    public init(login_id: String, full_name: String = "", position: String? = nil, hire_date: String? = nil, vehicle_class: VehicleClass? = nil,
                health_check_due: String? = nil, vehicle: ProfileVehicle? = nil, chassis: ProfileVehicle? = nil) {
        self.login_id = login_id
        self.full_name = full_name
        self.position = position
        self.hire_date = hire_date
        self.vehicle_class = vehicle_class
        self.health_check_due = health_check_due
        self.vehicle = vehicle
        self.chassis = chassis
    }

    public var hireDate: LocalDate? { hire_date.flatMap(LocalDate.init(iso:)) }

    /// The assigned vehicles in display order (head before 台車); empty = 未定.
    public var vehicles: [ProfileVehicle] { [vehicle, chassis].compactMap { $0 } }

    /// 苗字 for 出勤簿: the part before the first space ("共栄 太郎" → "共栄").
    public var familyName: String? {
        let name = full_name.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return nil }
        return name.split(whereSeparator: { $0 == " " }).first.map(String.init)
    }
}

/// 車検・点検・健康診断の期限の近さ: overdue / within 30 days / later.
public struct DueDate: Equatable, Sendable {
    public enum Status: Equatable, Sendable { case overdue, soon, ok }

    public var date: LocalDate
    public var status: Status
    public var daysLeft: Int

    public init?(iso: String?, today: LocalDate, calendar: Calendar = .current) {
        guard let iso, let date = LocalDate(iso: iso) else { return nil }
        let days = calendar.dateComponents([.day], from: today.startDate(calendar: calendar), to: date.startDate(calendar: calendar)).day ?? 0
        self.date = date
        daysLeft = days
        status = days < 0 ? .overdue : days <= 30 ? .soon : .ok
    }

    /// "2027年3月31日（あと45日）" / "（期限切れ）"
    public var label: String {
        let base = "\(date.year)年\(date.month)月\(date.day)日"
        switch status {
        case .overdue: return "\(base)（期限切れ）"
        case .soon: return daysLeft == 0 ? "\(base)（今日）" : "\(base)（あと\(daysLeft)日）"
        case .ok: return base
        }
    }
}
