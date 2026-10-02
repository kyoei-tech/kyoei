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
        let json = #"{"login_id":"1001","full_name":"共栄　太郎","position":"アルバイト","hire_date":"2020-04-01","vehicle_class":"cab_trailer_hanging","health_check_due":"2026-12-01","vehicle":{"plate":"相模 100 あ 1234","kind":"head","shaken_due":"2027-03-31","inspection_3m_due":"2026-11-15","inspection_12m_due":"2027-05-15"},"chassis":{"plate":"相模 130 い 5678","kind":"chassis","shaken_due":"2027-01-20","inspection_3m_due":null,"inspection_12m_due":null}}"#
        let p = try JSONDecoder().decode(MyProfile.self, from: Data(json.utf8))
        #expect(p.vehicle_class == .cabTrailerHanging)
        #expect(p.vehicles.map(\.kindLabel) == ["ヘッド", "台車"])
        #expect(p.familyName == "共栄")
        #expect(p.hireDate == LocalDate(year: 2020, month: 4, day: 1))
        let empty = try JSONDecoder().decode(MyProfile.self, from: Data(#"{"login_id":"1002","full_name":"","position":null,"hire_date":null,"vehicle_class":null,"health_check_due":null,"vehicle":null,"chassis":null}"#.utf8))
        #expect(empty.vehicles.isEmpty && empty.familyName == nil)
    }

    @Test func dueDates() {
        let today = LocalDate(year: 2026, month: 10, day: 3)
        #expect(DueDate(iso: "2026-10-02", today: today, calendar: tokyo)?.status == .overdue)
        #expect(DueDate(iso: "2026-10-03", today: today, calendar: tokyo)?.label == "2026年10月3日（今日）")
        #expect(DueDate(iso: "2026-11-02", today: today, calendar: tokyo)?.label == "2026年11月2日（あと30日）")
        #expect(DueDate(iso: "2026-11-03", today: today, calendar: tokyo)?.status == .ok)
        #expect(DueDate(iso: nil, today: today, calendar: tokyo) == nil)
    }
}
