import Foundation

// マイページ: email/password sign-in, the one-time link to a staff_members
// row, and the per-driver features. Ports of mypage-view.tsx, auth-form.tsx
// and use-authenticated-staff.ts.

/// The fields マイページ needs from staff_members.
public struct StaffProfileRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, name, hire_date, auth_user_id"

    public var id: String
    public var name: String
    public var hire_date: String?
    public var auth_user_id: String?

    public var hireDate: LocalDate? { hire_date.flatMap(LocalDate.init(iso:)) }
}

public enum StaffLink {
    /// The signed-in user's own staff row, once linked.
    public static func me(userID: String?, in profiles: [StaffProfileRow]) -> StaffProfileRow? {
        guard let userID = userID?.lowercased() else { return nil }
        return profiles.first { $0.auth_user_id?.lowercased() == userID }
    }

    /// Rows nobody has linked yet — the only ones a user may claim.
    public static func unlinked(_ profiles: [StaffProfileRow]) -> [StaffProfileRow] {
        profiles.filter { $0.auth_user_id == nil }
    }
}

public enum AuthMode: Sendable {
    case login, signUp
}

/// Turns Supabase auth errors into user-facing Japanese. Raw messages are
/// never shown, except for the cases the user must act on.
public enum AuthErrorMessage {
    public static func describe(_ rawMessage: String, mode: AuthMode) -> String {
        let message = rawMessage.lowercased()
        switch mode {
        case .signUp:
            if message.contains("password") { return "パスワードは6文字以上で入力してください。" }
            if message.contains("rate limit") { return "しばらく時間をおいて再度お試しください。" }
            return "登録できませんでした。時間をおいて再度お試しください。"
        case .login:
            if message.contains("email not confirmed") {
                return "登録時に届いたメールの確認リンクを開いてから、ログインしてください。"
            }
            return "メールアドレスまたはパスワードが正しくありません。"
        }
    }

    public static func canSubmit(email: String, password: String) -> Bool {
        email.contains("@") && password.count >= 6
    }
}

public enum MyPageItem: String, CaseIterable, Sendable {
    case redPlates = "red-plates"
    case dispatchSheet = "dispatch-sheet"
    case tripHistory = "trip-history"
    case inspection
    case selfEvaluation = "self-eval"
    case awardVote = "award-vote"
    case leaveRequest = "leave-request"
    case repairRequest = "repair-request"
    case packagingHistory = "packaging-history"

    public var label: String {
        switch self {
        case .redPlates: "赤枠管理"
        case .dispatchSheet: "配車表"
        case .tripHistory: "運行履歴"
        case .inspection: "点検簿"
        case .selfEvaluation: "自己評価・目標設定シート"
        case .awardVote: "社長賞投票"
        case .leaveRequest: "休暇申請"
        case .repairRequest: "修理申請"
        case .packagingHistory: "荷姿履歴"
        }
    }

    public var summary: String {
        switch self {
        case .redPlates: "赤枠（ディーラーナンバー）の持ち出しと返却を記録します。"
        case .dispatchSheet: "配車表を確認できます。"
        case .tripHistory: "過去の出庫・帰庫と休息時間を確認できます。"
        case .inspection: "日常点検の記録をカレンダーで確認できます。"
        case .selfEvaluation: "毎月の自己評価と目標を記入・確認できます。"
        case .awardVote: "社長賞にふさわしい方へ投票できます。"
        case .leaveRequest: "休暇の申請ができます。"
        case .repairRequest: "車両の修理を申請できます。"
        case .packagingHistory: "回戦ごとに、何番に何を積んだかと写真を記録・確認できます。"
        }
    }

    /// Needs the account linked to its 出勤簿 name (配車表 etc.); 点検簿 works on the account alone.
    public var needsStaffLink: Bool { self != .inspection && self != .packagingHistory }

    /// Features the web app hadn't built yet either (shown as 準備中).
    public var isComingSoon: Bool { ![.dispatchSheet, .tripHistory, .inspection, .packagingHistory].contains(self) }
}
