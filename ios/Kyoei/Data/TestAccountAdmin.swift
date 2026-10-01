import Foundation
import Supabase

/// テストアカウント管理 (設定 > 試験運転モード). Calls the SECURITY DEFINER
/// functions in supabase/migrations/*_admin_test_accounts.sql instead of the
/// web app's service-role /api/test-accounts route. The PIN is checked by
/// the database (with lockout), not by the app.
enum TestAccountAdmin {
    struct Account: Decodable, Identifiable, Sendable {
        var staffID: String
        var staffName: String
        var authUserID: UUID
        var email: String?
        var createdAt: String?

        var id: UUID { authUserID }

        private enum CodingKeys: String, CodingKey {
            case staffID = "staff_id", staffName = "staff_name", authUserID = "auth_user_id", email, createdAt = "created_at"
        }
    }

    enum Failure: LocalizedError {
        case invalidPIN, locked, unexpected(String)

        var errorDescription: String? {
            switch self {
            case .invalidPIN: "パスワードが違います"
            case .locked: "試行回数が多すぎます。10分後にもう一度お試しください。"
            case .unexpected(let status): "処理に失敗しました（\(status)）"
            }
        }
    }

    private struct Response: Decodable {
        var status: String
        var accounts: [Account]?
    }

    static func list(pin: String) async throws -> [Account] {
        let response: Response = try await Backend.client
            .rpc("admin_list_test_accounts", params: ["p_pin": pin])
            .execute()
            .value
        try check(response.status)
        return response.accounts ?? []
    }

    static func delete(_ account: Account, pin: String) async throws {
        let response: Response = try await Backend.client
            .rpc("admin_delete_test_account", params: ["p_pin": pin, "p_auth_user_id": account.authUserID.uuidString])
            .execute()
            .value
        try check(response.status)
    }

    private static func check(_ status: String) throws {
        switch status {
        case "ok": return
        case "invalid_pin": throw Failure.invalidPIN
        case "locked": throw Failure.locked
        default: throw Failure.unexpected(status)
        }
    }
}
