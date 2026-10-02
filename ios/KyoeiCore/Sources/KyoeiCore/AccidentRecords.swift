import Foundation

// 無事故カレンダー: accident_records, accident_categories and the monthly
// goal history. Ports of accident-calendar-view.tsx, accident-yearly-view.tsx
// and accident-category-select.tsx.

public struct AccidentRecordRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, occurred_on, vehicle_class, location, description, category"

    public var id: String
    public var occurred_on: String
    public var vehicle_class: String
    public var location: String
    public var description: String
    public var category: String

    public var date: LocalDate? { LocalDate(iso: occurred_on) }
}

public struct AccidentCategoryRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, sort_order"

    public var id: String
    public var name: String
    public var sort_order: Int
}

public struct GoalHistoryRow: Codable, Equatable, Sendable {
    public var goal_id: String
    public var month: String
    public var content: String
}

/// The add/edit form. A record needs a date plus a 車格 or 事故内容 — the date
/// alone (it defaults to today) would let a blank 保存 create a phantom record.
public struct AccidentDraft: Equatable, Sendable {
    public var occurredOn: LocalDate
    public var category = ""
    public var vehicleClass = ""
    public var location = ""
    public var description = ""

    public init(occurredOn: LocalDate, category: String = "", vehicleClass: String = "", location: String = "", description: String = "") {
        self.occurredOn = occurredOn
        self.category = category
        self.vehicleClass = vehicleClass
        self.location = location
        self.description = description
    }

    public init(row: AccidentRecordRow, fallbackDate: LocalDate) {
        self.init(occurredOn: row.date ?? fallbackDate, category: row.category, vehicleClass: row.vehicle_class,
                  location: row.location, description: row.description)
    }

    public var canSaveNew: Bool {
        !vehicleClass.trimmingCharacters(in: .whitespaces).isEmpty
            || !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

public enum AccidentStats {
    public static let uncategorized = "未分類"

    public static func countsByDate(_ rows: [AccidentRecordRow]) -> [LocalDate: Int] {
        rows.compactMap(\.date).reduce(into: [:]) { $0[$1, default: 0] += 1 }
    }

    public static func rows(_ rows: [AccidentRecordRow], on day: LocalDate) -> [AccidentRecordRow] {
        rows.filter { $0.date == day }
    }

    public static func rows(_ rows: [AccidentRecordRow], in month: YearMonth) -> [AccidentRecordRow] {
        rows.filter { $0.date.map { YearMonth(year: $0.year, month: $0.month) == month } ?? false }
    }

    public static func rows(_ rows: [AccidentRecordRow], inYear year: Int) -> [AccidentRecordRow] {
        rows.filter { $0.date?.year == year }
    }

    /// 1...12 → count for the year.
    public static func countsByMonth(_ rows: [AccidentRecordRow], year: Int) -> [Int: Int] {
        self.rows(rows, inYear: year).compactMap(\.date?.month).reduce(into: [:]) { $0[$1, default: 0] += 1 }
    }

    public static func countsByCategory(_ rows: [AccidentRecordRow], year: Int) -> [String: Int] {
        self.rows(rows, inYear: year).reduce(into: [:]) { $0[$1.category.isEmpty ? uncategorized : $1.category, default: 0] += 1 }
    }

    /// Registered categories in order, plus 未分類 when that year has any.
    public static func categoryNames(_ categories: [AccidentCategoryRow], counts: [String: Int]) -> [String] {
        var names = categories.sorted { $0.sort_order < $1.sort_order }.map(\.name)
        if counts[uncategorized] != nil && !names.contains(uncategorized) { names.append(uncategorized) }
        return names
    }

    public enum YearSelection: Equatable, Sendable {
        case month(Int)
        case category(String)
    }

    public static func rows(_ rows: [AccidentRecordRow], year: Int, selection: YearSelection) -> [AccidentRecordRow] {
        let yearRows = self.rows(rows, inYear: year)
        let filtered: [AccidentRecordRow] = switch selection {
        case .month(let month): yearRows.filter { $0.date?.month == month }
        case .category(let name): yearRows.filter { ($0.category.isEmpty ? uncategorized : $0.category) == name }
        }
        return filtered.sorted { $0.occurred_on < $1.occurred_on }
    }

    /// sort_order for a newly created category (after the current maximum).
    public static func nextCategoryOrder(_ categories: [AccidentCategoryRow]) -> Int {
        (categories.map(\.sort_order).max() ?? 0) + 1
    }
}
