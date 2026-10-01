import Foundation
import KyoeiCore
import Observation
import Supabase

/// Supabase Auth session plus the user's app_accounts row (roles).
///
/// Accounts are invitation-only: an admin creates them and hands the person a
/// one-time setup code (or a QR code with kyoei://setup?t=…); the person
/// chooses a password with it (`completeSetup`) and from then on signs in
/// with their login ID. The session lives in the Keychain and refreshes
/// itself, so signing in is a one-time step on each iPhone.
@MainActor
@Observable
final class AuthStore {
    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(userID: String, email: String?)
    }

    /// Whether the signed-in user may use the app.
    enum AccountStatus: Equatable {
        case checking
        case active(AccountRow)
        /// Signed in, but no app_accounts row: not (yet) invited properly.
        case missing
        case disabled
    }

    private(set) var state: State = .loading
    private(set) var accountStatus: AccountStatus = .checking
    /// A setup code opened from a QR code / link, waiting for the setup screen.
    var pendingSetupCode: String?
    /// Called on an actual sign-in (not on restoring the saved session at
    /// launch) — before the signed-in state is published — so the lock never
    /// asks right after the password was typed.
    @ObservationIgnored var onSignIn: (() -> Void)?

    var userID: String? {
        if case .signedIn(let id, _) = state { return id }
        return nil
    }

    var account: AccountRow? {
        if case .active(let row) = accountStatus { return row }
        return nil
    }

    /// The login ID shown to the user ("1001"), or a legacy email.
    var loginLabel: String? {
        if case .signedIn(_, let email) = state { return LoginID.display(email: email) }
        return nil
    }

    private static let accountCacheKey = "kyoei-account"

    /// Follows sign-in / sign-out / token refresh until cancelled.
    func observe() async {
        for await change in Backend.client.auth.authStateChanges {
            if change.event == .signedIn { onSignIn?() }
            if let user = change.session?.user {
                let id = user.id.uuidString.lowercased()
                let changedUser = userID != id
                state = .signedIn(userID: id, email: user.email)
                if changedUser { await refreshAccount() }
            } else {
                state = .signedOut
                accountStatus = .checking
                UserDefaults.standard.removeObject(forKey: Self.accountCacheKey)
            }
        }
    }

    /// Re-reads the user's roles. Offline, the last known row is used so the
    /// app keeps working without signal.
    func refreshAccount() async {
        guard let userID else { return }
        do {
            let rows: [AccountRow] = try await Backend.client.from("app_accounts")
                .select(AccountRow.selectColumns)
                .eq("user_id", value: userID)
                .execute().value
            guard let row = rows.first else {
                accountStatus = .missing
                return
            }
            accountStatus = row.isDisabled ? .disabled : .active(row)
            if let data = try? JSONEncoder().encode(row) { UserDefaults.standard.set(data, forKey: Self.accountCacheKey) }
        } catch {
            if let data = UserDefaults.standard.data(forKey: Self.accountCacheKey),
               let row = try? JSONDecoder().decode(AccountRow.self, from: data), row.user_id == userID {
                accountStatus = row.isDisabled ? .disabled : .active(row)
            } else if accountStatus == .checking {
                // First check without signal: let them in; the next refresh
                // (on returning to the foreground) settles it.
                accountStatus = .active(AccountRow(user_id: userID, login_id: loginLabel ?? ""))
            }
        }
    }

    /// Returns a user-facing error, or nil on success.
    func signIn(loginID input: String, password: String) async -> String? {
        guard let email = LoginID.email(forInput: input) else {
            return "ログインIDは半角英数字で入力してください。"
        }
        do {
            try await Backend.client.auth.signIn(email: email, password: password)
            return nil
        } catch {
            return AuthErrorMessage.describe(Self.rawMessage(error), mode: .login)
        }
    }

    /// Unlocking without Face ID / passcode: the current account's password.
    func verifyPassword(_ password: String) async -> Bool {
        guard case .signedIn(_, let email?) = state else { return false }
        return (try? await Backend.client.auth.signIn(email: email, password: password)) != nil
    }

    /// Redeems a one-time setup / reset code, sets the password and signs in.
    /// Returns a user-facing error, or nil on success.
    func completeSetup(code input: String, password: String) async -> String? {
        guard let code = SetupCode.normalize(input) else {
            return "コードは「XXXX-XXXX-XXXX-XXXX」の16文字です。もう一度確認してください。"
        }
        // This iPhone becomes the one that approves admin console sign-ins
        // (a new key each time a code is used; the old one stops working).
        let devicePublicKey = try? DeviceKey.createNew()
        do {
            let result: AccountSetupResult = try await Backend.client.functions.invoke(
                "account-setup",
                options: FunctionInvokeOptions(body: AccountSetupRequest(token: code, password: password, devicePublicKey: devicePublicKey))
            )
            pendingSetupCode = nil
            if userID != nil { try? await Backend.client.auth.signOut() }
            return await signIn(loginID: result.loginId, password: password)
        } catch let FunctionsError.httpError(_, data) {
            struct Failure: Decodable { let error: String }
            return (try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "設定できませんでした。もう一度お試しください。"
        } catch {
            return "通信できませんでした。電波の良い場所でもう一度お試しください。"
        }
    }

    func signOut() async {
        try? await Backend.client.auth.signOut()
    }

    /// kyoei://setup?t=… from an admin's QR code opens the setup screen.
    func handle(url: URL) async {
        if let code = SetupCode.from(url: url) {
            pendingSetupCode = code
            return
        }
        // Legacy email-confirmation links (kyoei://auth/callback).
        _ = try? await Backend.client.auth.session(from: url)
    }

    private static func rawMessage(_ error: Error) -> String {
        if let authError = error as? AuthError { return authError.message }
        return error.localizedDescription
    }
}
