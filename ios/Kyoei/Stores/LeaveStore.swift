import Foundation
import KyoeiCore
import Observation
import Supabase
@preconcurrency import UserNotifications

/// The signed-in user's 休暇申請 and 有給 balance. Also tells the driver when a
/// request has been 確認済み (local notification + 「更新あり」), like RepairStore.
@MainActor
@Observable
final class LeaveStore {
    private(set) var leave: MyLeave?
    private(set) var loaded = false
    private(set) var userID: String?
    private(set) var unread: Set<String> = []

    /// 確認済み leave days, for 運行履歴・点検簿 calendars and 自己評価.
    var confirmedDays: Set<LocalDate> { leave?.confirmedDays ?? [] }

    func start(userID: String?) async {
        self.userID = userID
        leave = nil
        loaded = false
        unread = Set(UserDefaults.standard.stringArray(forKey: unreadKey) ?? [])
        await refresh()
    }

    func refresh() async {
        guard userID != nil else { return }
        do {
            let fresh: MyLeave = try await Backend.client.rpc("my_leave").execute().value
            leave = fresh
            loaded = true
            await announce(fresh.requests)
        } catch {
            loaded = true
        }
    }

    func markRead() {
        unread = []
        UserDefaults.standard.set([String](), forKey: unreadKey)
    }

    private var seenKey: String { "kyoei-leave-seen-\(userID ?? "")" }
    private var unreadKey: String { "kyoei-leave-unread-\(userID ?? "")" }

    private func announce(_ requests: [LeaveRequest]) async {
        let defaults = UserDefaults.standard
        let seen = defaults.dictionary(forKey: seenKey) as? [String: Bool] ?? [:]
        for request in requests where request.status == .confirmed && seen[request.id] == false {
            unread.insert(request.id)
            if await NotificationScheduler.isAuthorized() {
                let content = UNMutableNotificationContent()
                content.title = "休暇申請"
                content.body = "\(request.periodLabel)のお休みが確認されました。"
                content.sound = .default
                try? await UNUserNotificationCenter.current().add(UNNotificationRequest(
                    identifier: "kyoei.leave.\(request.id)", content: content,
                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)))
            }
        }
        defaults.set(Dictionary(uniqueKeysWithValues: requests.map { ($0.id, $0.status == .confirmed) }), forKey: seenKey)
        defaults.set(Array(unread), forKey: unreadKey)
    }
}
