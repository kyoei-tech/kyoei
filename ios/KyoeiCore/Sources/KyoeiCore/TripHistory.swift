import Foundation

// Completed 出庫→帰庫 trips, stored in Supabase's `trip_history` table and
// scoped per device via `device_id`. Port of lib/trip-history.ts's types;
// the queries themselves live in the app's data layer.

public struct TripHistoryEntry: Identifiable, Equatable, Sendable {
    public var id: String
    public var departedAt: Date
    public var returnedAt: Date
    public var totals: CategoryTotals
    public var splitRestRemaining: TimeInterval?
    public var processMemo: String
    public var trafficMemo: String
    public var freeMemo: String

    public init(
        id: String,
        departedAt: Date,
        returnedAt: Date,
        totals: CategoryTotals = .zero,
        splitRestRemaining: TimeInterval? = nil,
        processMemo: String = "",
        trafficMemo: String = "",
        freeMemo: String = ""
    ) {
        self.id = id
        self.departedAt = departedAt
        self.returnedAt = returnedAt
        self.totals = totals
        self.splitRestRemaining = splitRestRemaining
        self.processMemo = processMemo
        self.trafficMemo = trafficMemo
        self.freeMemo = freeMemo
    }

    public var hasMemo: Bool {
        !(processMemo.isEmpty && trafficMemo.isEmpty && freeMemo.isEmpty)
    }
}

/// Row shape as selected from `trip_history`.
public struct TripHistoryRow: Codable, Sendable {
    public static let selectColumns =
        "id, departed_at, returned_at, driving_ms, loading_ms, unloading_ms, waiting_ms, resting_ms, split_rest_remaining_ms, process_memo, traffic_memo, free_memo"

    public var id: String
    public var departed_at: String
    public var returned_at: String
    public var driving_ms: Double
    public var loading_ms: Double
    public var unloading_ms: Double
    public var waiting_ms: Double
    public var resting_ms: Double
    public var split_rest_remaining_ms: Double?
    public var process_memo: String?
    public var traffic_memo: String?
    public var free_memo: String?

    public var entry: TripHistoryEntry? {
        guard let departed = DBTimestamp.parse(departed_at),
              let returned = DBTimestamp.parse(returned_at)
        else { return nil }
        return TripHistoryEntry(
            id: id,
            departedAt: departed,
            returnedAt: returned,
            totals: CategoryTotals(
                driving: driving_ms / 1000,
                loading: loading_ms / 1000,
                unloading: unloading_ms / 1000,
                waiting: waiting_ms / 1000,
                resting: resting_ms / 1000
            ),
            splitRestRemaining: split_rest_remaining_ms.map { $0 / 1000 },
            processMemo: process_memo ?? "",
            trafficMemo: traffic_memo ?? "",
            freeMemo: free_memo ?? ""
        )
    }
}

/// Insert payload written once at 帰庫.
public struct TripHistoryInsert: Encodable, Sendable {
    public var device_id: String
    public var departed_at: String
    public var returned_at: String
    public var driving_ms: Int
    public var loading_ms: Int
    public var unloading_ms: Int
    public var waiting_ms: Int
    public var resting_ms: Int
    public var split_rest_remaining_ms: Int?

    public init(
        deviceID: String,
        departedAt: Date,
        returnedAt: Date,
        totals: CategoryTotals,
        splitRestRemaining: TimeInterval?
    ) {
        func ms(_ t: TimeInterval) -> Int { Int((t * 1000).rounded()) }
        device_id = deviceID
        departed_at = DBTimestamp.format(departedAt)
        returned_at = DBTimestamp.format(returnedAt)
        driving_ms = ms(totals.driving)
        loading_ms = ms(totals.loading)
        unloading_ms = ms(totals.unloading)
        waiting_ms = ms(totals.waiting)
        resting_ms = ms(totals.resting)
        split_rest_remaining_ms = splitRestRemaining.map(ms)
    }
}
