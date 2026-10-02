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

/// 3ヶ月点検・12ヶ月点検・車検の予約 (車両管理 in the console).
public struct VehicleAppointment: Codable, Equatable, Identifiable, Sendable {
    public enum Kind: String, Codable, CaseIterable, Sendable {
        case inspection3m = "inspection_3m"
        case inspection12m = "inspection_12m"
        case shaken

        public var label: String {
            switch self {
            case .inspection3m: "3ヶ月点検"
            case .inspection12m: "12ヶ月点検"
            case .shaken: "車検"
            }
        }
    }

    public var id: String
    public var kind: Kind
    public var scheduled_on: LocalDate
    public var scheduled_time: String
    public var place: String
    /// "bring" (共栄持込) / "pickup" (業者の引取).
    public var handover: String
    public var vendor: String
    public var notes: String

    public init(id: String, kind: Kind, scheduled_on: LocalDate, scheduled_time: String = "", place: String = "", handover: String = "bring", vendor: String = "", notes: String = "") {
        self.id = id
        self.kind = kind
        self.scheduled_on = scheduled_on
        self.scheduled_time = scheduled_time
        self.place = place
        self.handover = handover
        self.vendor = vendor
        self.notes = notes
    }

    /// "共栄持込" / "日野自動車引取".
    public var handoverLabel: String { handover == "pickup" ? "\(vendor)引取" : "共栄持込" }

    /// "10/20(火) 9:30"
    public var whenLabel: String { AppointmentText.when(scheduled_on, time: scheduled_time) }

    /// "日野厚木・共栄持込"
    public var detailLabel: String { [place, handoverLabel].filter { !$0.isEmpty }.joined(separator: "・") }

    /// Changes worth telling the driver about.
    public var noticeKey: String { "\(scheduled_on.iso)|\(scheduled_time)|\(place)|\(handover)|\(vendor)" }
}

/// 健康診断の予約.
public struct HealthAppointment: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var scheduled_on: LocalDate
    public var scheduled_time: String
    public var place: String
    public var notes: String

    public init(id: String, scheduled_on: LocalDate, scheduled_time: String = "", place: String = "", notes: String = "") {
        self.id = id
        self.scheduled_on = scheduled_on
        self.scheduled_time = scheduled_time
        self.place = place
        self.notes = notes
    }

    public var whenLabel: String { AppointmentText.when(scheduled_on, time: scheduled_time) }
    public var noticeKey: String { "\(scheduled_on.iso)|\(scheduled_time)|\(place)" }
}

public enum AppointmentText {
    public static func when(_ day: LocalDate, time: String, calendar: Calendar = .current) -> String {
        let weekday = calendar.component(.weekday, from: day.startDate(calendar: calendar)) - 1
        let name = ["日", "月", "火", "水", "木", "金", "土"][weekday]
        return "\(day.month)/\(day.day)(\(name))\(time.isEmpty ? "" : " \(time)")"
    }
}

public struct ProfileVehicle: Codable, Equatable, Sendable {
    public var plate: String
    /// "truck" / "head" / "chassis"
    public var kind: String
    public var vehicle_class: VehicleClass?
    /// Open reservations, earliest first.
    public var schedules: [VehicleAppointment]

    public init(plate: String, kind: String, vehicle_class: VehicleClass? = nil, schedules: [VehicleAppointment] = []) {
        self.plate = plate
        self.kind = kind
        self.vehicle_class = vehicle_class
        self.schedules = schedules
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        plate = try c.decode(String.self, forKey: .plate)
        kind = try c.decode(String.self, forKey: .kind)
        vehicle_class = try? c.decodeIfPresent(VehicleClass.self, forKey: .vehicle_class)
        schedules = (try? c.decodeIfPresent([VehicleAppointment].self, forKey: .schedules)) ?? []
    }

    public var kindLabel: String {
        switch kind {
        case "head": "ヘッド"
        case "chassis": "台車"
        default: "車両"
        }
    }

    /// The next reservation of each kind (nil = 予約なし).
    public func next(_ kind: VehicleAppointment.Kind) -> VehicleAppointment? {
        schedules.filter { $0.kind == kind }.min { $0.scheduled_on < $1.scheduled_on }
    }
}

public struct MyProfile: Codable, Equatable, Sendable {
    public var login_id: String
    public var full_name: String
    public var position: String?
    public var hire_date: String?
    public var vehicle_class: VehicleClass?
    public var vehicle: ProfileVehicle?
    public var chassis: ProfileVehicle?
    /// The next 健康診断 reservation.
    public var health_check: HealthAppointment?
    public var last_health_check: String?

    public init(login_id: String, full_name: String = "", position: String? = nil, hire_date: String? = nil, vehicle_class: VehicleClass? = nil,
                vehicle: ProfileVehicle? = nil, chassis: ProfileVehicle? = nil, health_check: HealthAppointment? = nil, last_health_check: String? = nil) {
        self.login_id = login_id
        self.full_name = full_name
        self.position = position
        self.hire_date = hire_date
        self.vehicle_class = vehicle_class
        self.vehicle = vehicle
        self.chassis = chassis
        self.health_check = health_check
        self.last_health_check = last_health_check
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

/// 予約の通知: what to tell the driver when a reservation is added or moved.
public enum AppointmentNotice {
    public struct Item: Equatable, Sendable {
        public var id: String
        public var key: String
        public var day: LocalDate
        public var message: String
    }

    /// Every open reservation of the profile, as notices.
    public static func items(of profile: MyProfile) -> [Item] {
        var items: [Item] = []
        for vehicle in profile.vehicles {
            for a in vehicle.schedules {
                items.append(Item(id: a.id, key: a.noticeKey, day: a.scheduled_on,
                                  message: "\(a.kind.label)（\(vehicle.plate)）：\(a.whenLabel)\(a.detailLabel.isEmpty ? "" : " \(a.detailLabel)")"))
            }
        }
        if let h = profile.health_check {
            items.append(Item(id: h.id, key: h.noticeKey, day: h.scheduled_on,
                              message: "健康診断：\(h.whenLabel)\(h.place.isEmpty ? "" : " \(h.place)")"))
        }
        return items
    }

    /// New or changed since `seen` (id → key). With nothing seen yet (first
    /// launch) everything is recorded silently.
    public static func changes(_ items: [Item], seen: [String: String]?) -> [Item] {
        guard let seen else { return [] }
        return items.filter { seen[$0.id] != $0.key }
    }
}
