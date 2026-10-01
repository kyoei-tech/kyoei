import Foundation
import KyoeiCore
@preconcurrency import UserNotifications

/// Delivers the 運行状況 timer notifications as scheduled local notifications.
///
/// The web app could only notify while its tab was awake (plus a server-side
/// job relaying Web Push). Here every rule's crossing time is computed up
/// front and handed to iOS, so it fires on time even while the app is
/// suspended — no server involved. The in-app "了解しました。" modal is driven
/// separately by ShiftStore's tick, which also catches up on anything that
/// fired while the app was in the background. (Event notifications such as
/// おしらせ arrive as remote pushes instead — see PushRegistrar.)
enum NotificationScheduler {
    private static let drivingPrefix = "kyoei.driving."

    static func requestAuthorization() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    static func isAuthorized() async -> Bool {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
    }

    /// Replaces every pending driving notification with `fires`.
    static func scheduleDriving(_ fires: [ScheduledRuleFire], now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        await clearDriving()
        for fire in fires {
            let content = UNMutableNotificationContent()
            content.title = StyledText.plain(fire.rule.title)
            content.body = StyledText.plain(fire.rule.message)
            content.sound = .default
            let interval = max(1, fire.fireDate.timeIntervalSince(now))
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            let request = UNNotificationRequest(identifier: drivingPrefix + fire.rule.id, content: content, trigger: trigger)
            try? await center.add(request)
        }
    }

    /// プッシュ通知の管理's test button: delivers `title`/`message` shortly.
    static func schedulePreview(title: String, message: String, after seconds: TimeInterval) async {
        let content = UNMutableNotificationContent()
        content.title = StyledText.plain(title)
        content.body = StyledText.plain(message)
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        try? await UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "kyoei.preview.\(UUID().uuidString)", content: content, trigger: trigger)
        )
    }

    static func clearDriving() async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let ids = pending.map(\.identifier).filter { $0.hasPrefix(drivingPrefix) }
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }

}

/// Decides how notifications show while the app is open, and handles taps.
///  - Local driving-timer alerts: no banner; ShiftStore's tick raises the
///    blocking in-app modal instead (as the web app did).
///  - Remote おしらせ push: no banner; NewsNotifier raises the modal.
///  - Remote 出勤簿 status push: a regular banner.
/// Tapping a remote push opens the matching tab.
final class ForegroundNotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
    static let shared = ForegroundNotificationDelegate()

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        let content = notification.request.content
        switch PushKind(userInfo: content.userInfo)?.foregroundPresentation ?? .suppressed {
        case .banner:
            return [.banner, .list, .sound]
        case .suppressed:
            return []
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let kind = PushKind(userInfo: response.notification.request.content.userInfo) else { return }
        await MainActor.run { NotificationRouter.shared.requestedTab = kind.destinationTab }
    }
}
