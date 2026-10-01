import Foundation
import KyoeiCore
import Supabase

/// Announces new おしらせ with the blocking "了解しました。" modal while the app
/// is open, and catches up on posts made while it wasn't (on launch and each
/// return to the foreground). Port of components/news-notifier.tsx.
///
/// While the app is closed the instant APNs push (push-dispatch) is what
/// reaches the user; in the foreground that push is suppressed (see
/// PushKind) so each post is announced exactly once, by this notifier.
@MainActor
final class NewsNotifier {
    private static let storageKey = "kyoei-news-last-seen"
    // Same copy the web app used.
    static let title = "おしらせ"
    static let message = "新しいおしらせがあります💡"

    private let defaults: UserDefaults
    private var tracker: NewsSeenTracker

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        tracker = NewsSeenTracker(lastSeen: defaults.string(forKey: Self.storageKey))
        tracker.initializeIfNeeded()
        save()
    }

    /// Catches up, then announces live inserts until cancelled.
    func run(announce: @escaping @MainActor () -> Void) async {
        await catchUp(announce: announce)
        let channel = Backend.client.channel("news-notifier:\(UUID().uuidString)")
        let inserts = channel.postgresChange(InsertAction.self, schema: "public", table: "news_posts")
        do {
            try await channel.subscribeWithError()
            for await insert in inserts {
                if let createdAt = insert.record["created_at"]?.stringValue, observe(createdAt) {
                    announce()
                }
            }
        } catch {
            // Realtime is best-effort; foreground catch-ups still cover gaps.
        }
        await Backend.client.removeChannel(channel)
    }

    func catchUp(announce: @MainActor () -> Void) async {
        guard let lastSeen = tracker.lastSeen,
              let newest = try? await NewsRepository.newestCreatedAt(after: lastSeen),
              observe(newest)
        else { return }
        announce()
    }

    private func observe(_ createdAt: String) -> Bool {
        let isNew = tracker.observe(createdAt: createdAt)
        if isNew { save() }
        return isNew
    }

    private func save() {
        defaults.set(tracker.lastSeen, forKey: Self.storageKey)
    }
}
