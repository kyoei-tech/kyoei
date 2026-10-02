import Foundation
import KyoeiCore
import Supabase

// Direct Supabase reads/writes for 出勤簿, おしらせ and ヤード配置.

private func now() -> String { DBTimestamp.format(Date()) }

enum StaffRepository {
    private struct Profile: Encodable {
        var name: String
        var role: String
        var vehicle_class: String
        var hire_date: String?
    }

    private struct NewMember: Encodable {
        var name: String
        var role: String
        var vehicle_class: String
        var hire_date: String?
        var status = "off"
        var sort_order: Int
    }

    static func fetch() async throws -> [StaffMemberRow] {
        try await Backend.client.from("staff_members")
            .select(StaffMemberRow.selectColumns)
            .order("sort_order", ascending: true)
            .order("created_at", ascending: true)
            .execute().value
    }

    static func add(name: String, role: String, vehicleClass: String, hireDate: LocalDate?, sortOrder: Int) async throws {
        try await Backend.client.from("staff_members")
            .insert(NewMember(name: name, role: role, vehicle_class: vehicleClass, hire_date: hireDate?.iso, sort_order: sortOrder))
            .execute()
    }

    static func update(id: String, name: String, role: String, vehicleClass: String, hireDate: LocalDate?) async throws {
        try await Backend.client.from("staff_members")
            .update(Profile(name: name, role: role, vehicle_class: vehicleClass, hire_date: hireDate?.iso))
            .eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("staff_members").delete().eq("id", value: id).execute()
    }

    /// Also fires the staff_status push to other devices (DB trigger).
    static func setStatus(id: String, _ status: StaffStatus) async throws {
        try await Backend.client.from("staff_members").update(["status": status.rawValue]).eq("id", value: id).execute()
    }

    static func setComment(id: String, _ comment: String) async throws {
        try await Backend.client.from("staff_members").update(["comment": comment]).eq("id", value: id).execute()
    }
}

enum YardManagerRepository {
    private struct NewManager: Encodable {
        var name: String
        var employment_type: String
        var checked_in = false
        var sort_order: Int
    }

    private struct CheckIn: Encodable {
        var checked_in: Bool
        var checked_in_at: String?
    }

    static func fetch() async throws -> [YardManagerRow] {
        try await Backend.client.from("yard_managers")
            .select(YardManagerRow.selectColumns)
            .order("sort_order", ascending: true)
            .order("created_at", ascending: true)
            .execute().value
    }

    static func add(name: String, type: EmploymentType, sortOrder: Int) async throws {
        try await Backend.client.from("yard_managers")
            .insert(NewManager(name: name, employment_type: type.rawValue, sort_order: sortOrder)).execute()
    }

    static func update(id: String, name: String, type: EmploymentType) async throws {
        try await Backend.client.from("yard_managers")
            .update(["name": name, "employment_type": type.rawValue]).eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("yard_managers").delete().eq("id", value: id).execute()
    }

    static func setCheckedIn(id: String, _ checkedIn: Bool) async throws {
        try await Backend.client.from("yard_managers")
            .update(CheckIn(checked_in: checkedIn, checked_in_at: checkedIn ? now() : nil))
            .eq("id", value: id).execute()
    }

    static func setComment(id: String, _ comment: String) async throws {
        try await Backend.client.from("yard_managers").update(["comment": comment]).eq("id", value: id).execute()
    }
}

enum NewsRepository {
    struct Draft: Encodable, Equatable {
        var title = ""
        var category = ""
        var content = ""
        var author = ""

        var trimmed: Draft {
            Draft(
                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                category: category.trimmingCharacters(in: .whitespacesAndNewlines),
                content: content.trimmingCharacters(in: .whitespacesAndNewlines),
                author: author.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }
    }

    static func fetch() async throws -> [NewsPostRow] {
        try await Backend.client.from("news_posts")
            .select(NewsPostRow.selectColumns)
            .order("created_at", ascending: false)
            .execute().value
    }

