import Foundation

// List of Location (lol_entries): delivery destinations and their stores.
// Port of components/lol-view.tsx's data rules.

public struct LolDestination: Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var category: String

    public var isAA: Bool { id == "aa" }

    public static let all: [LolDestination] = [
        .init(id: "ippan", name: "一般", category: "一般配送"),
        .init(id: "aa", name: "AA", category: "オートオークション"),
        .init(id: "kokunaisen", name: "国内船", category: "国内船 港"),
        .init(id: "yushutsu", name: "輸出", category: "輸出ヤード"),
        .init(id: "nx", name: "NX", category: "NXグループ拠点"),
        .init(id: "nagoya", name: "名古屋", category: "名古屋方面"),
    ]
}

public enum LolField: String, CaseIterable, Sendable {
    case shopName, address, phone, hours, breakTime, place, eventDay, memo, exitMethod, method, notes

    public var column: String {
        switch self {
        case .shopName: "shop_name"
        case .breakTime: "break_time"
        case .eventDay: "event_day"
        case .exitMethod: "exit_method"
        default: rawValue
        }
    }

    public func label(isAA: Bool) -> String {
        switch self {
        case .shopName: isAA ? "会場名" : "店舗名"
        case .address: "住所"
        case .phone: "電話番号"
        case .hours: "搬入出可能時間"
        case .breakTime: "休憩時間"
        case .place: "搬入場所"
        case .eventDay: "開催日"
        case .memo: "メモ"
        case .exitMethod: "搬出方法"
        case .method: "搬入方法"
        case .notes: "注意事項"
        }
    }

    public var isMultiline: Bool { [.memo, .exitMethod, .method, .notes].contains(self) }

    /// The standard template, or AA's venue template with a weekly calendar.
    public static func fields(isAA: Bool) -> [LolField] {
        isAA
            ? [.shopName, .address, .phone, .eventDay, .exitMethod, .method, .memo, .notes]
            : [.shopName, .address, .phone, .hours, .breakTime, .place, .method, .notes]
    }
}

public enum VehicleKind: String, CaseIterable, Codable, Sendable {
    case trailer, fiveLoad, compact, loader

    public var label: String {
        switch self {
        case .trailer: "トレーラー"
        case .fiveLoad: "5積み"
        case .compact: "小型"
        case .loader: "ローダー"
        }
    }
}

public enum VehicleStatus: String, CaseIterable, Codable, Sendable {
    case unset = ""
    case ok = "〇"
    case conditional = "条件あり"
    case ng = "✕"

    public var pickerLabel: String {
        switch self {
        case .unset: "未設定"
        case .ok: "〇"
        case .conditional: "△(条件あり)"
        case .ng: "✕"
        }
    }
}

/// 荷扱車格可否, stored as a JSON object keyed by vehicle kind.
public struct VehiclePermission: Codable, Equatable, Sendable {
    public struct Entry: Codable, Equatable, Sendable {
        public var status: VehicleStatus
        public var condition: String

        public init(status: VehicleStatus = .unset, condition: String = "") {
            self.status = status
            self.condition = condition
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            status = (try? c.decodeIfPresent(VehicleStatus.self, forKey: .status)) ?? .unset
            condition = (try? c.decodeIfPresent(String.self, forKey: .condition)) ?? ""
        }

        /// e.g. "〇", "△", "△(条件あり)" (condition shown separately in red).
        public var displayStatus: String {
            switch status {
            case .conditional: condition.isEmpty ? "△(条件あり)" : "△"
            default: status.rawValue
            }
        }
    }

    public var entries: [VehicleKind: Entry]

    public init(entries: [VehicleKind: Entry] = [:]) {
        self.entries = entries
    }

    public subscript(kind: VehicleKind) -> Entry {
        get { entries[kind] ?? Entry() }
        set {
            var value = newValue
            // A condition only makes sense for 条件あり.
            if value.status != .conditional { value.condition = "" }
            entries[kind] = value
        }
    }

    public var isSet: Bool { VehicleKind.allCases.contains { self[$0].status != .unset } }

