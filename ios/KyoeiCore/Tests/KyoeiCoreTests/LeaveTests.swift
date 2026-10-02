import Foundation
import Testing
@testable import KyoeiCore

@Suite struct LeaveTests {
    let today = LocalDate(year: 2026, month: 10, day: 3)

    @Test func decodesMyLeave() throws {
        let json = #"{"notice_days":7,"is_checker":true,"balance":{"available":21,"pending":2,"over":0,"next_expiry":{"on":"2027-02-02","days":9}},"requests":[{"id":"a","filed_on":"2026-10-03","start_on":"2026-10-13","end_on":"2026-10-14","days":2,"category":"hospital","detail":"歯医者","paid":true,"confirmed_at":"2026-10-04T09:00:00+09:00","confirmed_by_name":"担当","withdrawn_at":null},{"id":"b","filed_on":"2026-10-03","start_on":"2026-10-20","end_on":"2026-10-20","days":1,"category":"personal","detail":"","paid":false,"confirmed_at":null,"confirmed_by_name":null,"withdrawn_at":null}],"exceptions":[{"start_on":"2026-10-05","end_on":"2026-10-05","note":"相談済み"}]}"#
        let leave = try JSONDecoder().decode(MyLeave.self, from: Data(json.utf8))
        #expect(leave.balance.free == 21 && leave.is_checker)
        #expect(leave.requests[0].status == .confirmed && leave.requests[0].periodLabel == "10月13日〜10月14日" && leave.requests[0].categoryLabel == "通院（歯医者）")
        #expect(leave.requests[1].isEditable && leave.requests[1].periodLabel == "10月20日")
        #expect(leave.confirmedDays == [LocalDate(year: 2026, month: 10, day: 13), LocalDate(year: 2026, month: 10, day: 14)])
    }

    @Test func clientRules() {
        let d = { (day: Int) in LocalDate(year: 2026, month: 10, day: day) }
        func problem(_ s: Int, _ e: Int, category: LeaveCategory = .personal, detail: String = "", paid: Bool = false, free: Int = 10, full: Set<LocalDate> = [], exceptions: [LeaveException] = []) -> String? {
            LeaveRules.problem(start: d(s), end: d(e), today: today, noticeDays: 7, exceptions: exceptions, category: category, detail: detail, paid: paid, freePaidDays: free, full: full, calendar: tokyo)
        }
        #expect(problem(10, 11) == nil)
        #expect(problem(9, 9)?.hasPrefix("7日より先") == true)
        #expect(problem(5, 5, exceptions: [LeaveException(start_on: d(5), end_on: d(5), note: "")]) == nil)
        #expect(problem(12, 12, full: [d(12)])?.contains("上限") == true)
        #expect(problem(12, 12, category: .hospital) == "通院の内容を入力してください。")
        #expect(problem(10, 12, paid: true, free: 2) == "有給の残り日数が足りません。")
        #expect(problem(12, 10) == "終わりの日は、始まりの日以降にしてください。")
        #expect(LeaveRules.days(from: d(10), to: d(12), calendar: tokyo) == 3)
        #expect(LeaveRules.code(fromError: "leave:full") == "full")
        #expect(LeaveRules.code(fromError: "boom") == nil)
    }
}
