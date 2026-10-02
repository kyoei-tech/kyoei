import Foundation
import KyoeiCore
import Observation
import Supabase

/// 点検簿: inspection items, the signed-in user's recent inspections and the
/// 出庫 gate. A finished inspection is kept on the device first (with its
/// photos) and uploaded when online, so a yard without signal never blocks
/// 出庫. Items are cached too, so the flow works offline after one load.
@MainActor
@Observable
final class InspectionStore {
    private(set) var items: [InspectionItem] = []
    private(set) var profile: MyProfile?
    /// Server records of the last ~2 months.
    private(set) var synced: [InspectionRecord] = []
    /// Finished on this device but not uploaded yet.
    private(set) var pending: [PendingInspection] = []
    private(set) var userID: String?

    struct PendingInspection: Codable, Equatable {
        var record: InspectionRecord
        /// JPEG per results index (否 photos), uploaded before the row.
        var photos: [Int: Data]
    }

    @ObservationIgnored private var syncing = false

    /// Newest first, pending included.
    var records: [InspectionRecord] {
        let syncedIDs = Set(synced.map(\.id))
        return (pending.map(\.record).filter { !syncedIDs.contains($0.id) } + synced)
            .sorted { $0.completed_at > $1.completed_at }
    }

    var canDepartToday: Bool {
        // Never lock drivers out when the items couldn't be loaded at all.
        items.isEmpty || InspectionGate.canDepart(records: records, today: LocalDate(Date()))
    }

    var todaysRecords: [InspectionRecord] {
        let today = LocalDate(Date())
        return records.filter { $0.inspected_on == today }
    }

    /// Last 報告先 typed, offered again next time.
    var lastReportedTo: String {
        get { UserDefaults.standard.string(forKey: "kyoei-inspection-reported-to") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "kyoei-inspection-reported-to") }
    }

    func start(userID: String?) async {
        guard let userID else {
            self.userID = nil
            items = []; synced = []; pending = []; profile = nil
            return
        }
        if self.userID != userID {
            self.userID = userID
            items = Self.load([InspectionItem].self, "items-\(userID)") ?? []
            synced = Self.load([InspectionRecord].self, "records-\(userID)") ?? []
            pending = Self.load([PendingInspection].self, "pending-\(userID)") ?? []
            profile = Self.load(MyProfile.self, "profile-\(userID)")
        }
        await refresh()
    }

    func refresh() async {
        guard let userID else { return }
        let since = LocalDate(Date()).adding(days: -62)
        async let itemsRequest: [InspectionItem] = Backend.client.from("inspection_items")
            .select(InspectionItem.selectColumns).eq("active", value: true).order("sort_order").execute().value
        async let recordsRequest: [InspectionRecord] = Backend.client.from("vehicle_inspections")
            .select(InspectionRecord.selectColumns).eq("user_id", value: userID)
            .gte("inspected_on", value: since.iso).order("completed_at", ascending: false).execute().value
        async let profileRequest: MyProfile = Backend.client.rpc("my_profile").execute().value
        if let fresh = try? await itemsRequest, !fresh.isEmpty {
            items = fresh
            Self.save(fresh, "items-\(userID)")
        }
        if let fresh = try? await recordsRequest {
            synced = fresh
            Self.save(fresh, "records-\(userID)")
        }
        if let fresh = try? await profileRequest {
            profile = fresh
            Self.save(fresh, "profile-\(userID)")
        }
        await sync()
    }

    /// Keeps the finished inspection and uploads it (now or later).
    func finish(_ record: InspectionRecord, photos: [Int: Data]) async {
        guard let userID else { return }
        pending.append(PendingInspection(record: record, photos: photos))
        Self.save(pending, "pending-\(userID)")
        await sync()
    }

    func sync() async {
        guard let userID, !syncing, !pending.isEmpty else { return }
        syncing = true
        defer { syncing = false }
        for entry in pending {
            do {
                var record = entry.record
                for (index, data) in entry.photos where record.results.indices.contains(index) {
                    let path = "\(userID)/\(record.id)-\(index).jpg"
                    do {
                        try await Backend.client.storage.from(AttachmentBucket.inspectionPhotos.rawValue)
                            .upload(path, data: data, options: FileOptions(contentType: "image/jpeg", upsert: false))
                    } catch let error as StorageError where error.statusCode == "409" || error.message.contains("exists") {
                        // Uploaded on an earlier try.
                    }
                    record.results[index].photo_path = path
                }
                do {
                    try await Backend.client.from("vehicle_inspections").insert(record).execute()
                } catch let error as PostgrestError where error.code == "23505" {
                    // Already inserted on an earlier try.
                }
                pending.removeAll { $0.record.id == record.id }
                synced.insert(record, at: 0)
                Self.save(pending, "pending-\(userID)")
                Self.save(synced, "records-\(userID)")
            } catch {
                return // offline: retry on the next refresh
            }
        }
    }

    // MARK: Device storage (Application Support, per account)

    private static func url(_ name: String) -> URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("inspections", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("\(name).json")
    }

    private static func load<T: Decodable>(_ type: T.Type, _ name: String) -> T? {
        guard let url = url(name), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private static func save<T: Encodable>(_ value: T, _ name: String) {
        guard let url = url(name), let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
