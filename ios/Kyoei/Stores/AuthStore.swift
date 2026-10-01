import Foundation
import KyoeiCore
import Observation
import Supabase

/// Supabase Auth session for マイページ / 配車表. The session lives in the
/// Keychain (supabase-swift's default storage) and refreshes itself, which
/// replaces the web app's cookie-refreshing proxy.ts.
///
/// Email confirmation links redirect to `kyoei://auth/callback` (PKCE): the
/// code verifier never leaves this device, and the link is handled by
/// `handle(url:)` from AppShell's onOpenURL. Opening the mail elsewhere still
/// confirms the account; the user then just signs in here.
@MainActor
@Observable
final class AuthStore {
    static let redirectURL = URL(string: "kyoei://auth/callback")!

    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(userID: String, email: String?)
    }

    private(set) var state: State = .loading

    var userID: String? {
        if case .signedIn(let id, _) = state { return id }
        return nil
    }

    /// Follows sign-in / sign-out / token refresh until cancelled.
    func observe() async {
        for await change in Backend.client.auth.authStateChanges {
            if let user = change.session?.user {
                state = .signedIn(userID: user.id.uuidString.lowercased(), email: user.email)
            } else {
                state = .signedOut
            }
        }
    }

    /// Returns a user-facing error, or nil on success.
    func signIn(email: String, password: String) async -> String? {
        do {
            try await Backend.client.auth.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
            return nil
        } catch {
            return AuthErrorMessage.describe(Self.rawMessage(error), mode: .login)
        }
    }

    /// Sends the confirmation mail. Returns a user-facing error, or nil.
    func signUp(email: String, password: String) async -> String? {
        do {
            try await Backend.client.auth.signUp(email: email.trimmingCharacters(in: .whitespaces), password: password, redirectTo: Self.redirectURL)
            return nil
        } catch {
            return AuthErrorMessage.describe(Self.rawMessage(error), mode: .signUp)
        }
    }

    func signOut() async {
        try? await Backend.client.auth.signOut()
    }

    /// Completes sign-in from an email confirmation link.
    func handle(url: URL) async {
        guard url.scheme == Self.redirectURL.scheme else { return }
        _ = try? await Backend.client.auth.session(from: url)
    }

    private static func rawMessage(_ error: Error) -> String {
        if let authError = error as? AuthError { return authError.message }
        return error.localizedDescription
    }
}
