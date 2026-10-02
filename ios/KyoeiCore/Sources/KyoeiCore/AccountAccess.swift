import Foundation

// Accounts: every user is invited by an admin, signs in with a login ID
// (e.g. 社員番号) and a password, and has roles. Mirrors
// supabase/functions/account-setup/tokens.ts and the app_accounts table.

public enum LoginID {
    /// Synthetic email domain: Supabase Auth needs an email, users never see it.
    public static let emailDomain = "id.kyoei.invalid"

    /// "１００１ " → "1001"; nil when not a valid login ID.
    public static func normalize(_ input: String) -> String? {
        let id = input.precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return id.wholeMatch(of: /[a-z0-9][a-z0-9._-]{2,31}/) == nil ? nil : id
    }

    /// The email Supabase signs in with. An input containing "@" is used as
    /// is, for accounts created before login IDs.
    public static func email(forInput input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.contains("@") { return trimmed.lowercased() }
        return normalize(trimmed).map { "\($0)@\(emailDomain)" }
    }

    /// "1001@id.kyoei.invalid" → "1001"; other emails unchanged.
    public static func display(email: String?) -> String? {
        guard let email else { return nil }
        let suffix = "@\(emailDomain)"
        return email.hasSuffix(suffix) ? String(email.dropLast(suffix.count)) : email
    }
}

/// One-time setup / password reset codes (XXXX-XXXX-XXXX-XXXX).
public enum SetupCode {
    public static let alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
    public static let length = 16

    public static func normalize(_ input: String) -> String? {
        let cleaned = input.precomposedStringWithCompatibilityMapping.uppercased()
            .filter { !$0.isWhitespace && !"-ー－‐".contains($0) }
        guard cleaned.count == length, cleaned.allSatisfy({ alphabet.contains($0) }) else { return nil }
        return cleaned
    }

    /// kyoei://setup?t=XXXXXXXXXXXXXXXX (from the admin's QR code).
    public static func from(url: URL) -> String? {
        guard url.scheme == "kyoei", url.host() == "setup",
              let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "t" })?.value
        else { return nil }
        return normalize(value)
    }

    /// "ABCDEFGHJKMNPQRS" → "ABCD-EFGH-JKMN-PQRS"
    public static func format(_ code: String) -> String {
        stride(from: 0, to: code.count, by: 4).map { start in
            let s = code.index(code.startIndex, offsetBy: start)
            return String(code[s..<code.index(s, offsetBy: min(4, code.count - start))])
        }.joined(separator: "-")
    }
}

public enum PasswordRule {
    public static let minLength = 8
    public static let maxLength = 72

    public static func problem(_ password: String, confirmation: String) -> String? {
        if password.count < minLength { return "パスワードは\(minLength)文字以上にしてください。" }
        if password.count > maxLength { return "パスワードは\(maxLength)文字以内にしてください。" }
        if password != confirmation { return "確認用のパスワードが一致しません。" }
        return nil
    }
}

/// Face ID only after the app has been away for a while — never while moving
/// between pages inside it.
public enum AppLockPolicy {
    public static let gracePeriod: TimeInterval = 60

    /// `lastInactive` is when the app last left the foreground (persisted, so
    /// a cold start after a long time also locks). Nil: never left since
    /// sign-in, so no lock.
    public static func needsUnlock(lastInactive: Date?, now: Date) -> Bool {
        guard let lastInactive else { return false }
        return now.timeIntervalSince(lastInactive) >= gracePeriod
    }
}

/// app_accounts: the signed-in user's own row (RLS).
public struct AccountRow: Codable, Equatable, Sendable {
    public static let selectColumns = "user_id, login_id, is_driver, can_search_customers, is_admin, disabled_at, can_approve_pickup_failure, can_view_pickup_failure"

    public var user_id: String
    public var login_id: String
    public var is_driver: Bool
    public var can_search_customers: Bool
    public var is_admin: Bool
    public var disabled_at: String?
    /// 引取不可の承認 / 閲覧. Optional: rows cached before these existed.
    public var can_approve_pickup_failure: Bool?
    public var can_view_pickup_failure: Bool?

