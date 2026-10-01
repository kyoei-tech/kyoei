import Foundation
import KyoeiCore
import Observation
import Supabase

/// Realtime tables several screens read at once (the web app shared these via
/// SWR's cache). Kept alive by AppShell for the app's whole lifetime.
@MainActor
@Observable
final class SharedData {
    let confirmMessageRows = RealtimeTable<ConfirmActionMessageRow>(
        table: "confirm_action_messages",
        select: ConfirmActionMessageRow.selectColumns,
        orderBy: "id"
    )

    let notificationRuleRows = RealtimeTable<PushNotificationRuleRow>(
        table: "push_notification_rules",
        select: PushNotificationRuleRow.selectColumns,
        orderBy: "threshold_ms"
    )

    /// This device's 運行履歴, newest first.
    let deviceTrips = RealtimeTable<TripHistoryEntry>(table: "trip_history") {
        let rows: [TripHistoryRow] = try await Backend.client
            .from("trip_history")
            .select(TripHistoryRow.selectColumns)
            .eq("device_id", value: DeviceID.current)
            .order("departed_at", ascending: false)
            .limit(200)
            .execute()
            .value
        return rows.compactMap(\.entry)
    }

    /// 無事故カレンダー's records; also drives the 連続無事故日数 badge.
    let accidentRows = RealtimeTable<AccidentRecordRow>(table: "accident_records") { try await AccidentRepository.fetch() }

    var confirmMessages: ConfirmMessages { ConfirmMessages(rows: confirmMessageRows.rows) }
    var notificationRules: [PushNotificationRule] { notificationRuleRows.rows.map(\.rule) }
    var trips: [TripHistoryEntry] { deviceTrips.rows }

    /// 連続無事故日数, or nil when there are no accident records yet.
    func accidentStreak(now: Date = Date()) -> Int? {
        AccidentStreak.streakDays(occurredOn: accidentRows.rows.compactMap(\.date), now: now)
    }
}
