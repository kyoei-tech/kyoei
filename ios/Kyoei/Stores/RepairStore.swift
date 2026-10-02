import Foundation
import KyoeiCore
import Observation
import Supabase
@preconcurrency import UserNotifications

/// The signed-in driver's 修理申請. On launch and each return to the app it
/// checks for news (予定が決まった・完了した) and tells the driver with a local
/// notification and an 「更新あり」 mark, and keeps a reminder for each
/// 入庫予定日 (7:00). Remote push replaces the check once APNs is set up.
@MainActor
@Observable
final class RepairStore {
    private(set) var requests: [RepairRequest] = []
    private(set) var loaded = false
    private(set) var userID: String?
    /// Requests with news the driver hasn't opened yet.
    private(set) var unread: Set<String> = []

    private static let reminderPrefix = "kyoei.repair.entry."

    func start(userID: String?) async {
        self.userID = userID
        requests = []
        loaded = false
        unread = Set(UserDefaults.standard.stringArray(forKey: unreadKey) ?? [])
        await refresh()
    }

    func refresh() async {
        guard let userID else { return }
        do {
            let fresh: [RepairRequest] = try await Backend.client.from("repair_requests")
                .select(RepairRequest.selectColumns).eq("user_id", value: userID)
                .order("created_at", ascending: false).limit(200).execute().value
            requests = fresh
            loaded = true
            await announce(fresh)
            await scheduleReminders(fresh)
        } catch {
            loaded = true
        }
    }

    func markRead(_ id: String) {
        unread.remove(id)
        UserDefaults.standard.set(Array(unread), forKey: unreadKey)
    }

    // MARK: Notices

    private var seenKey: String { "kyoei-repair-seen-\(userID ?? "")" }
    private var unreadKey: String { "kyoei-repair-unread-\(userID ?? "")" }

    private func announce(_ requests: [RepairRequest]) async {
        let defaults = UserDefaults.standard
        let seen = defaults.dictionary(forKey: seenKey) as? [String: String] ?? [:]
        let changes = RepairNotice.changes(requests, seen: seen)
        for change in changes {
            unread.insert(change.id)
            await Self.notify(id: change.id, body: change.message)
        }
        defaults.set(Dictionary(uniqueKeysWithValues: requests.map { ($0.id, $0.noticeKey) }), forKey: seenKey)
        defaults.set(Array(unread), forKey: unreadKey)
    }

    private static func notify(id: String, body: String) async {
        guard await NotificationScheduler.isAuthorized() else { return }
        let content = UNMutableNotificationContent()
        content.title = "修理申請"
        content.body = body
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "kyoei.repair.\(id).\(UUID().uuidString)", content: content, trigger: trigger))
    }

    /// 入庫予定日の朝7時に知らせる (only for future dates of scheduled requests).
    private func scheduleReminders(_ requests: [RepairRequest]) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.reminderPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard await NotificationScheduler.isAuthorized() else { return }
        for request in requests where request.status == .scheduled {
            guard let entry = request.entry_on,
                  let fire = Calendar.current.date(byAdding: .hour, value: 7, to: entry.startDate()),
                  fire > Date() else { continue }
            let content = UNMutableNotificationContent()
            content.title = "本日は入庫予定日です"
            content.body = "\(request.head_plate)\(request.chassis_plate.map { " ／ \($0)" } ?? "")：\(request.destinationLabel ?? "")"
            content.sound = .default
            let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
            let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
            try? await center.add(UNNotificationRequest(identifier: Self.reminderPrefix + request.id, content: content, trigger: trigger))
        }
    }
}
