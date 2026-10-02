import Foundation
import KyoeiCore
import Observation
import Supabase
@preconcurrency import UserNotifications

/// 点検・車検・健康診断の予約 for the signed-in driver: tells them when one is
/// added or moved (on launch and each return to the app) and reminds them at
/// 7:00 on the day. Remote push replaces the check once APNs is set up.
@MainActor
@Observable
final class AppointmentStore {
    private(set) var userID: String?
    private static let reminderPrefix = "kyoei.appointment."

    func start(userID: String?) async {
        self.userID = userID
        await refresh()
    }

    func refresh() async {
        guard let userID else { return }
        guard let profile: MyProfile = try? await Backend.client.rpc("my_profile").execute().value else { return }
        let items = AppointmentNotice.items(of: profile)
        let key = "kyoei-appointments-seen-\(userID)"
        let seen = UserDefaults.standard.dictionary(forKey: key) as? [String: String]
        let authorized = await NotificationScheduler.isAuthorized()
        if authorized {
            for item in AppointmentNotice.changes(items, seen: seen) {
                await Self.post(id: "\(Self.reminderPrefix)new.\(item.id).\(UUID().uuidString)", title: "予約が入りました", body: item.message, at: nil)
            }
        }
        UserDefaults.standard.set(Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0.key) }), forKey: key)
        await scheduleReminders(items, authorized: authorized)
    }

    private func scheduleReminders(_ items: [AppointmentNotice.Item], authorized: Bool) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix(Self.reminderPrefix + "day.") }
        center.removePendingNotificationRequests(withIdentifiers: pending)
        guard authorized else { return }
        for item in items {
            guard let fire = Calendar.current.date(byAdding: .hour, value: 7, to: item.day.startDate()), fire > Date() else { continue }
            await Self.post(id: "\(Self.reminderPrefix)day.\(item.id)", title: "本日は予約日です", body: item.message, at: fire)
        }
    }

    private static func post(id: String, title: String, body: String, at date: Date?) async {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let trigger: UNNotificationTrigger = date.map {
            UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: $0), repeats: false)
        } ?? UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
