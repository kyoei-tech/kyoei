import Foundation
import KyoeiCore
import Supabase

// Writes behind 設定's secret 通知の管理 screens and the Version page.

enum PushRuleRepository {
    private struct Insert: Encodable {
        var timer_type: String
        var threshold_ms: Int
        var title: String
        var message: String
    }

    private struct Update: Encodable {
        var threshold_ms: Int
        var title: String
        var message: String
    }

    static func add(type: NotificationTimerType, threshold: TimeInterval, title: String, message: String) async throws {
        try await Backend.client.from("push_notification_rules")
            .insert(Insert(timer_type: type.rawValue, threshold_ms: Int(threshold * 1000), title: title, message: message))
            .execute()
    }

    static func update(id: String, threshold: TimeInterval, title: String, message: String) async throws {
        try await Backend.client.from("push_notification_rules")
            .update(Update(threshold_ms: Int(threshold * 1000), title: title, message: message))
            .eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("push_notification_rules").delete().eq("id", value: id).execute()
    }
}

enum ConfirmMessageRepository {
    static func update(id: String, _ update: ConfirmMessageUpdate) async throws {
        try await Backend.client.from("confirm_action_messages").update(update).eq("id", value: id).execute()
    }
}

enum DestinationRegistryRepository {
    private struct NewTitle: Encodable {
        var title: String
        var sort_order: Int
    }

    private struct NewStore: Encodable {
        var title_id: String
        var name: String
        var sort_order: Int
    }

    static func fetchStores() async throws -> [DestinationStoreRow] {
        try await Backend.client.from("yard_destination_stores").select(DestinationStoreRow.registryColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func addTitle(_ title: String, sortOrder: Int) async throws {
        try await Backend.client.from("yard_destination_titles").insert(NewTitle(title: title, sort_order: sortOrder)).execute()
    }

    static func renameTitle(id: String, _ title: String) async throws {
        try await Backend.client.from("yard_destination_titles").update(["title": title]).eq("id", value: id).execute()
    }

    static func deleteTitle(id: String) async throws {
        try await Backend.client.from("yard_destination_titles").delete().eq("id", value: id).execute()
    }

    static func addStores(_ names: [String], titleID: String, startingAt order: Int) async throws {
        let rows = names.enumerated().map { NewStore(title_id: titleID, name: $0.element, sort_order: order + $0.offset) }
        try await Backend.client.from("yard_destination_stores").insert(rows).execute()
    }

    static func renameStore(id: String, _ name: String) async throws {
        try await Backend.client.from("yard_destination_stores").update(["name": name]).eq("id", value: id).execute()
    }

    static func deleteStore(id: String) async throws {
        try await Backend.client.from("yard_destination_stores").delete().eq("id", value: id).execute()
    }
}

enum ChangelogRepository {
    struct EntryDraft: Equatable {
        var page = ""
        var kind: ChangeKind = .added
        var description = ""

        var isComplete: Bool {
            !page.trimmingCharacters(in: .whitespaces).isEmpty && !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private struct Insert: Encodable {
        var version: String
        var version_date: String
        var version_order: Int
        var entry_order: Int
        var page: String
        var kind: String
        var description: String
        var hidden = false
    }

    private struct Update: Encodable {
        var page: String
        var kind: String
        var description: String
    }

    static func fetch() async throws -> [ChangelogRow] {
        try await Backend.client.from("changelog_entries").select(ChangelogRow.selectColumns)
            .order("version_order", ascending: true).order("entry_order", ascending: true).execute().value
    }

    static func addEntry(_ draft: EntryDraft, version: String, date: String, versionOrder: Int, entryOrder: Int) async throws {
        try await Backend.client.from("changelog_entries").insert(Insert(
            version: version,
            version_date: date,
            version_order: versionOrder,
            entry_order: entryOrder,
            page: draft.page.trimmingCharacters(in: .whitespaces),
            kind: draft.kind.rawValue,
            description: draft.description.trimmingCharacters(in: .whitespacesAndNewlines)
        )).execute()
    }

    /// Blank fields keep their previous value, as on the web.
    static func update(_ row: ChangelogRow, with draft: EntryDraft) async throws {
        let page = draft.page.trimmingCharacters(in: .whitespaces)
        let description = draft.description.trimmingCharacters(in: .whitespacesAndNewlines)
        try await Backend.client.from("changelog_entries")
            .update(Update(page: page.isEmpty ? row.page : page, kind: draft.kind.rawValue, description: description.isEmpty ? row.description : description))
            .eq("id", value: row.id).execute()
    }

    static func setHidden(id: String, _ hidden: Bool) async throws {
        try await Backend.client.from("changelog_entries").update(["hidden": hidden]).eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("changelog_entries").delete().eq("id", value: id).execute()
    }
}
