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
    @State private var auth = AuthStore()
    @State private var lock = AppLockStore()
    @State private var approvals = AdminApprovalStore()
    @State private var inspections = InspectionStore()
    @State private var repairs = RepairStore()
    @State private var leave = LeaveStore()

    init() {
        UNUserNotificationCenter.current().delegate = ForegroundNotificationDelegate.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(settings)
                .environment(shift)
                .environment(sharedData)
                .environment(pendingNotifications)
                .environment(auth)
                .environment(lock)
                .environment(approvals)
                .environment(inspections)
                .environment(repairs)
                .environment(leave)
                .task(id: auth.userID) { await leave.start(userID: auth.userID) }
                .task(id: auth.userID) { await repairs.start(userID: auth.userID) }
                .task(id: auth.userID) { await inspections.start(userID: auth.userID) }
                .preferredColorScheme(settings.colorScheme)
                .environment(\.locale, Locale(identifier: "ja_JP"))
        }
    }
}