    public init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode([String: Entry].self)
        entries = Dictionary(uniqueKeysWithValues: raw.compactMap { key, value in VehicleKind(rawValue: key).map { ($0, value) } })
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(Dictionary(uniqueKeysWithValues: VehicleKind.allCases.map { ($0.rawValue, self[$0]) }))
    }
}

public struct VisitedPerson: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String

    public init(id: String = UUID().uuidString.lowercased(), name: String) {
        self.id = id
        self.name = name
    }
}

/// Time-range text fields. Stored encoding: "" = 未設定, a special word
/// (〇 / 夜間OK / なし) or "H:MM〜H:MM" where either side may be blank.
public enum TimeRangeValue: Equatable, Sendable {
    case unset
    case special
    case range(start: String, end: String)

    public init(_ raw: String, special: String) {
        let t = raw.trimmingCharacters(in: .whitespaces)
        if t == special {
            self = .special
        } else if let separator = t.firstIndex(of: "〜") {
            self = .range(start: String(t[..<separator]), end: String(t[t.index(after: separator)...]))
        } else {
            self = .unset
        }
    }

    public func encoded(special: String) -> String {
        switch self {
        case .unset: ""
        case .special: special
        case .range(let start, let end): "\(start)〜\(end)"
        }
    }

    /// 0:00〜24:00 hourly plus セリ終了後 (AA calendar cells).
    public static let hourlyOptions: [String] = (0...24).map { "\($0):00" } + ["セリ終了後"]
    /// 0:00〜24:00 in 30-minute steps (搬入出可能時間 / 休憩時間).
    public static let halfHourOptions: [String] = stride(from: 0, through: 24 * 60, by: 30).map { "\($0 / 60):\(pad2($0 % 60))" }

    /// AA weekly calendar cell display: "24h", the range, or "—".
    public static func cellText(_ raw: String) -> String {
        switch TimeRangeValue(raw, special: "〇") {
        case .special: "24h"
        case .range: raw.trimmingCharacters(in: .whitespaces)
        case .unset: "—"
        }
    }
}

public struct LolEntryRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, destination_id, shop_name, address, phone, hours, break_time, place, event_day, memo, exit_method, method, notes, cal_out, cal_in, vehicle_permission, visited_by"

    public var id: String
    public var destinationID: String
    public var values: [LolField: String]
    public var calOut: [String]
    public var calIn: [String]
    public var vehiclePermission: VehiclePermission
    public var visitedBy: [VisitedPerson]

    public subscript(field: LolField) -> String { values[field] ?? "" }

    public var displayName: String { self[.shopName].isEmpty ? "（名称なし）" : self[.shopName] }

    public var hasCalendar: Bool {
        (calOut + calIn).contains { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    private struct AnyKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ string: String) { stringValue = string }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = try c.decode(String.self, forKey: AnyKey("id"))
        destinationID = try c.decode(String.self, forKey: AnyKey("destination_id"))
        var values: [LolField: String] = [:]
        for field in LolField.allCases {
            values[field] = (try? c.decodeIfPresent(String.self, forKey: AnyKey(field.column))) ?? ""
        }
        self.values = values
        calOut = Self.week((try? c.decodeIfPresent([String].self, forKey: AnyKey("cal_out"))) ?? nil)
        calIn = Self.week((try? c.decodeIfPresent([String].self, forKey: AnyKey("cal_in"))) ?? nil)
        vehiclePermission = ((try? c.decodeIfPresent(VehiclePermission.self, forKey: AnyKey("vehicle_permission"))) ?? nil) ?? VehiclePermission()
        visitedBy = ((try? c.decodeIfPresent([VisitedPerson].self, forKey: AnyKey("visited_by"))) ?? nil) ?? []
    }

    public init(id: String, destinationID: String, values: [LolField: String] = [:], calOut: [String] = Self.emptyWeek,
                calIn: [String] = Self.emptyWeek, vehiclePermission: VehiclePermission = .init(), visitedBy: [VisitedPerson] = []) {
        self.id = id
        self.destinationID = destinationID
        self.values = values
        self.calOut = calOut
        self.calIn = calIn
        self.vehiclePermission = vehiclePermission
        self.visitedBy = visitedBy
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.encode(id, forKey: AnyKey("id"))
        try c.encode(destinationID, forKey: AnyKey("destination_id"))
        for field in LolField.allCases { try c.encode(self[field], forKey: AnyKey(field.column)) }
        try c.encode(calOut, forKey: AnyKey("cal_out"))
        try c.encode(calIn, forKey: AnyKey("cal_in"))
        try c.encode(vehiclePermission, forKey: AnyKey("vehicle_permission"))
        try c.encode(visitedBy, forKey: AnyKey("visited_by"))
    }

    public static let emptyWeek = Array(repeating: "", count: 7)

    static func week(_ values: [String]?) -> [String] {
        guard let values else { return emptyWeek }
        return (0..<7).map { values.indices.contains($0) ? values[$0] : "" }
    }
}

