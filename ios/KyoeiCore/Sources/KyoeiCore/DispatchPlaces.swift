import Foundation

// 似た名前の場所: a sheet can write one place two ways (「東西海運 あおなみヤード」
// and 「東西海運 あおなみヤード(愛知)」). Each such pair is asked once
// (「○○と○○は同じ場所ですか？」); the answers are the driver's own
// (dispatch_place_aliases) and apply to every sheet, so 回戦まとめ groups the
// two spellings as one route.

/// One answer: whether `name_a` and `name_b` are the same place. The pair is
/// stored in sorted order so either spelling finds it.
public struct PlaceAliasRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name_a, name_b, same"

    public var id: String
    public var name_a: String
    public var name_b: String
    public var same: Bool

    public init(id: String, name_a: String, name_b: String, same: Bool) {
        self.id = id
        self.name_a = name_a
        self.name_b = name_b
        self.same = same
    }

    public var pair: PlacePair { PlacePair(name_a, name_b) }
}

public struct PlaceAliasInsert: Encodable, Equatable, Sendable {
    public var name_a: String
    public var name_b: String
    public var same: Bool

    public init(_ pair: PlacePair, same: Bool) {
        name_a = pair.first
        name_b = pair.second
        self.same = same
    }
}

/// Two spellings, in a fixed (sorted) order.
public struct PlacePair: Hashable, Identifiable, Sendable {
    public let first: String
    public let second: String

    public init(_ a: String, _ b: String) {
        (first, second) = a <= b ? (a, b) : (b, a)
    }

    public var id: String { first + "\u{1F}" + second }
}

public enum PlaceNames {
    /// The shorter name must be at least this long for a prefix to count.
    static let minimumPrefix = 4

    /// Compared form: NFKC, no spaces, no parenthesized notes like 「(愛知)」.
    public static func key(_ name: String) -> String {
        let folded = name.precomposedStringWithCompatibilityMapping
        let withoutNotes = folded.replacing(/\([^()]*\)|【[^【】]*】|［[^［］]*］/, with: "")
        return String(withoutNotes.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) }.map(Character.init))
    }

    /// Different spellings that look like one place: equal once spaces and
    /// notes are dropped, or one is the other plus a suffix.
    public static func similar(_ a: String, _ b: String) -> Bool {
        guard a != b else { return false }
        let ka = key(a), kb = key(b)
        guard !ka.isEmpty, !kb.isEmpty else { return false }
        if ka == kb { return true }
        let (short, long) = ka.count <= kb.count ? (ka, kb) : (kb, ka)
        return short.count >= minimumPrefix && long.hasPrefix(short)
    }

    /// Every 積地・降地 on the sheet, in sheet order.
    public static func places(in content: DispatchSheetContent) -> [String] {
        var seen: [String] = []
        for vehicle in content.vehicles {
            for place in [vehicle.pickup, vehicle.dropoff] where !place.isEmpty && !seen.contains(place) {
                seen.append(place)
            }
        }
        return seen
    }

    /// Similar pairs on the sheet that haven't been answered yet, in sheet order.
    public static func unansweredPairs(in content: DispatchSheetContent, answers: [PlaceAliasRow]) -> [PlacePair] {
        let answered = Set(answers.map(\.pair))
        let places = places(in: content)
        var pairs: [PlacePair] = []
        for (i, a) in places.enumerated() {
            for b in places[(i + 1)...] where similar(a, b) {
                let pair = PlacePair(a, b)
                if !answered.contains(pair) { pairs.append(pair) }
            }
        }
        return pairs
    }
}

/// The 「同じ場所」 answers as a lookup: each name → the spelling shown for
/// its group (the one that comes first on the sheet).
public struct PlaceAliases: Equatable, Sendable {
    private var canonical: [String: String] = [:]

    public init() {}

    public init(_ rows: [PlaceAliasRow], order: [String]) {
        // Union-find over the 「同じ」 pairs.
        var parent: [String: String] = [:]
        func root(_ name: String) -> String {
            var node = name
            while let next = parent[node], next != node { node = next }
            return node
        }
        for row in rows where row.same {
            let ra = root(row.name_a), rb = root(row.name_b)
            if ra != rb { parent[ra] = rb }
        }
        let rank = Dictionary(order.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
        var groups: [String: [String]] = [:]
        for name in Set(rows.filter(\.same).flatMap { [$0.name_a, $0.name_b] }) {
            groups[root(name), default: []].append(name)
        }
        for members in groups.values {
            let shown = members.min { (rank[$0] ?? .max, $0) < (rank[$1] ?? .max, $1) }!
            for name in members { canonical[name] = shown }
        }
    }

    public func name(for place: String) -> String { canonical[place] ?? place }
}

extension DispatchRound {
    /// Vehicles grouped by 積地 → 降地, treating spellings answered as the same
    /// place as one (shown with the group's first spelling).
    public func routes(aliases: PlaceAliases) -> [DispatchRoute] {
        var order: [String] = []
        var groups: [String: [DispatchVehicle]] = [:]
        for vehicle in vehicles {
            let key = aliases.name(for: vehicle.pickup) + "\u{1F}" + aliases.name(for: vehicle.dropoff)
            if groups[key] == nil { order.append(key) }
            groups[key, default: []].append(vehicle)
        }
        return order.map { key in
            let members = groups[key]!
            return DispatchRoute(pickup: aliases.name(for: members[0].pickup), dropoff: aliases.name(for: members[0].dropoff), vehicles: members)
        }
    }
}
