import Foundation
import Testing
@testable import KyoeiCore

@Suite struct RedPlateTests {
    @Test func decodesBoardAndHistory() throws {
        let board = #"[{"plate_id":"p1","region":"相模","number":"4218","note":"","sort_order":10,"use_id":"u1","user_id":"ABC","holder_name":"共栄 太郎","taken_at":"2026-10-03T08:00:00+09:00","destination":"USS東京"},{"plate_id":"p2","region":"相模","number":"3987","note":"","sort_order":20,"use_id":null,"user_id":null,"holder_name":null,"taken_at":null,"destination":null}]"#
        let rows = try JSONDecoder().decode([RedPlateBoardRow].self, from: Data(board.utf8))
        #expect(rows[0].label == "相模 4218" && rows[0].isOut && !rows[1].isOut)
        #expect(rows[0].isHeld(by: "abc") && !rows[1].isHeld(by: "abc") && !rows[0].isHeld(by: nil))
        #expect(RedPlateBoard.mine(rows, userID: "abc").map(\.number) == ["4218"])
        #expect(RedPlateBoard.counts(rows) == (1, 1))

        let history = #"[{"use_id":"u1","user_id":"x","user_name":"共栄 太郎","taken_at":"2026-10-03T08:00:00+09:00","destination":"USS東京","returned_at":"2026-10-03T17:30:00+09:00","returned_by_name":"共栄 太郎","return_method":"app"}]"#
        let uses = try JSONDecoder().decode([RedPlateUse].self, from: Data(history.utf8))
        #expect(uses[0].returnMethodLabel == "アプリで返却" && uses[0].returnedAt != nil)
    }

    @Test func elapsedLabel() {
        let start = Date(timeIntervalSince1970: 0)
        #expect(RedPlateBoard.elapsed(since: start, now: start.addingTimeInterval(125 * 60)) == "2時間05分")
        #expect(RedPlateBoard.elapsed(since: start, now: start.addingTimeInterval(26 * 3600)) == "1日2時間")
        #expect(RedPlateBoard.elapsed(since: start, now: start.addingTimeInterval(-60)) == "0時間00分")
    }
}
