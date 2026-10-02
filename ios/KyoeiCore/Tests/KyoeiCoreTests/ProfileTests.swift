import Foundation
import Testing
@testable import KyoeiCore

@Suite struct ProfileTests {
    @Test func loadingFloorsPerVehicleClass() {
        #expect(VehicleClass.loader.loadingFloors.isEmpty)
        #expect(VehicleClass.threeCar.loadingFloors == ["上段", "下段前", "下段後"])
        #expect(VehicleClass.fiveCar.loadingFloors == ["1番", "2番", "3番", "4番", "5番"])
        #expect(VehicleClass.trailerLifter.loadingFloors == ["1番", "2番", "3番", "4番", "5番", "6番"])
        #expect(VehicleClass.trailerHanging.loadingFloors == ["1番", "2番", "3番", "4番", "5番", "宙吊り", "6番"])
        #expect(VehicleClass.cabTrailerLifter.loadingFloors == ["0番", "1番", "2番", "3番", "4番", "5番", "6番"])
        #expect(VehicleClass.cabTrailerHanging.loadingFloors == ["0番", "1番", "2番", "3番", "4番", "5番", "宙吊り", "6番"])
        #expect(VehicleClass.cabTrailerHanging.isTrailer && !VehicleClass.fiveCar.isTrailer)
    }

    @Test func decodesMyProfile() throws {
        let json = #"{"login_id":"1001","full_name":"共栄　太郎","position":"アルバイト","hire_date":"2020-04-01","vehicle_class":"cab_trailer_hanging","vehicle":{"plate":"相模 100 あ 1234","kind":"head","vehicle_class":"cab_trailer_hanging","schedules":[{"id":"s2","kind":"shaken","scheduled_on":"2027-03-31","scheduled_time":"","place":"","handover":"bring","vendor":"","notes":""},{"id":"s1","kind":"inspection_12m","scheduled_on":"2026-10-20","scheduled_time":"9:30","place":"日野厚木","handover":"pickup","vendor":"日野自動車","notes":"タイヤ交換も"}]},"chassis":{"plate":"相模 130 い 5678","kind":"chassis","vehicle_class":null,"schedules":[]},"health_check":{"id":"h1","scheduled_on":"2026-12-01","scheduled_time":"9:00","place":"〇〇クリニック","notes":""},"last_health_check":"2025-12-02"}"#
        let p = try JSONDecoder().decode(MyProfile.self, from: Data(json.utf8))
        #expect(p.vehicle_class == .cabTrailerHanging)
        #expect(p.vehicles.map(\.kindLabel) == ["ヘッド", "台車"])
        #expect(p.familyName == "共栄")
        #expect(p.hireDate == LocalDate(year: 2020, month: 4, day: 1))
        let twelve = try #require(p.vehicle?.next(.inspection12m))
        #expect(twelve.handoverLabel == "日野自動車引取" && twelve.detailLabel == "日野厚木・日野自動車引取")
        #expect(AppointmentText.when(twelve.scheduled_on, time: twelve.scheduled_time, calendar: tokyo) == "10/20(火) 9:30")
        #expect(p.vehicle?.next(.inspection3m) == nil && p.chassis?.schedules.isEmpty == true)
        #expect(p.health_check?.place == "〇〇クリニック")
        let empty = try JSONDecoder().decode(MyProfile.self, from: Data(#"{"login_id":"1002","full_name":"","position":null,"hire_date":null,"vehicle_class":null,"vehicle":null,"chassis":null,"health_check":null,"last_health_check":null}"#.utf8))
        #expect(empty.vehicles.isEmpty && empty.familyName == nil)
    }

    @Test func appointmentNotices() {
        let schedule = VehicleAppointment(id: "s1", kind: .shaken, scheduled_on: LocalDate(year: 2026, month: 10, day: 20), scheduled_time: "9:30", place: "日野厚木")
        let profile = MyProfile(login_id: "1", vehicle: ProfileVehicle(plate: "相模100", kind: "truck", schedules: [schedule]),
                                health_check: HealthAppointment(id: "h1", scheduled_on: LocalDate(year: 2026, month: 12, day: 1), place: "クリニック"))
        let items = AppointmentNotice.items(of: profile)
        #expect(items.map(\.id) == ["s1", "h1"])
        #expect(items[0].message.hasPrefix("車検（相模100）：10/20("))
        #expect(AppointmentNotice.changes(items, seen: nil).isEmpty)
        #expect(AppointmentNotice.changes(items, seen: [:]).count == 2)
        var moved = schedule
        moved.scheduled_time = "10:00"
        let after = AppointmentNotice.items(of: MyProfile(login_id: "1", vehicle: ProfileVehicle(plate: "相模100", kind: "truck", schedules: [moved])))
        #expect(AppointmentNotice.changes(after, seen: Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0.key) })).map(\.id) == ["s1"])
    }
}
