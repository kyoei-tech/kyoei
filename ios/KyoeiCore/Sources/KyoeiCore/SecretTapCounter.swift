import Foundation

/// Hidden "tap N times quickly" gesture used throughout the app (home tab →
/// モード切替, menu tab → 試験運転モード, settings bell → 通知管理, trip cards
/// → 隠し編集). A tap more than `window` after the previous one starts over.
public struct SecretTapCounter: Sendable {
    public let requiredTaps: Int
    public let window: TimeInterval
    private var count = 0
    private var lastTap: Date?

    public init(requiredTaps: Int = 5, window: TimeInterval = 2) {
        self.requiredTaps = requiredTaps
        self.window = window
    }

    /// Registers a tap; returns true (and resets) when the gesture completes.
    public mutating func registerTap(at now: Date = Date()) -> Bool {
        if let lastTap, now.timeIntervalSince(lastTap) > window {
            count = 0
        }
        count += 1
        lastTap = now
        if count >= requiredTaps {
            count = 0
            lastTap = nil
            return true
        }
        return false
    }
}

/// A notification waiting to be acknowledged with "了解しました。".
public struct PendingNotification: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var message: String
    public var createdAt: Date

    public init(id: String = UUID().uuidString, title: String, message: String, createdAt: Date = Date()) {
        self.id = id
        self.title = title
        self.message = message
        self.createdAt = createdAt
    }
}
