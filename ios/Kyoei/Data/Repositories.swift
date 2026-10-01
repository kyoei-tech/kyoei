import Foundation
import KyoeiCore
import Supabase

// Direct Supabase writes. Each mirrors one helper from the web app's lib/
// or component code, and keeps its best-effort / error semantics.

enum TripHistoryRepository {
    /// Called once at 帰庫. Best-effort: the local timers reset regardless.
    static func save(_ trip: CompletedTrip) async {
        let insert = TripHistoryInsert(
            deviceID: DeviceID.current,
            departedAt: trip.departedAt,
            returnedAt: trip.returnedAt,
            totals: trip.totals,
            splitRestRemaining: trip.splitRestRemaining
        )
        _ = try? await Backend.client.from("trip_history").insert(insert).execute()
    }
}

enum StaffStatusSync {
    /// Flips the linked 出勤簿 row on 出庫/帰庫. Silent no-op when no 乗務員ID
    /// is set or it no longer matches a row.
    static func update(staffMemberID: String?, working: Bool) async {
        guard let staffMemberID else { return }
        _ = try? await Backend.client
            .from("staff_members")
            .update(["status": working ? "working" : "off"])
            .eq("id", value: staffMemberID)
            .execute()
    }
}

enum WeeklyGoalRepository {
    private struct GoalUpdate: Encodable {
        var content: String
        var content_month: String
        var next_content: String
        var next_content_set_at: String?
        var updated_at: String
    }

    private struct HistoryUpsert: Encodable {
        var goal_id: String
        var month: String
        var content: String
        var updated_at: String
    }

    static func fetch(goalID: String) async throws -> [WeeklyGoalRow] {
        try await Backend.client
            .from("weekly_goal")
            .select(WeeklyGoalRow.selectColumns)
            .eq("id", value: goalID)
            .execute()
            .value
    }

    static func save(goalID: String, content: String, nextContent: String, month: YearMonth) async throws {
        let now = DBTimestamp.format(Date())
        try await Backend.client.from("weekly_goal")
            .update(GoalUpdate(
                content: content,
                content_month: month.key,
                next_content: nextContent,
                next_content_set_at: nextContent.isEmpty ? nil : now,
                updated_at: now
            ))
            .eq("id", value: goalID)
            .execute()
        try await archive(goalID: goalID, month: month, content: content)
    }

    /// Promotes next month's draft into the current month. Idempotent, so
    /// whichever device opens first "wins" without breaking the others.
    static func rollover(_ row: WeeklyGoalRow, to month: YearMonth) async throws {
        try await archive(goalID: row.id, month: month, content: row.next_content)
        try await Backend.client.from("weekly_goal")
            .update(GoalUpdate(
                content: row.next_content,
                content_month: month.key,
                next_content: "",
                next_content_set_at: nil,
                updated_at: DBTimestamp.format(Date())
            ))
            .eq("id", value: row.id)
            .execute()
    }

    private static func archive(goalID: String, month: YearMonth, content: String) async throws {
        try await Backend.client.from("weekly_goal_history")
            .upsert(
                HistoryUpsert(goal_id: goalID, month: month.key, content: content, updated_at: DBTimestamp.format(Date())),
                onConflict: "goal_id,month"
            )
            .execute()
    }
}

enum SharedMemoRepository {
    static func fetch() async throws -> [SharedMemoRow] {
        try await Backend.client
            .from("timecard_shared_memos")
            .select(SharedMemoRow.selectColumns)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    static func add(author: String, content: String) async throws {
        try await Backend.client.from("timecard_shared_memos")
            .insert(["author_name": author, "content": content])
            .execute()
    }

    static func update(id: String, author: String, content: String) async throws {
        try await Backend.client.from("timecard_shared_memos")
            .update(["author_name": author, "content": content])
            .eq("id", value: id)
            .execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("timecard_shared_memos").delete().eq("id", value: id).execute()
    }
}

enum TodoRepository {
    private struct Payload: Encodable {
        var title: String
        var body: String
        var image_url: String?
    }

    static func fetch() async throws -> [TodoItemRow] {
        try await Backend.client
            .from("timecard_todo_items")
            .select(TodoItemRow.selectColumns)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    static func add(title: String, body: String, imagePath: String?) async throws {
        try await Backend.client.from("timecard_todo_items")
            .insert(Payload(title: title, body: body, image_url: imagePath))
            .execute()
    }

    static func update(id: String, title: String, body: String, imagePath: String?) async throws {
        try await Backend.client.from("timecard_todo_items")
            .update(Payload(title: title, body: body, image_url: imagePath))
            .eq("id", value: id)
            .execute()
    }

    /// Deletes the row, then its stored image (legacy http URLs are left alone).
    static func delete(_ item: TodoItemRow) async throws {
        try await Backend.client.from("timecard_todo_items").delete().eq("id", value: item.id).execute()
        if case .stored(let bucket, let path) = item.image {
            await AttachmentStore.shared.remove([path], from: bucket)
        }
    }
}
