import Foundation
import Testing
@testable import KyoeiCore

@Suite struct PickupFailureTests {
    func record(id: String = "p1", vehicle: Int = 0, created: String = "2026-10-03T08:00:00+09:00", _ change: (inout PickupFailure) -> Void = { _ in }) -> PickupFailure {
        let json = #"{"id":"\#(id)","user_id":"driver","driver_name":"共栄 太郎","driver_phone":"09012345678","sheet_id":"s1","sheet_title":"10/3 配車表","vehicle_index":\#(vehicle),"round":"1","vehicle_name":"プリウス","chassis_number":"ZVW30-1234567","pickup":"USS東京","pickup_ref":"1234","dropoff":"相模","dropoff_ref":"","pickup_date":"10/03","dropoff_date":"10/04","reason":"no_key","detail":"","photo_paths":["driver/a.jpg"],"approver_id":"boss","approver_name":"運輸 課長","approver_phone":"0311112222","approved_at":null,"approved_by_name":null,"driver_resolved_at":null,"approver_resolved_at":null,"approver_resolved_by_name":null,"resolved_at":null,"status":"pending","created_at":"\#(created)","updated_at":"\#(created)"}"#
        var r = try! JSONDecoder().decode(PickupFailure.self, from: Data(json.utf8))
        change(&r)
        return r
    }

    @Test func decodesAndDescribesWaiting() {
        let r = record()
        #expect(r.reason == .noKey && r.reason.label == "鍵が無い" && r.isOpen)
        #expect(r.waitingLine == "運輸 課長さんの承認待ち")
        let driverPressed = record { $0.driver_resolved_at = "2026-10-03T08:10:00+09:00" }
        #expect(driverPressed.waitingLine == "解決を押しました。運輸 課長さんの解決待ち")
        #expect(driverPressed.hasPressedResolve(userID: "driver") && !driverPressed.hasPressedResolve(userID: "boss"))
        let bossPressed = record { $0.approver_resolved_at = "2026-10-03T08:10:00+09:00" }
        #expect(bossPressed.waitingLine?.hasPrefix("運輸 課長さんが解決を押しました") == true)
        #expect(record { $0.status = .approved }.waitingLine == nil)
    }

    @Test func formProblems() {
        #expect(PickupForm.problem(reason: nil, detail: "", photoCount: 1) == "理由を選んでください。")
        #expect(PickupForm.problem(reason: .other, detail: "  ", photoCount: 1) == "「その他」のときは、詳細を入力してください。")
        #expect(PickupForm.problem(reason: .noVehicle, detail: "", photoCount: 0) == "写真を1枚以上入れてください。")
        #expect(PickupForm.problem(reason: .noVehicle, detail: "", photoCount: 11) == "写真は10枚までです。")
        #expect(PickupForm.problem(reason: .other, detail: "門が閉まっていた", photoCount: 2) == nil)
        #expect(PickupForm.message(forServerError: "pickup:approver") == "選んだ人が退勤したか、承認できなくなりました。選び直してください。")
        #expect(PickupForm.message(forServerError: "boom") == "送信できませんでした。通信状況を確認してください。")
    }

    @Test func newestRecordPerCarAndApprovedCarsLeftOutOfCounts() {
        let old = record(id: "old", vehicle: 1, created: "2026-10-03T07:00:00+09:00") { $0.status = .resolved }
        let new = record(id: "new", vehicle: 1, created: "2026-10-03T09:00:00+09:00") { $0.status = .approved }
        let other = record(id: "x", vehicle: 2) { $0.sheet_id = "s2"; $0.status = .approved }
        let index = PickupFailures([new, old, other], sheetID: "s1")
        let car = DispatchVehicle(id: 1, round: "1", vehicleName: "プリウス", chassisNumber: "ZVW30-1234567", pickup: "A", dropoff: "B")
        let car2 = DispatchVehicle(id: 2, round: "1", vehicleName: "N-BOX", chassisNumber: "JF1-1111111", pickup: "A", dropoff: "B")
        #expect(index.record(for: car)?.id == "new")
        #expect(index.record(for: car2) == nil)
        #expect(index.notPickedUp == [1])
        let progress = ChassisCheckProgress(vehicles: [car, car2], checks: ChassisChecks([]), excluding: index.notPickedUp)
        #expect(progress.total == 1 && progress.checked == 0)
    }

    @Test func snapshotCopiesTheCar() throws {
        let car = DispatchVehicle(id: 3, round: "2", vehicleName: "プリウス", chassisNumber: "ZVW30-1234567", pickup: "USS東京", pickupRef: "1234", dropoff: "相模", pickupDate: "10/03")
        let snapshot = PickupVehicleSnapshot(car)
        #expect(snapshot.vehicle_index == 3 && snapshot.round == "2" && snapshot.pickup_ref == "1234" && snapshot.dropoff_date == "")
    }

    @Test func driverNoticesOnlyForChanges() {
        let pending = record()
        #expect(PickupNotice.driverChanges([pending], seen: [:]).isEmpty)
        let approved = record { $0.status = .approved; $0.approved_by_name = "運輸 課長" }
        #expect(PickupNotice.driverChanges([approved], seen: ["p1": pending.noticeKey]).map(\.message) == ["プリウスの引取不可が承認されました（運輸 課長）"])
        #expect(PickupNotice.driverChanges([approved], seen: ["p1": approved.noticeKey]).isEmpty)
        let bossPressed = record { $0.approver_resolved_at = "x" }
        #expect(PickupNotice.driverChanges([bossPressed], seen: ["p1": pending.noticeKey]).map(\.message) == ["運輸 課長さんが「解決」を押しました。解決なら、あなたも「解決」を押してください"])
        let resolved = record { $0.status = .resolved; $0.approver_resolved_at = "x"; $0.driver_resolved_at = "y" }
        #expect(PickupNotice.driverChanges([resolved], seen: ["p1": bossPressed.noticeKey]).map(\.message) == ["プリウスは解決済みになりました。通常どおり輸送してください"])
        #expect(PickupNotice.request(pending) == "共栄 太郎さんが引取不可の許可を求めています（プリウス）")
    }

    @Test func accountPermissions() throws {
        let old = try JSONDecoder().decode(AccountRow.self, from: Data(#"{"user_id":"u","login_id":"1001","is_driver":true,"can_search_customers":false,"is_admin":false,"disabled_at":null}"#.utf8))
        #expect(!old.canApprovePickup && !old.canViewPickup)
        let approver = AccountRow(user_id: "u", login_id: "1001", can_approve_pickup_failure: true)
        #expect(approver.canApprovePickup && approver.canViewPickup && approver.roleLabel == "ドライバー・引取不可の承認")
        let viewer = AccountRow(user_id: "u", login_id: "1001", can_view_pickup_failure: true)
        #expect(!viewer.canApprovePickup && viewer.canViewPickup && viewer.roleLabel == "ドライバー・引取不可の閲覧")
    }
}
