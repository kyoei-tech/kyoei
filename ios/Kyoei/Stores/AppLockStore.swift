import Foundation
import KyoeiCore
import LocalAuthentication
import Observation

/// Face ID / passcode lock. Asked when the app comes back after being away
/// for at least `AppLockPolicy.gracePeriod` (a minute), and on every cold
/// start of a signed-in session (the app was swiped away — or iOS ended it in
/// the background, which the app can't tell apart). Never while moving
/// between pages inside the app, and not right after signing in.
@MainActor
@Observable
final class AppLockStore {
    private(set) var isLocked: Bool

    private static let lastInactiveKey = "kyoei-last-inactive"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        // Cold start: locked. It only shows once a restored session appears,
        // and a fresh sign-in unlocks it (see RootView).
        isLocked = true
    }

    /// The app went to the background (home screen, another app, screen off).
    func didLeave() {
        guard !isLocked else { return }
        defaults.set(Date(), forKey: Self.lastInactiveKey)
    }

    /// The app is in the foreground again.
    func didReturn() {
        if AppLockPolicy.needsUnlock(lastInactive: defaults.object(forKey: Self.lastInactiveKey) as? Date, now: Date()) {
            isLocked = true
        } else {
            defaults.removeObject(forKey: Self.lastInactiveKey)
        }
    }

    /// After sign-in / sign-out, and after a successful unlock.
    func unlock() {
        isLocked = false
        defaults.removeObject(forKey: Self.lastInactiveKey)
    }

    /// Whether this iPhone can use Face ID / Touch ID / its passcode.
    var canUseDeviceAuthentication: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// Face ID (falling back to the iPhone passcode). True when unlocked.
    func authenticate() async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "キャンセル"
        do {
            let ok = try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "KYOEIのロックを解除します")
            if ok { unlock() }
            return ok
        } catch {
            return false
        }
    }
}
