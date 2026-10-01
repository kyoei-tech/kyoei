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
    public static let selectColumns = "user_id, login_id, is_driver, can_search_customers, is_admin, disabled_at"

    public var user_id: String
    public var login_id: String
    public var is_driver: Bool
    public var can_search_customers: Bool
    public var is_admin: Bool
    public var disabled_at: String?

    public init(user_id: String, login_id: String, is_driver: Bool = true, can_search_customers: Bool = false, is_admin: Bool = false, disabled_at: String? = nil) {
        self.user_id = user_id
        self.login_id = login_id
        self.is_driver = is_driver
        self.can_search_customers = can_search_customers
        self.is_admin = is_admin
        self.disabled_at = disabled_at
    }

    public var isDisabled: Bool { disabled_at != nil }

    /// "ドライバー・顧客検索" — for マイページ.
    public var roleLabel: String {
        [is_driver ? "ドライバー" : nil, can_search_customers ? "顧客検索" : nil, is_admin ? "管理者" : nil]
            .compactMap { $0 }.joined(separator: "・")
    }
}

/// Body / result of the account-setup Edge Function.
public struct AccountSetupRequest: Encodable, Equatable, Sendable {
    public var token: String
    public var password: String
    public init(token: String, password: String) {
        self.token = token
        self.password = password
    }
}

public struct AccountSetupResult: Decodable, Equatable, Sendable {
    public var loginId: String
    public var purpose: String
}