    public init(user_id: String, login_id: String, is_driver: Bool = true, can_search_customers: Bool = false, is_admin: Bool = false, disabled_at: String? = nil, can_approve_pickup_failure: Bool = false, can_view_pickup_failure: Bool = false) {
        self.user_id = user_id
        self.login_id = login_id
        self.is_driver = is_driver
        self.can_search_customers = can_search_customers
        self.is_admin = is_admin
        self.disabled_at = disabled_at
        self.can_approve_pickup_failure = can_approve_pickup_failure
        self.can_view_pickup_failure = can_view_pickup_failure
    }

    public var isDisabled: Bool { disabled_at != nil }

    public var canApprovePickup: Bool { can_approve_pickup_failure == true }
    /// Approvers see every record too.
    public var canViewPickup: Bool { canApprovePickup || can_view_pickup_failure == true }

    /// "ドライバー・顧客検索" — for マイページ.
    public var roleLabel: String {
        [is_driver ? "ドライバー" : nil, can_search_customers ? "顧客検索" : nil,
         canApprovePickup ? "引取不可の承認" : (canViewPickup ? "引取不可の閲覧" : nil), is_admin ? "管理者" : nil]
            .compactMap { $0 }.joined(separator: "・")
    }
}

/// Body / result of the account-setup Edge Function.
public struct AccountSetupRequest: Encodable, Equatable, Sendable {
    public var token: String
    public var password: String
    /// This iPhone's admin-approval public key (P-256, X9.63, base64),
    /// registered with the account while the one-time code is redeemed.
    public var devicePublicKey: String?
    public init(token: String, password: String, devicePublicKey: String? = nil) {
        self.token = token
        self.password = password
        self.devicePublicKey = devicePublicKey
    }
}

public struct AccountSetupResult: Decodable, Equatable, Sendable {
    public var loginId: String
    public var purpose: String
}

// MARK: - Admin console sign-in approval

/// pending_admin_login(): a console sign-in waiting for this account's
/// approval. Carries the three numbers to choose from, never the answer.
public struct AdminLoginRequestRow: Decodable, Equatable, Identifiable, Sendable {
    public var id: String
    public var choices: [Int]
    public var user_agent: String
    public var created_at: String
    public var expires_at: String

    public init(id: String, choices: [Int], user_agent: String, created_at: String, expires_at: String) {
        self.id = id
        self.choices = choices
        self.user_agent = user_agent
        self.created_at = created_at
        self.expires_at = expires_at
    }

    /// "Mac の Chrome" etc., from the console's user agent.
    public var deviceLabel: String { AdminLoginApproval.describe(userAgent: user_agent) }
}

public enum AdminLoginApproval {
    /// What the Secure Enclave key signs. Mirrors
    /// supabase/functions/admin-login-approve/service.ts approvalMessage().
    public static func message(requestID: String, choice: Int, approve: Bool) -> String {
        "kyoei-admin-login|\(requestID)|\(choice)|\(approve ? "approve" : "deny")"
    }

    public static func describe(userAgent ua: String) -> String {
        let os: String = if ua.contains("Windows") { "Windows" }
            else if ua.contains("iPhone") { "iPhone" }
            else if ua.contains("iPad") { "iPad" }
            else if ua.contains("Android") { "Android" }
            else if ua.contains("Macintosh") || ua.contains("Mac OS X") { "Mac" }
            else { "パソコン" }
        let browser: String? = if ua.contains("Edg/") { "Edge" }
            else if ua.contains("Chrome/") && !ua.contains("Chromium") { "Chrome" }
            else if ua.contains("Firefox/") { "Firefox" }
            else if ua.contains("Safari/") { "Safari" }
            else { nil }
        return browser.map { "\(os) の \($0)" } ?? os
    }
}

public struct AdminLoginApprovalBody: Encodable, Equatable, Sendable {
    public var requestId: String
    public var choice: Int
    public var approve: Bool
    public var signature: String

    public init(requestId: String, choice: Int, approve: Bool, signature: String) {
        self.requestId = requestId
        self.choice = choice
        self.approve = approve
        self.signature = signature
    }
}

public struct AdminLoginApprovalResult: Decodable, Equatable, Sendable {
    /// "approved" / "denied" / "wrong_number"
    public var result: String
}
