import Foundation
import Testing
@testable import KyoeiCore

@Suite struct AwardTests {
    @Test func statusFromRows() throws {
        let none = try JSONDecoder().decode([AwardVoteRow].self, from: Data(#"[{"period":"2026-09-01","is_open":true,"closes_on":"2026-10-15","nominee_id":null,"nominee_name":null,"reason":null}]"#.utf8))
        let empty = AwardStatus(rows: none)
        #expect(empty.title == "9月の社長賞" && empty.needsReminder && !empty.hasVoted)
        #expect(empty.closesOn == LocalDate(year: 2026, month: 10, day: 15))

        let voted = try JSONDecoder().decode([AwardVoteRow].self, from: Data(#"[{"period":"2026-09-01","is_open":true,"closes_on":"2026-10-15","nominee_id":"a","nominee_name":"山田","reason":"新人指導"}]"#.utf8))
        #expect(!AwardStatus(rows: voted).needsReminder)
        #expect(AwardStatus(rows: voted).votes == [AwardVote(nominee: "a", nomineeName: "山田", reason: "新人指導")])

        let closed = try JSONDecoder().decode([AwardVoteRow].self, from: Data(#"[{"period":"2026-09-01","is_open":false,"closes_on":"2026-10-15","nominee_id":null,"nominee_name":null,"reason":null}]"#.utf8))
        #expect(!AwardStatus(rows: closed).needsReminder)
    }

    @Test func ballotRules() {
        let a = AwardVote(nominee: "A", reason: "x"), b = AwardVote(nominee: "B", reason: "y"), c = AwardVote(nominee: "C", reason: "z")
        #expect(AwardBallot.problem([a, b, c], required: 3, me: "me") == nil)
        #expect(AwardBallot.problem([a, b, nil], required: 3, me: "me") == "3人を選んでください。")
        #expect(AwardBallot.problem([a, b, AwardVote(nominee: "me", reason: "z")], required: 3, me: "ME") == "自分には投票できません。")
        #expect(AwardBallot.problem([a, b, AwardVote(nominee: "a", reason: "z")], required: 3, me: "me") == "3人は別々の人を選んでください。")
        #expect(AwardBallot.problem([a, b, AwardVote(nominee: "C", reason: "  ")], required: 3, me: "me") == "それぞれの「頑張ったこと」を入力してください。")
        #expect(AwardBallot.problem([a, b], required: 2, me: "me") == nil)
        #expect(AwardBallot.payload([AwardVote(nominee: "A", reason: " 新人指導 ")]) == [["nominee": "A", "reason": "新人指導"]])
    }
}
