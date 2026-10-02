import Foundation
import KyoeiCore
import Observation
import Supabase

/// Admin console sign-ins waiting for approval in this app. While an admin
/// has the app in the foreground it checks every few seconds (push
/// notifications for this come once APNs is set up); the console shows a
/// number, the admin picks the same one here and confirms with Face ID.
@MainActor
@Observable
final class AdminApprovalStore {
    private(set) var pending: AdminLoginRequestRow?
    /// The outcome of the last answer, shown briefly.
    private(set) var lastResult: String?
    private(set) var answering = false
    /// Requests already answered or dismissed here (not shown again).
    @ObservationIgnored private var handled: Set<String> = []

    func poll() async {
        while !Task.isCancelled {
            await refresh()
            try? await Task.sleep(for: .seconds(3))
        }
    }

    func refresh() async {
        guard !answering else { return }
        let rows: [AdminLoginRequestRow]? = try? await Backend.client.rpc("pending_admin_login").execute().value
        let next = rows?.first.flatMap { handled.contains($0.id) ? nil : $0 }
        if next != pending { pending = next }
    }

    /// Picks a number (approve) or rejects. Face ID is asked by the key.
    func answer(choice: Int?, approve: Bool) async {
        guard let request = pending else { return }
        answering = true
        defer { answering = false }
        let chosen = choice ?? 0
        do {
            let signature = try await DeviceKey.sign(
                AdminLoginApproval.message(requestID: request.id, choice: chosen, approve: approve),
                reason: approve ? "管理画面へのログインを承認します" : "管理画面へのログインを拒否します"
            )
            let result: AdminLoginApprovalResult = try await Backend.client.functions.invoke(
                "admin-login-approve",
                options: FunctionInvokeOptions(body: AdminLoginApprovalBody(requestId: request.id, choice: chosen, approve: approve, signature: signature))
            )
            handled.insert(request.id)
            pending = nil
            lastResult = switch result.result {
            case "approved": "承認しました。パソコンの画面が切り替わります。"
            case "wrong_number": "数字が違ったため、ログインを拒否しました。"
            default: "ログインを拒否しました。"
            }
        } catch DeviceKey.KeyError.missing {
            lastResult = "この iPhone は承認用に登録されていません。管理者に再設定コードを発行してもらい、設定し直してください。"
        } catch let FunctionsError.httpError(_, data) {
            struct Failure: Decodable { let error: String }
            lastResult = (try? JSONDecoder().decode(Failure.self, from: data))?.error ?? "承認できませんでした。"
            handled.insert(request.id)
            pending = nil
        } catch {
            // Face ID cancelled, or no signal: keep the request to try again.
            lastResult = nil
        }
    }

    func dismissResult() { lastResult = nil }
}