    /// The insert also fires the instant おしらせ push (DB trigger).
    static func add(_ draft: Draft) async throws {
        try await Backend.client.from("news_posts").insert(draft.trimmed).execute()
    }

    static func update(id: String, _ draft: Draft) async throws {
        try await Backend.client.from("news_posts").update(draft.trimmed).eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("news_posts").delete().eq("id", value: id).execute()
    }

    /// Newest post created after `lastSeen`, for catching up on missed posts.
    static func newestCreatedAt(after lastSeen: String) async throws -> String? {
        struct Row: Decodable { var created_at: String }
        let rows: [Row] = try await Backend.client.from("news_posts")
            .select("created_at")
            .gt("created_at", value: lastSeen)
            .order("created_at", ascending: false)
            .limit(1)
            .execute().value
        return rows.first?.created_at
    }
}

enum YardRepository {
    private struct PositionLabel: Encodable {
        var label: String
        var updated_at: String
    }

    private struct PositionDestinations: Encodable {
        var destinations: [String]
        var updated_at: String
    }

    private struct NewPosition: Encodable {
        var yard_id: String
        var label: String
        var destinations: [String]
        var sort_order: Int
    }

    private struct NewNamed: Encodable {
        var name: String
        var sort_order: Int
    }

    static func fetchYards() async throws -> [YardRow] {
        try await Backend.client.from("yards").select(YardRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func fetchPositions() async throws -> [YardPositionRow] {
        try await Backend.client.from("yard_rows").select(YardPositionRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func fetchDestinations() async throws -> [YardDestinationRow] {
        try await Backend.client.from("yard_destinations").select(YardDestinationRow.selectColumns)
            .order("name", ascending: true).execute().value
    }

    static func fetchTitles() async throws -> [DestinationTitleRow] {
        try await Backend.client.from("yard_destination_titles").select(DestinationTitleRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func fetchStores() async throws -> [DestinationStoreRow] {
        try await Backend.client.from("yard_destination_stores").select(DestinationStoreRow.selectColumns).execute().value
    }

    static func addYard(name: String, sortOrder: Int) async throws {
        try await Backend.client.from("yards").insert(NewNamed(name: name, sort_order: sortOrder)).execute()
    }

    static func renameYard(id: String, name: String) async throws {
        try await Backend.client.from("yards").update(["name": name, "updated_at": now()]).eq("id", value: id).execute()
    }

    static func deleteYard(id: String) async throws {
        try await Backend.client.from("yards").delete().eq("id", value: id).execute()
    }

    static func addPosition(yardID: String, label: String, destinations: [String], sortOrder: Int) async throws {
        try await Backend.client.from("yard_rows")
            .insert(NewPosition(yard_id: yardID, label: label, destinations: destinations, sort_order: sortOrder)).execute()
    }

    static func setPositionLabel(id: String, _ label: String) async throws {
        try await Backend.client.from("yard_rows").update(PositionLabel(label: label, updated_at: now())).eq("id", value: id).execute()
    }

    static func setPositionDestinations(id: String, _ destinations: [String]) async throws {
        try await Backend.client.from("yard_rows")
            .update(PositionDestinations(destinations: destinations, updated_at: now())).eq("id", value: id).execute()
    }

    static func deletePosition(id: String) async throws {
        try await Backend.client.from("yard_rows").delete().eq("id", value: id).execute()
    }

    static func addDestination(name: String, sortOrder: Int) async throws {
        try await Backend.client.from("yard_destinations").insert(NewNamed(name: name, sort_order: sortOrder)).execute()
    }

    /// Renames a destination and re-points every position that used the old name.
    static func renameDestination(_ destination: YardDestinationRow, to name: String, positions: [YardPositionRow]) async throws {
        try await Backend.client.from("yard_destinations").update(["name": name]).eq("id", value: destination.id).execute()
        for change in YardLayout.renaming(destination.name, to: name, in: positions) {
            try await setPositionDestinations(id: change.id, change.destinations)
        }
    }

    static func deleteDestination(id: String) async throws {
        try await Backend.client.from("yard_destinations").delete().eq("id", value: id).execute()
    }
}
