import Foundation

// 社長賞投票: 1〜15日 (JST) に、先月頑張った3人と頑張ったことを入力する。
// Voters stay anonymous (see the president_award migration).

public struct AwardCandidate: Codable, Equatable, Identifiable, Sendable {
    public var user_id: String
    public var name: String
    public var position_name: String?

    public var id: String { user_id }

    public init(user_id: String, name: String, position_name: String? = nil) {
        self.user_id = user_id
        self.name = name
        self.position_name = position_name
    }
}

/// A row of my_award_votes(): the window, plus one of my votes (nominee nil when none).
public struct AwardVoteRow: Codable, Equatable, Sendable {
    public var period: LocalDate
    public var is_open: Bool
    public var closes_on: LocalDate
    public var nominee_id: String?
    public var nominee_name: String?
    public var reason: String?
}

public struct AwardStatus: Equatable, Sendable {
    /// The month being voted on (先月).
    public var period: LocalDate
    public var isOpen: Bool
    public var closesOn: LocalDate
    public var votes: [AwardVote]

    public init(rows: [AwardVoteRow]) {
        let first = rows.first
        period = first?.period ?? LocalDate(year: 2000, month: 1, day: 1)
        isOpen = first?.is_open ?? false
        closesOn = first?.closes_on ?? period
        votes = rows.compactMap { row in
            row.nominee_id.map { AwardVote(nominee: $0, nomineeName: row.nominee_name ?? "", reason: row.reason ?? "") }
        }
    }

    public var hasVoted: Bool { !votes.isEmpty }
    /// 帰庫 reminder: open and not voted yet.
    public var needsReminder: Bool { isOpen && !hasVoted }
    public var title: String { "\(period.month)月の社長賞" }
}

public struct AwardVote: Codable, Equatable, Sendable {
    public var nominee: String
    public var nomineeName: String
    public var reason: String

    public init(nominee: String, nomineeName: String = "", reason: String = "") {
        self.nominee = nominee
        self.nomineeName = nomineeName
        self.reason = reason
    }
}

public enum AwardBallot {
    /// What's missing before the votes can be sent, or nil when ready.
    /// `required` is 3 (fewer only when there aren't 3 people to choose from).
    public static func problem(_ slots: [AwardVote?], required: Int, me: String?) -> String? {
        let filled = slots.prefix(required)
        guard filled.count == required, filled.allSatisfy({ $0 != nil }) else { return "\(required)人を選んでください。" }
        let votes = filled.compactMap { $0 }
        if let me, votes.contains(where: { $0.nominee.lowercased() == me.lowercased() }) { return "自分には投票できません。" }
        if Set(votes.map { $0.nominee.lowercased() }).count != votes.count { return "3人は別々の人を選んでください。" }
        if votes.contains(where: { $0.reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) { return "それぞれの「頑張ったこと」を入力してください。" }
        return nil
    }

    /// The submit_award_votes payload.
    public static func payload(_ votes: [AwardVote]) -> [[String: String]] {
        votes.map { ["nominee": $0.nominee, "reason": $0.reason.trimmingCharacters(in: .whitespacesAndNewlines)] }
    }
}