/// The add/edit form. AA saves its weekly calendar; other destinations save
/// 荷扱車格 and 既訪者 instead.
public struct LolEntryDraft: Equatable, Sendable {
    public var values: [LolField: String] = [:]
    public var calOut = LolEntryRow.emptyWeek
    public var calIn = LolEntryRow.emptyWeek
    public var vehiclePermission = VehiclePermission()
    public var visitedBy: [VisitedPerson] = []

    public init() {}

    public init(_ row: LolEntryRow) {
        values = row.values
        calOut = row.calOut
        calIn = row.calIn
        vehiclePermission = row.vehiclePermission
        visitedBy = row.visitedBy
    }

    public subscript(field: LolField) -> String {
        get { values[field] ?? "" }
        set { values[field] = newValue }
    }

    public var canSave: Bool { !self[.shopName].trimmingCharacters(in: .whitespaces).isEmpty }

    public mutating func addVisitor(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        visitedBy.append(VisitedPerson(name: trimmed))
    }
}

/// Insert/update payload (keys depend on whether the destination is AA).
public struct LolEntryPayload: Encodable, Sendable {
    let destinationID: String
    let draft: LolEntryDraft
    let isAA: Bool

    public init(destinationID: String, draft: LolEntryDraft) {
        self.destinationID = destinationID
        self.draft = draft
        isAA = destinationID == "aa"
    }

    private struct Key: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(_ s: String) { stringValue = s }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Key.self)
        try c.encode(destinationID, forKey: Key("destination_id"))
        for field in LolField.allCases {
            try c.encode(draft[field].trimmingCharacters(in: .whitespacesAndNewlines), forKey: Key(field.column))
        }
        if isAA {
            try c.encode(draft.calOut.map { $0.trimmingCharacters(in: .whitespaces) }, forKey: Key("cal_out"))
            try c.encode(draft.calIn.map { $0.trimmingCharacters(in: .whitespaces) }, forKey: Key("cal_in"))
        } else {
            try c.encode(draft.vehiclePermission, forKey: Key("vehicle_permission"))
            try c.encode(draft.visitedBy, forKey: Key("visited_by"))
        }
    }
}

public enum ListOfLocation {
    private static let ja = Locale(identifier: "ja_JP")

    /// Entries per destination, sorted by store name.
    public static func entriesByDestination(_ rows: [LolEntryRow]) -> [String: [LolEntryRow]] {
        Dictionary(grouping: rows, by: \.destinationID).mapValues {
            $0.sorted { $0[.shopName].compare($1[.shopName], locale: ja) == .orderedAscending }
        }
    }

    /// Entries matching on any text field, calendar cell, or their
    /// destination's name/category (kana-aware), across all destinations.
    public static func search(_ query: String, rows: [LolEntryRow], using search: KanaSearch = .shared) -> [(destination: LolDestination, entry: LolEntryRow)] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        let byDestination = entriesByDestination(rows)
        return LolDestination.all.flatMap { destination -> [(LolDestination, LolEntryRow)] in
            let destinationMatches = search.matches(destination.name, query: q) || search.matches(destination.category, query: q)
            return (byDestination[destination.id] ?? []).filter { entry in
                destinationMatches
                    || LolField.allCases.contains { search.matches(entry[$0], query: q) }
                    || (entry.calOut + entry.calIn).contains { search.matches($0, query: q) }
            }.map { (destination, $0) }
        }
    }
}
