import Foundation
import Testing
@testable import KyoeiCore

@Suite struct SelfReviewTests {
    let json = #"{"period":"2026-09-01","deadline":"2026-10-15","is_open":true,"template":{"purpose_question":"「何のために」","items":["1","2","3","4","5","6","7","8","9","10"],"goal_questions":["a","b","c","d"],"reflection_questions":["e","f","g","h"],"deadline_day":15},"review":{"vehicle_class":"heavy","purpose":"家族","self_scores":[3,3,2,2,1,1,0,0,3,3],"goals":["a","b","c","d"],"reflections":["e","f","g","h"],"missing_inspection_days":["2026-09-10"],"submitted_at":"2026-10-02T09:00:00+09:00"},"result":{"status":"final","total":80,"allowance":25000}}"#

    @Test func decodesMySheet() throws {
        let sheet = try JSONDecoder().decode(MySelfReview.self, from: Data(json.utf8))
        #expect(sheet.title == "9月分" && sheet.goalTitle == "2026年10月の目標" && sheet.reflectionTitle == "9月の反省や良かった事")
        #expect(sheet.review?.missing_inspection_days == [LocalDate(year: 2026, month: 9, day: 10)])
        #expect(sheet.result == ReviewResult(status: .final, total: 80, allowance: 25000))
        let december = try JSONDecoder().decode(MySelfReview.self, from: Data(json.replacingOccurrences(of: "\"period\":\"2026-09-01\"", with: "\"period\":\"2026-12-01\"").utf8))
        #expect(december.goalTitle == "2027年1月の目標")
        let empty = try JSONDecoder().decode(MySelfReview.self, from: Data(#"{"period":"2026-09-01","deadline":null,"is_open":false,"template":{"purpose_question":"q","items":["1","2","3","4","5","6","7","8","9","10"],"goal_questions":["a","b","c","d"],"reflection_questions":["e","f","g","h"],"deadline_day":15},"review":null,"result":{"status":"pending"}}"#.utf8))
        #expect(empty.review == nil && empty.result.status == .pending)
    }

    @Test func rules() {
        let full: [Int?] = Array(repeating: 2, count: 10)
        #expect(SelfReviewRules.problem(purpose: "x", scores: full, goals: ["a", "b", "c", "d"], reflections: ["e", "f", "g", "h"]) == nil)
        #expect(SelfReviewRules.problem(purpose: " ", scores: full, goals: ["a", "b", "c", "d"], reflections: ["e", "f", "g", "h"]) == "項目0を入力してください。")
        var partial = full
        partial[4] = nil
        #expect(SelfReviewRules.problem(purpose: "x", scores: partial, goals: ["a", "b", "c", "d"], reflections: ["e", "f", "g", "h"]) == "項目1〜10をすべて採点してください。")
        #expect(SelfReviewRules.problem(purpose: "x", scores: full, goals: ["a", "", "c", "d"], reflections: ["e", "f", "g", "h"]) == "目標を4つとも入力してください。")
        #expect(SelfReviewRules.subtotal(partial) == 18)
        #expect(ReviewMark.allCases.map(\.symbol) == ["◎", "○", "△", "×"])
    }

    @Test func missingInspectionDaysInTheMonthOnly() {
        let d = { (m: Int, day: Int) in LocalDate(year: 2026, month: m, day: day) }
        let missing = SelfReviewRules.missingInspectionDays(period: d(9, 1), workdays: [d(9, 3), d(9, 2), d(9, 4), d(10, 1)], inspected: [d(9, 3)])
        #expect(missing == [d(9, 2), d(9, 4)])
    }
}
