import SwiftUI
import UserNotifications

@main
struct KyoeiApp: App {
    #if canImport(UIKit)
    @UIApplicationDelegateAdaptor(KyoeiAppDelegate.self) private var appDelegate
    #endif
    @State private var settings = SettingsStore()
    @State private var shift = ShiftStore()
    @State private var sharedData = SharedData()
    // A plain constant (the App value lives for the whole process) so the
    // notification router can hold it before any view is installed.
    private let pendingNotifications: PendingNotificationStore

    init() {
        let pending = PendingNotificationStore()
        pendingNotifications = pending
        NotificationRouter.shared.pendingNotifications = pending
        UNUserNotificationCenter.current().delegate = ForegroundNotificationDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            AppShell()
                .environment(settings)
                .environment(shift)
                .environment(sharedData)
                .environment(pendingNotifications)
                .preferredColorScheme(settings.colorScheme)
                .environment(\.locale, Locale(identifier: "ja_JP"))
        }
    }
}
