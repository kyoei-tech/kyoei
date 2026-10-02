import Foundation
import KyoeiCore
import Supabase

enum AccidentRepository {
    private struct Payload: Encodable {
        var occurred_on: String
        var category: String
        var vehicle_class: String
        var location: String
        var description: String

        init(_ draft: AccidentDraft) {
            occurred_on = draft.occurredOn.iso
            category = draft.category
            vehicle_class = draft.vehicleClass.trimmingCharacters(in: .whitespaces)
            location = draft.location.trimmingCharacters(in: .whitespaces)
            description = draft.description.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    private struct NewCategory: Encodable {
        var name: String
        var sort_order: Int
    }

    static func fetch() async throws -> [AccidentRecordRow] {
        try await Backend.client.from("accident_records").select(AccidentRecordRow.selectColumns)
            .order("occurred_on", ascending: false).execute().value
    }

    static func add(_ draft: AccidentDraft) async throws {
        try await Backend.client.from("accident_records").insert(Payload(draft)).execute()
    }

    static func update(id: String, _ draft: AccidentDraft) async throws {
        try await Backend.client.from("accident_records").update(Payload(draft)).eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("accident_records").delete().eq("id", value: id).execute()
    }

    static func addCategory(name: String, sortOrder: Int) async throws {
        try await Backend.client.from("accident_categories").insert(NewCategory(name: name, sort_order: sortOrder)).execute()
    }
}
