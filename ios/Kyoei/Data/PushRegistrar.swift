import Foundation
import KyoeiCore
import Observation
import Supabase
#if canImport(UIKit)
import UIKit
#endif

/// Keeps this device's APNs token registered in device_push_tokens (through
/// the register/unregister_push_token RPCs), together with what it subscribes
/// to and its 乗務員ID, so supabase/functions/push-dispatch can reach it the
/// instant a news post or status change lands in the database.
@MainActor
@Observable
final class PushRegistrar {
    static let shared = PushRegistrar()

    private(set) var deviceToken: Data?
    private(set) var lastError: String?

    @ObservationIgnored private var registered: PushRegistration?
    @ObservationIgnored private var settings = AppSettings()

    static var environment: APNsEnvironment {
        #if DEBUG
        .sandbox
        #else
        .production
        #endif
    }

    /// Called whenever the relevant settings change (and at launch).
    func update(settings: AppSettings) async {
        self.settings = settings
        guard settings.pushNotificationsEnabled else {
            await unregister()
            return
        }
        if await NotificationScheduler.requestAuthorization() {
            Self.registerForRemoteNotifications()
        }
        await syncRegistration()
    }

    /// From the app delegate once APNs hands out (or rotates) a token.
    func didReceive(deviceToken: Data) async {
        self.deviceToken = deviceToken
        await syncRegistration()
    }

    func didFail(_ error: Error) {
        lastError = error.localizedDescription
    }

    private func syncRegistration() async {
        guard settings.pushNotificationsEnabled, let deviceToken else { return }
        let registration = PushRegistration(
            deviceID: DeviceID.current,
            token: deviceToken,
            environment: Self.environment,
            staffMemberID: settings.staffMemberID,
            topics: settings.pushTopics
        )
        guard registration != registered else { return }
        do {
            try await Backend.client.rpc("register_push_token", params: registration).execute()
            registered = registration
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func unregister() async {
        registered = nil
        _ = try? await Backend.client.rpc("unregister_push_token", params: ["p_device_id": DeviceID.current]).execute()
        #if canImport(UIKit)
        UIApplication.shared.unregisterForRemoteNotifications()
        deviceToken = nil
        #endif
    }

    private static func registerForRemoteNotifications() {
        #if canImport(UIKit)
        UIApplication.shared.registerForRemoteNotifications()
        #endif
    }
}

/// Routes a tapped notification to the matching tab.
@MainActor
@Observable
final class NotificationRouter {
    static let shared = NotificationRouter()

    /// Set when a tapped notification should open a tab; AppShell consumes it.
    var requestedTab: AppTab?
}

#if canImport(UIKit)
/// Receives the APNs device token (SwiftUI has no hook for it).
final class KyoeiAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { await PushRegistrar.shared.didReceive(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushRegistrar.shared.didFail(error) }
    }
}
#endif
