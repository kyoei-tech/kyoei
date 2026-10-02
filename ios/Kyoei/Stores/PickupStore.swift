import Foundation
import KyoeiCore
import Observation
import Supabase
@preconcurrency import UserNotifications

enum PickupRepository {
    private struct SheetParams: Encodable { let p_sheet_id: String? }
    private struct RangeParams: Encodable { let p_from: String?; let p_to: String? }
    private struct IDParams: Encodable { let p_id: String }
    private struct ResolveParams: Encodable { let p_id: String; let p_resolved: Bool }
    private struct ReassignParams: Encodable { let p_id: String; let p_approver: String }

    struct Submit: Encodable {
        let p_sheet_id: String
        let p_sheet_title: String
        let p_vehicle: PickupVehicleSnapshot
        let p_reason: String
        let p_detail: String
        let p_photo_paths: [String]
        let p_approver: String
    }

    static func mine(sheetID: String? = nil) async throws -> [PickupFailure] {
        try await Backend.client.rpc("my_pickup_failures", params: SheetParams(p_sheet_id: sheetID)).execute().value
    }

    static func approversOnDuty() async throws -> [PickupApprover] {
        try await Backend.client.rpc("pickup_approvers_on_duty").execute().value
    }

    static func requestsForMe() async throws -> [PickupFailure] {
        try await Backend.client.rpc("pickup_requests_for_me").execute().value
    }

    static func board(from: LocalDate? = nil, to: LocalDate? = nil) async throws -> [PickupFailure] {
        try await Backend.client.rpc("pickup_failure_board", params: RangeParams(p_from: from?.iso, p_to: to?.iso)).execute().value
    }

    static func submit(_ submit: Submit) async throws {
        try await Backend.client.rpc("submit_pickup_failure", params: submit).execute()
    }

    static func approve(id: String) async throws {
        try await Backend.client.rpc("approve_pickup_failure", params: IDParams(p_id: id)).execute()
    }

    static func resolve(id: String, pressed: Bool) async throws {
        try await Backend.client.rpc("resolve_pickup_failure", params: ResolveParams(p_id: id, p_resolved: pressed)).execute()
    }

    static func reassign(id: String, to approver: String) async throws {
        try await Backend.client.rpc("reassign_pickup_failure", params: ReassignParams(p_id: id, p_approver: approver)).execute()
    }

    /// The error text the server raised ("pickup:approver" …), for PickupForm.message.
    static func describe(_ error: Error) -> String {
        if let postgrest = error as? PostgrestError { return PickupForm.message(forServerError: postgrest.message) }
        return PickupForm.message(forServerError: error.localizedDescription)
    }
}

/// 引取不可 for the signed-in user. As a driver: their own requests, with a
/// local notification when one is approved, the approver pressed 解決, or it
/// became 解決済み. As an approver: requests waiting for their answer, shown
/// as 「引取不可の許可を求めています」. While the app is open it checks every
/// few seconds; remote push replaces this once APNs is set up.
@MainActor
@Observable
final class PickupStore {
    private(set) var mine: [PickupFailure] = []
    private(set) var forMe: [PickupFailure] = []
    /// The request put in front of the approver right now.
    var alert: PickupFailure?
    private(set) var userID: String?

    /// Requests the approver has already been shown.
    @ObservationIgnored private var shown: Set<String> = []

    private var seenKey: String { "kyoei-pickup-seen-\(userID ?? "")" }

    func start(userID: String?) async {
        self.userID = userID
        mine = []
        forMe = []
        alert = nil
        shown = []
        await refreshMine()
    }

    /// Runs while the app is in the foreground.
    func poll(approver: Bool) async {
        await refreshMine()
        while !Task.isCancelled {
            if approver { await refreshForMe() }
            if mine.contains(where: \.isOpen) { await refreshMine() }
            try? await Task.sleep(for: .seconds(5))
        }
    }

    func refreshMine() async {
        guard userID != nil, let fresh = try? await PickupRepository.mine() else { return }
        mine = fresh
        await announce(fresh)
    }

    func refreshForMe() async {
        guard let fresh = try? await PickupRepository.requestsForMe() else { return }
        forMe = fresh
        for request in fresh where !shown.contains(request.id) {
            shown.insert(request.id)
            await Self.notify(id: request.id, title: "引取不可の許可を求めています", body: PickupNotice.request(request))
            if alert == nil { alert = request }
        }
        if let current = alert, !fresh.contains(where: { $0.id == current.id }) { alert = nil }
    }

    /// After an action on a record: reload both lists.
    func changed() async {
        await refreshMine()
        if !forMe.isEmpty || alert != nil { await refreshForMe() }
    }

    private func announce(_ records: [PickupFailure]) async {
        let defaults = UserDefaults.standard
        let seen = defaults.dictionary(forKey: seenKey) as? [String: String] ?? [:]
        for change in PickupNotice.driverChanges(records, seen: seen) {
            await Self.notify(id: change.id, title: "引取不可", body: change.message)
        }
        defaults.set(Dictionary(uniqueKeysWithValues: records.map { ($0.id, $0.noticeKey) }), forKey: seenKey)
    }

    private static func notify(id: String, title: String, body: String) async {
        guard await NotificationScheduler.isAuthorized() else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "kyoei.pickup.\(id).\(UUID().uuidString)", content: content, trigger: trigger))
    }
}
