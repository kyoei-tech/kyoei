import Foundation
import Testing
@testable import KyoeiCore

@Suite struct ReferenceContentTests {
    func car(_ id: String, _ maker: String, _ model: String, code: String = "", memo: String = "") -> HighValueCarRow {
        HighValueCarRow(id: id, maker: maker, model_name: model, model_code: code, memo: memo)
    }

    @Test func lolMapLinks() {
        #expect(LolMap.links.map(\.label) == ["共栄ヤード", "LoL", "港関連", "ネクステージ", "スタンド"])
        #expect(LolMap.links.allSatisfy { $0.url.host() == "www.google.com" })
    }

    @Test func carsGroupedSortedAndSearched() {
        let cars = [
            car("1", "トヨタ", "ランドクルーザー", code: "VJA300W"),
            car("2", " ", "謎の車"),
            car("3", "トヨタ", "アルファード", memo: "最上級グレードのみ"),
            car("4", "BMW", "X7"),
        ]
        let makers = HighValueCars.makers(cars)
        #expect(Set(makers.map(\.maker)) == ["トヨタ", "BMW", "メーカー未設定"])
        #expect(makers.first { $0.maker == "トヨタ" }?.count == 2)
        #expect(HighValueCars.models(of: "トヨタ", in: cars).map(\.id) == ["3", "1"])
        #expect(HighValueCars.models(of: HighValueCarRow.unsetMaker, in: cars).map(\.id) == ["2"])
        #expect(HighValueCars.search("vja", in: cars).map(\.id) == ["1"])
        #expect(HighValueCars.search("あるふぁーど", in: cars, using: KanaSearch()).map(\.id) == ["3"])
        #expect(HighValueCars.search("ぐれーど", in: cars, using: KanaSearch()).map(\.id) == ["3"])
        #expect(HighValueCars.search(" ", in: cars).isEmpty)
        #expect(cars[1].displayName == "謎の車")
        #expect(car("5", "x", "").displayName == "（車種名なし）")
    }

    @Test func carDraftNeedsMakerOrModel() {
        #expect(!HighValueCarDraft(modelCode: "X").canSave)
        #expect(HighValueCarDraft(maker: "BMW").canSave)
        #expect(HighValueCarDraft(modelName: "X7").canSave)
    }
}

@Suite struct AuctionScheduleTests {
    @Test func groupsByWeekdaySortedByName() {
        let rows = [
            AAVenueRow(id: "1", weekday: 1, venue_name: "USS東京"),
            AAVenueRow(id: "2", weekday: 1, venue_name: "TAA関東"),
            AAVenueRow(id: "3", weekday: 6, venue_name: "JU神奈川"),
            AAVenueRow(id: "4", weekday: 9, venue_name: "invalid"),
        ]
        let days = AuctionSchedule.byWeekday(rows, weekday: \.weekday, name: \.venue_name)
        #expect(days.count == 7)
        #expect(days[1].map(\.id) == ["2", "1"])
        #expect(days[6].map(\.id) == ["3"])
        #expect(days.flatMap { $0 }.count == 3)
        #expect(AuctionSchedule.deadlineTimes.first == "0:00" && AuctionSchedule.deadlineTimes.last == "24:00")
        #expect(AuctionSchedule.deadlineTimes.count == 49)
    }
}
