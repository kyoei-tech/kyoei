import Foundation
import Observation
import Supabase
import SwiftUI

/// Keeps a Supabase table's rows in sync across every device. Port of
/// lib/supabase/use-realtime-table.ts: fetches once, then refetches on any
/// Postgres change to the table (insert/update/delete from anywhere).
///
/// Lifetime is tied to the owning view via `.syncing(_:)`, the equivalent of
/// the hook's useEffect: subscribed while the view is on screen, torn down
/// when it disappears.
@MainActor
@Observable
final class RealtimeTable<Row: Sendable> {
    private(set) var rows: [Row] = []
    private(set) var isLoading = true
    private(set) var error: (any Error)?

    let table: String
    @ObservationIgnored private let fetch: @Sendable () async throws -> [Row]

    init(table: String, fetch: @escaping @Sendable () async throws -> [Row]) {
        self.table = table
        self.fetch = fetch
    }

    func refresh() async {
        do {
            rows = try await fetch()
            error = nil
        } catch is CancellationError {
            return
        } catch {
            self.error = error
        }
        isLoading = false
    }

    /// Fetches, then refetches on every change until the calling task is cancelled.
    func run() async {
        await refresh()
        // Channel names must be unique per subscriber: Supabase dedupes
        // channels by name, so two views watching the same table would
        // otherwise collide.
        let channel = Backend.client.channel("realtime:\(table):\(UUID().uuidString)")
        let changes = channel.postgresChange(AnyAction.self, schema: "public", table: table)
        do {
            try await channel.subscribeWithError()
            for await _ in changes {
                await refresh()
            }
        } catch {
            // Realtime is best-effort; the initial fetch (and foreground
            // refreshes from `.syncing`) still keep data reasonably fresh.
        }
        await Backend.client.removeChannel(channel)
    }
}

extension RealtimeTable where Row: Decodable {
    /// Convenience for the common "select columns, optional order" fetch.
    convenience init(
        table: String,
        select columns: String = "*",
        orderBy: String? = nil,
        ascending: Bool = true
    ) {
        self.init(table: table) {
            let query = Backend.client.from(table).select(columns)
            if let orderBy {
                return try await query.order(orderBy, ascending: ascending).execute().value
            }
            return try await query.execute().value
        }
    }
}

private struct SyncingModifier<Row: Sendable>: ViewModifier {
    let table: RealtimeTable<Row>
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .task { await table.run() }
            // iOS suspends sockets in the background, so catch up with a plain
            // fetch whenever the app returns to the foreground.
            .onChange(of: scenePhase) { _, phase in
                if phase == .active {
                    Task { await table.refresh() }
                }
            }
    }
}

extension View {
    func syncing<Row: Sendable>(_ table: RealtimeTable<Row>) -> some View {
        modifier(SyncingModifier(table: table))
    }
}
