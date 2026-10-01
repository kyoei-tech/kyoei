import Foundation
import Testing
@testable import KyoeiCore

@Suite struct ListOfLocationTests {
    @Test func decodesRowsWithNullsAndJSONColumns() throws {
        let json = #"""
        {"id":"1","destination_id":"ippan","shop_name":"東京ベイ店","address":null,"phone":"03-1111-2222",
         "hours":"夜間OK","break_time":"12:00〜13:00","place":"","event_day":"","memo":"","exit_method":"","method":"","notes":"",
         "cal_out":null,"cal_in":["〇"],
         "vehicle_permission":{"trailer":{"status":"条件あり","condition":"夜のみ"},"compact":{"status":"〇","condition":""},"bogus":{"status":"〇"}},
         "visited_by":[{"id":"v1","name":"山田"}]}
        """#
        let row = try JSONDecoder().decode(LolEntryRow.self, from: Data(json.utf8))
        #expect(row[.shopName] == "東京ベイ店")
        #expect(row[.address] == "")
        #expect(row.calOut == LolEntryRow.emptyWeek)
        #expect(row.calIn == ["〇", "", "", "", "", "", ""])
        #expect(row.hasCalendar)
        #expect(row.vehiclePermission[.trailer] == VehiclePermission.Entry(status: .conditional, condition: "夜のみ"))
        #expect(row.vehiclePermission[.trailer].displayStatus == "△")
        #expect(row.vehiclePermission[.loader].status == .unset)
        #expect(row.vehiclePermission.isSet)
        #expect(row.visitedBy.map(\.name) == ["山田"])
    }

    @Test func timeRangeEncoding() {
        #expect(TimeRangeValue("夜間OK", special: "夜間OK") == .special)
        #expect(TimeRangeValue("9:00〜", special: "〇") == .range(start: "9:00", end: ""))
        #expect(TimeRangeValue("〜12:00", special: "〇") == .range(start: "", end: "12:00"))
        #expect(TimeRangeValue("", special: "〇") == .unset)
        #expect(TimeRangeValue.range(start: "8:00", end: "17:30").encoded(special: "なし") == "8:00〜17:30")
        #expect(TimeRangeValue.special.encoded(special: "なし") == "なし")
        #expect(TimeRangeValue.cellText("〇") == "24h")
        #expect(TimeRangeValue.cellText("9:00〜セリ終了後") == "9:00〜セリ終了後")
        #expect(TimeRangeValue.cellText("") == "—")
        #expect(TimeRangeValue.halfHourOptions.prefix(3) == ["0:00", "0:30", "1:00"])
        #expect(TimeRangeValue.halfHourOptions.last == "24:00")
        #expect(TimeRangeValue.hourlyOptions.last == "セリ終了後")
    }

    @Test func permissionClearsConditionUnlessConditional() {
        var permission = VehiclePermission()
        permission[.loader] = .init(status: .conditional, condition: "要予約")
        #expect(permission[.loader].condition == "要予約")
        permission[.loader] = .init(status: .ok, condition: "要予約")
        #expect(permission[.loader].condition.isEmpty)
        #expect(!VehiclePermission().isSet)
    }

    @Test func payloadKeysDependOnDestination() throws {
        var draft = LolEntryDraft()
        draft[.shopName] = " 会場A "
        draft.addVisitor(" 佐藤 ")
        draft.addVisitor("  ")
        #expect(draft.visitedBy.map(\.name) == ["佐藤"])
        let aa = try JSONSerialization.jsonObject(with: JSONEncoder().encode(LolEntryPayload(destinationID: "aa", draft: draft))) as! [String: Any]
        #expect(aa["shop_name"] as? String == "会場A")
        #expect(aa["cal_out"] != nil && aa["visited_by"] == nil)
        let other = try JSONSerialization.jsonObject(with: JSONEncoder().encode(LolEntryPayload(destinationID: "nx", draft: draft))) as! [String: Any]
        #expect(other["cal_out"] == nil && other["visited_by"] != nil && other["vehicle_permission"] != nil)
        #expect(!LolEntryDraft().canSave && draft.canSave)
    }

    @Test func fieldsAndSearch() {
        #expect(LolField.fields(isAA: true).contains(.eventDay))
        #expect(!LolField.fields(isAA: false).contains(.eventDay))
        #expect(LolField.shopName.label(isAA: true) == "会場名")
        let rows = [
            LolEntryRow(id: "1", destinationID: "ippan", values: [.shopName: "東京ベイ店", .address: "江東区"]),
            LolEntryRow(id: "2", destinationID: "ippan", values: [.shopName: "大阪店"]),
            LolEntryRow(id: "3", destinationID: "aa", values: [.shopName: "USS東京"], calIn: ["9:00〜", "", "", "", "", "", ""]),
        ]
        #expect(ListOfLocation.entriesByDestination(rows)["ippan"]?.map(\.id) == ["2", "1"])
        let results = ListOfLocation.search("とうきょう", rows: rows, using: KanaSearch())
        #expect(results.map(\.entry.id) == ["1", "3"])
        // A destination-name match returns all of its entries.
        #expect(ListOfLocation.search("オートオークション", rows: rows).map(\.entry.id) == ["3"])
        #expect(ListOfLocation.search("9:00", rows: rows).map(\.entry.id) == ["3"])
    }
}
