import Foundation

// MARK: - おしらせ (news_posts)

public struct NewsPostRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, title, category, content, author, created_at"

    public var id: String
    public var title: String
    public var category: String
    public var content: String
    public var author: String
    public var created_at: String

    public var createdAt: Date? { DBTimestamp.parse(created_at) }

    /// e.g. "2026年9月1日"
    public func dateLabel(calendar: Calendar = .current) -> String {
        createdAt.map { formatClock($0, calendar: calendar).date } ?? ""
    }
}

/// Tracks the newest news_posts.created_at this device has announced, so
/// posts made while the app wasn't watching are caught up on (and no post
/// is announced twice). Port of lib/notifications/news-last-seen.ts.
public struct NewsSeenTracker: Codable, Equatable, Sendable {
    public private(set) var lastSeen: String?

    public init(lastSeen: String? = nil) {
        self.lastSeen = lastSeen
    }

    /// First run: don't announce the entire pre-existing history.
    public mutating func initializeIfNeeded(now: Date = Date()) {
        if lastSeen == nil { lastSeen = DBTimestamp.format(now) }
    }

    /// Records a post; returns true if it is newer than anything seen so far.
    public mutating func observe(createdAt: String) -> Bool {
        guard let current = lastSeen.flatMap(DBTimestamp.parse), let candidate = DBTimestamp.parse(createdAt) else {
            if lastSeen == nil { lastSeen = createdAt }
            return lastSeen == createdAt
        }
        guard candidate > current else { return false }
        lastSeen = createdAt
        return true
    }
}

// MARK: - ヤード配置 (yards / yard_rows / yard_destinations / registry)

public struct YardRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, sort_order, updated_at"

    public var id: String
    public var name: String
    public var sort_order: Int
    public var updated_at: String
}

/// A position inside a yard; may be assigned several destinations.
public struct YardPositionRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, yard_id, label, destinations, sort_order, updated_at"

    public var id: String
    public var yard_id: String
    public var label: String
    public var destinations: [String]
    public var sort_order: Int
    public var updated_at: String

    private enum CodingKeys: String, CodingKey {
        case id, yard_id, label, destinations, sort_order, updated_at
    }

    public init(id: String, yard_id: String, label: String, destinations: [String], sort_order: Int, updated_at: String) {
        self.id = id
        self.yard_id = yard_id
        self.label = label
        self.destinations = destinations
        self.sort_order = sort_order
        self.updated_at = updated_at
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        yard_id = try c.decode(String.self, forKey: .yard_id)
        label = try c.decodeIfPresent(String.self, forKey: .label) ?? ""
        destinations = try c.decodeIfPresent([String].self, forKey: .destinations) ?? []
        sort_order = try c.decode(Int.self, forKey: .sort_order)
        updated_at = try c.decode(String.self, forKey: .updated_at)
    }
}

public struct YardDestinationRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, sort_order"

    public var id: String
    public var name: String
    public var sort_order: Int
}

public struct DestinationTitleRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, title, sort_order"

    public var id: String
    public var title: String
    public var sort_order: Int
}

public struct DestinationStoreRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, title_id, name"
    /// The registry editor also needs the manual order.
    public static let registryColumns = "id, title_id, name, sort_order"

    public var id: String
    public var title_id: String
    public var name: String
    public var sort_order: Int? = nil
}

public enum YardLayout {
    public static func positionsByYard(_ rows: [YardPositionRow]) -> [String: [YardPositionRow]] {
        Dictionary(grouping: rows, by: \.yard_id).mapValues { $0.sorted { $0.sort_order < $1.sort_order } }
    }

    /// Newest updated_at across yards and positions.
    public static func latestUpdate(yards: [YardRow], positions: [YardPositionRow]) -> Date? {
        (yards.map(\.updated_at) + positions.map(\.updated_at)).compactMap(DBTimestamp.parse).max()
    }

    /// 更新済み vs 未更新: compared by local calendar day, so it flips at midnight.
    public static func isUpdatedToday(_ latest: Date, now: Date = Date(), calendar: Calendar = .current) -> Bool {
        calendar.isDate(latest, inSameDayAs: now)
    }

    /// A new position needs a label or at least one destination.
    public static func canAddPosition(label: String, destinations: [String]) -> Bool {
        !label.trimmingCharacters(in: .whitespaces).isEmpty || !destinations.isEmpty
    }

    public static func toggling(_ name: String, in destinations: [String]) -> [String] {
        destinations.contains(name) ? destinations.filter { $0 != name } : destinations + [name]
    }

    /// Positions whose destination list must follow a renamed destination,
    /// with their updated lists, so assignments never silently detach.
    public static func renaming(_ old: String, to new: String, in positions: [YardPositionRow]) -> [(id: String, destinations: [String])] {
        guard old != new else { return [] }
        return positions
            .filter { $0.destinations.contains(old) }
            .map { ($0.id, $0.destinations.map { $0 == old ? new : $0 }) }
    }

    /// 移動先検索: registered stores whose name matches (kana-aware), with their title.
    public static func search(
        _ query: String,
        stores: [DestinationStoreRow],
        titles: [DestinationTitleRow],
        using search: KanaSearch = .shared
    ) -> [(store: DestinationStoreRow, title: String)]? {
        guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
        let titleByID = Dictionary(titles.map { ($0.id, $0.title) }, uniquingKeysWith: { first, _ in first })
        return stores
            .filter { search.matches($0.name, query: query) }
            .map { ($0, titleByID[$0.title_id] ?? "不明") }
    }

    /// Destination picker order (Japanese collation).
    public static func sortedDestinations(_ rows: [YardDestinationRow]) -> [YardDestinationRow] {
        rows.sorted { $0.name.compare($1.name, locale: Locale(identifier: "ja_JP")) == .orderedAscending }
    }
}
