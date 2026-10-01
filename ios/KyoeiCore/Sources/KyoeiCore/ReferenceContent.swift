import Foundation

// Read-mostly reference pages under メニュー. Ports of lol-map-view.tsx and
// high-value-cars-view.tsx.

// MARK: - LoL MAP

public struct MapLink: Equatable, Sendable {
    public var label: String
    public var url: URL
}

public enum LolMap {
    public static let links: [MapLink] = [
        ("共栄ヤード", "https://www.google.com/maps/d/u/0/edit?mid=1gK_FO4O8IilIlm0RgY_cjm2c5ofPzjw&usp=sharing"),
        ("LoL", "https://www.google.com/maps/d/u/0/edit?mid=18TvmwVsmK7OJCelhGjqScBkIlxpXX34&usp=sharing"),
        ("港関連", "https://www.google.com/maps/d/u/0/edit?mid=1xC-jEXbKqoHTB8kWKHA9v7uvMAYsxAE&usp=sharing"),
        ("ネクステージ", "https://www.google.com/maps/d/u/0/edit?mid=1towXDSLY8DJnDkonPUDXMZX-wRPSY5M&usp=sharing"),
        ("スタンド", "https://www.google.com/maps/d/u/0/edit?mid=1jSdhl_c-DsHOQIQFxbZfKkjyvnuXC1I&usp=sharing"),
    ].map { MapLink(label: $0.0, url: URL(string: $0.1)!) }
}

// MARK: - 高額車一覧 (high_value_cars)

public struct HighValueCarRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, maker, model_name, model_code, memo"
    public static let unsetMaker = "メーカー未設定"

    public var id: String
    public var maker: String
    public var model_name: String
    public var model_code: String
    public var memo: String

    public var makerGroup: String {
        let trimmed = maker.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? Self.unsetMaker : trimmed
    }

    public var displayName: String { model_name.isEmpty ? "（車種名なし）" : model_name }
}

public struct HighValueCarDraft: Equatable, Sendable {
    public var maker = ""
    public var modelName = ""
    public var modelCode = ""
    public var memo = ""

    public init(maker: String = "", modelName: String = "", modelCode: String = "", memo: String = "") {
        self.maker = maker
        self.modelName = modelName
        self.modelCode = modelCode
        self.memo = memo
    }

    public init(_ row: HighValueCarRow) {
        self.init(maker: row.maker, modelName: row.model_name, modelCode: row.model_code, memo: row.memo)
    }

    /// Needs a maker or a model name.
    public var canSave: Bool {
        !maker.trimmingCharacters(in: .whitespaces).isEmpty || !modelName.trimmingCharacters(in: .whitespaces).isEmpty
    }
}

public enum HighValueCars {
    private static let ja = Locale(identifier: "ja_JP")

    /// Makers in Japanese collation order with their car counts.
    public static func makers(_ cars: [HighValueCarRow]) -> [(maker: String, count: Int)] {
        Dictionary(grouping: cars, by: \.makerGroup)
            .map { ($0.key, $0.value.count) }
            .sorted { $0.0.compare($1.0, locale: ja) == .orderedAscending }
    }

    /// One maker's cars sorted by model name.
    public static func models(of maker: String, in cars: [HighValueCarRow]) -> [HighValueCarRow] {
        cars.filter { $0.makerGroup == maker }
            .sorted { $0.model_name.compare($1.model_name, locale: ja) == .orderedAscending }
    }

    /// Kana-aware match on maker, model name, 型式 or memo.
    public static func search(_ query: String, in cars: [HighValueCarRow], using search: KanaSearch = .shared) -> [HighValueCarRow] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return [] }
        return cars.filter {
            search.matches($0.maker, query: q) || search.matches($0.model_name, query: q)
                || search.matches($0.model_code, query: q) || search.matches($0.memo, query: q)
        }
    }
}
