import Foundation
import Testing
@testable import KyoeiCore

@Suite struct AccidentRecordsTests {
    func record(_ id: String, _ day: String, category: String = "", vehicle: String = "") -> AccidentRecordRow {
        AccidentRecordRow(id: id, occurred_on: day, vehicle_class: vehicle, location: "", description: "", category: category)
    }

    let rows = [
        AccidentRecordRow(id: "a", occurred_on: "2026-03-05", vehicle_class: "", location: "", description: "", category: "接触"),
        AccidentRecordRow(id: "b", occurred_on: "2026-03-05", vehicle_class: "", location: "", description: "", category: ""),
        AccidentRecordRow(id: "c", occurred_on: "2026-01-20", vehicle_class: "", location: "", description: "", category: "接触"),
        AccidentRecordRow(id: "d", occurred_on: "2025-12-31", vehicle_class: "", location: "", description: "", category: "自損"),
    ]

    @Test func monthlyCounts() {
        #expect(AccidentStats.countsByDate(rows)[LocalDate(iso: "2026-03-05")!] == 2)
        #expect(AccidentStats.rows(rows, on: LocalDate(iso: "2026-01-20")!).map(\.id) == ["c"])
        #expect(AccidentStats.rows(rows, in: YearMonth(year: 2026, month: 3)).map(\.id) == ["a", "b"])
    }

    @Test func yearlyCountsAndCategories() {
        #expect(AccidentStats.countsByMonth(rows, year: 2026) == [3: 2, 1: 1])
        let counts = AccidentStats.countsByCategory(rows, year: 2026)
        #expect(counts == ["接触": 2, "未分類": 1])
        let categories = [AccidentCategoryRow(id: "1", name: "自損", sort_order: 2), AccidentCategoryRow(id: "2", name: "接触", sort_order: 1)]
        #expect(AccidentStats.categoryNames(categories, counts: counts) == ["接触", "自損", "未分類"])
        #expect(AccidentStats.categoryNames(categories, counts: ["接触": 1]) == ["接触", "自損"])
        #expect(AccidentStats.rows(rows, year: 2026, selection: .category("未分類")).map(\.id) == ["b"])
        #expect(AccidentStats.rows(rows, year: 2026, selection: .month(3)).map(\.id) == ["a", "b"])
        #expect(AccidentStats.rows(rows, year: 2026, selection: .category("接触")).map(\.id) == ["c", "a"])
        #expect(AccidentStats.nextCategoryOrder(categories) == 3)
        #expect(AccidentStats.nextCategoryOrder([]) == 1)
    }

    @Test func draftNeedsContent() {
        let today = LocalDate(year: 2026, month: 9, day: 1)
        #expect(!AccidentDraft(occurredOn: today).canSaveNew)
        #expect(AccidentDraft(occurredOn: today, vehicleClass: "中型").canSaveNew)
        #expect(AccidentDraft(occurredOn: today, description: "接触").canSaveNew)
        #expect(AccidentDraft(row: record("x", "bad-date"), fallbackDate: today).occurredOn == today)
    }
}
