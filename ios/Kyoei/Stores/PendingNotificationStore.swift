import Foundation
import KyoeiCore
import Observation

/// Queue behind the blocking "了解しました。" modal — the app's single
/// in-app notification surface. Port of lib/notifications/pending-notification.ts.
/// A queue (not a single slot) is required because several timers can cross
/// their threshold on the same tick.
@MainActor
@Observable
final class PendingNotificationStore {
    private static let storageKey = "kyoei-pending-notifications"

    private(set) var queue: [PendingNotification] {
        didSet { save() }
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.storageKey),
           let stored = try? JSONDecoder().decode([PendingNotification].self, from: data) {
            queue = stored
        } else {
            queue = []
        }
    }

    var current: PendingNotification? { queue.first }

    func enqueue(title: String, message: String) {
        queue.append(PendingNotification(title: title, message: message))
    }

    func dismiss(_ id: PendingNotification.ID) {
        queue.removeAll { $0.id == id }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(queue) {
            defaults.set(data, forKey: Self.storageKey)
        }
    }
}
