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
    @State private var pendingNotifications = PendingNotificationStore()

    init() {
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
