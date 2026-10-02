import Foundation
import Testing
@testable import KyoeiCore

@Suite struct ChassisVoiceTests {
    @Test func spokenLettersAndDigits() {
        #expect(SpokenChassis.normalize("ゼットブイダブリュー30ハイフン1234567") == "ZVW30-1234567")
        #expect(SpokenChassis.normalize("ぜっと ぶい だぶりゅー さんぜろ はいふん いち に さん よん ご ろく なな") == "ZVW30-1234567")
        #expect(SpokenChassis.normalize("ジーピー3の1022135") == "GP3-1022135")
        #expect(SpokenChassis.normalize("エヌゼットイー百八十一 ダッシュ 一〇二三四五六") == "NZE181-1023456")
        #expect(SpokenChassis.normalize("ＧＫ３－１２３４５６７") == "GK3-1234567")
        #expect(SpokenChassis.normalize("エイチエイチ5 ハイフン 3") == "HH5-3")
        #expect(SpokenChassis.normalize("ブイゼットエヌワイ12-103585") == "VZNY12-103585")
    }

    @Test func checkCaptionsMentionVoice() {
        let row = ChassisCheckRow(id: "c", sheet_id: "s", chassis_number: "GB5-1130359", vehicle_index: 1, method: .stamp, checked_at: "x", input: .voice)
        #expect(row.headline == "刻印（音声）で記録")
        let camera = ChassisCheckRow(id: "c", sheet_id: "s", chassis_number: "GB5-1130359", method: .cautionPlate, checked_at: "x")
        #expect(camera.headline == "コーションプレートで照合")
    }

    @Test func onlyRecordsKeepPhotos() {
        let printed = DispatchVehicle(id: 0, round: "1", vehicleName: "フィット", chassisNumber: "GK3-1234567", pickup: "A", dropoff: "B")
        let blank = DispatchVehicle(id: 1, round: "1", vehicleName: "ノート", chassisNumber: "", pickup: "A", dropoff: "B")
        #expect(ChassisCheckInsert(sheetID: "s", vehicle: printed, read: "GK3-1234567", method: .cautionPlate, photoPath: "u/p.jpg").photo_path == nil)
        let record = ChassisCheckInsert(sheetID: "s", vehicle: blank, read: "E12-123456", method: .stamp, input: .voice, photoPath: "u/p.jpg")
        #expect(record.photo_path == "u/p.jpg" && record.input == .voice && record.vehicle_index == 1)
    }
}
