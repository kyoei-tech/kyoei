import Foundation
import Testing
@testable import KyoeiCore

@Suite struct DispatchSheetContentTests {
    // parse-dispatch-sheet output (v2), trimmed.
    static let v2 = #"""
    {"parserVersion":2,"dispatchDate":"09月01日","vehicleNumber":"9999","dispatchNumber":"0000000001","vehicleCount":3,"warnings":[],
     "rounds":[
      {"round":"1","vehicles":[
        {"round":"1","vehicleName":"ノート","auctionInfo":"練馬1234","chassisNumber":"E13-111111","billTo":"テスト商会","pickup":"共栄 本郷ヤード","pickupRef":"","dropoff":"テストAA","dropoffRef":"","pickupDateDetail":"08/19 以降","dropoffDateDetail":"迄","pickupDate":"08/19","pickupCondition":"以降","dropoffDate":null,"dropoffCondition":"迄","notes":"050-0000-0000瀬戸1-1","phone":"050-0000-0000","phones":["050-0000-0000"],"alerts":[],"shipFrom":"NR金沢八景駅前 金","deliverTo":"テストAA担当様","lashing":"","warnings":[]}]},
      {"round":"2","vehicles":[
        {"round":"2","vehicleName":"フリード","auctionInfo":"28034","chassisNumber":"GB5-1130359","billTo":"マルタチ","pickup":"共栄 本郷ヤード","pickupRef":"","dropoff":"ECL木更津","dropoffRef":"","pickupDate":"08/25","pickupCondition":"以降","dropoffDate":"09/02","dropoffCondition":"迄","notes":"","phones":[],"alerts":["早急"],"shipFrom":"","deliverTo":"","lashing":"","warnings":[]},
        {"round":"2","vehicleName":"アルト","auctionInfo":"6200","chassisNumber":"HA36S-522329","billTo":"東西海運","pickup":"JU神奈川","pickupRef":"【搬出】(39505)","dropoff":"木更津JFA","dropoffRef":"","pickupDate":"08/28","pickupCondition":"以降","dropoffDate":"09/01","dropoffCondition":"迄","notes":"","phones":[],"alerts":[],"shipFrom":"","deliverTo":"","lashing":"","warnings":["車体番号の形式がいつもと違います"]}]}]}
    """#

    // The web app's in-browser parser output (v1): raw 半角カナ, combined dates.
    static let v1 = #"""
    {"dispatchDate":"09月01日","vehicleNumber":"9999","driverName":"x","dispatchNumber":"1","vehicleCount":1,
     "rounds":[{"round":"2","vehicles":[{"round":"2","vehicleName":"ﾌﾘｰﾄﾞｽﾊﾟｲｸ","auctionInfo":"28083","chassisNumber":"GP3-1022135","billTo":"ﾏﾙﾀﾁ","pickup":"共栄 本郷ﾔｰﾄﾞ","dropoff":"ECL木更津 ｵｰｼｬﾝﾔｰﾄﾞ","pickupDateDetail":"08/25 以降","dropoffDateDetail":"9/4 迄","notes":"ﾅﾝﾊﾞｰｶｯﾄ","phone":"050-1111-2222"}]}]}
    """#

    static func decode(_ json: String) throws -> DispatchSheetContent {
        try JSONDecoder().decode(DispatchSheetContent.self, from: Data(json.utf8))
    }

    @Test func decodesParserV2() throws {
        let sheet = try Self.decode(Self.v2)
        #expect(sheet.parserVersion == 2)
        #expect(sheet.rounds.map(\.title) == ["1回戦", "2回戦"])
        #expect(sheet.vehicles.map(\.id) == [0, 1, 2])
        let alto = sheet.vehicles[2]
        #expect(alto.pickupRef == "【搬出】(39505)")
        #expect(alto.dropoffDate == "09/01")
        #expect(alto.warnings == ["車体番号の形式がいつもと違います"])
        #expect(alto.chassisNumber == "HA36S-522329")
        #expect(sheet.vehicles[0].dropoffDate == nil && sheet.vehicles[0].dropoffCondition == "迄")
    }

    @Test func decodesWebParserV1WithNormalization() throws {
        let sheet = try Self.decode(Self.v1)
        #expect(sheet.parserVersion == 1)
        let v = sheet.vehicles[0]
        #expect(v.vehicleName == "フリードスパイク")
        #expect(v.pickup == "共栄 本郷ヤード")
        #expect(v.pickupDate == "08/25" && v.pickupCondition == "以降")
        #expect(v.dropoffDate == "09/04" && v.dropoffCondition == "迄")
        #expect(v.phones == ["050-1111-2222"])
        #expect(v.alerts.isEmpty && v.shipFrom.isEmpty)
    }

    @Test func routesGroupByPickupAndDropoffInSheetOrder() throws {
        var round = try Self.decode(Self.v2).rounds[1]
        round.vehicles.append(DispatchVehicle(id: 9, round: "2", vehicleName: "ヴェゼル", chassisNumber: "RU1-1306182", pickup: "共栄 本郷ヤード", dropoff: "ECL木更津", dropoffDate: "09/03"))
        let routes = round.routes
        #expect(routes.map(\.id) == ["共栄 本郷ヤード→ECL木更津", "JU神奈川→木更津JFA"])
        #expect(routes[0].vehicles.map(\.vehicleName) == ["フリード", "ヴェゼル"])
        let today = LocalDate(year: 2026, month: 9, day: 1)
        #expect(routes[0].earliestDropoff(today: today)?.date == LocalDate(year: 2026, month: 9, day: 2))
        #expect(routes[0].earliestDropoff(today: today)?.urgency == .tomorrow)
    }

    @Test func dueUrgencyIsTodayRedTomorrowYellow() {
        let today = LocalDate(year: 2026, month: 9, day: 1)
        func urgency(_ md: String?) -> DispatchDue.Urgency? { DispatchDue(monthDay: md, today: today, calendar: tokyo)?.urgency }
        #expect(urgency("09/01") == .today)
        #expect(urgency("09/02") == .tomorrow)
        #expect(urgency("09/03") == .later)
        #expect(urgency("08/31") == .overdue)
        #expect(urgency(nil) == nil && urgency("13/40") == nil && urgency("迄") == nil)
        #expect(DispatchDue(monthDay: "09/01", today: today, calendar: tokyo)?.label == "今日")
        #expect(DispatchDue(monthDay: "09/02", today: today, calendar: tokyo)?.isUrgent == false)
        #expect(DispatchDue(monthDay: "08/31", today: today, calendar: tokyo)?.isUrgent == true)
    }

    @Test func dueYearWrapsAroundNewYear() {
        let lateDecember = LocalDate(year: 2026, month: 12, day: 31)
        let due = DispatchDue(monthDay: "01/01", today: lateDecember, calendar: tokyo)
        #expect(due?.date == LocalDate(year: 2027, month: 1, day: 1))
        #expect(due?.urgency == .tomorrow)
        let earlyJanuary = LocalDate(year: 2027, month: 1, day: 2)
        #expect(DispatchDue(monthDay: "12/31", today: earlyJanuary, calendar: tokyo)?.urgency == .overdue)
    }

    @Test func chassisNormalization() {
        #expect(ChassisNumber.normalize("ｇｐ３－１０２２１３５") == "GP3-1022135")
        #expect(ChassisNumber.normalize(" GP3ー1022135 ") == "GP3-1022135")
        #expect(ChassisNumber.normalize("gp3 - 1022135") == "GP3-1022135")
    }

    @Test func candidatesAreReadFromCautionPlateText() {
        let lines = ["HONDA", "車台番号 GP3 - 1O22135", "型式 DAA-GP3", "原動機の型式 LEB"]
        #expect(ChassisNumber.candidates(in: lines) == ["GP3-1022135"])
        #expect(ChassisNumber.candidates(in: ["VIN WBA8E36060NU12345"]) == ["WBA8E36060NU12345"])
        #expect(ChassisNumber.candidates(in: ["TOYOTA", "1500cc"]).isEmpty)
        // The model code is never "repaired": an O there stays an O.
        #expect(ChassisNumber.candidates(in: ["GPO-1022135"]) == ["GPO-1022135"])
    }

    @Test func matchingIsExactOnly() throws {
        let vehicles = try Self.decode(Self.v2).vehicles
        #expect(ChassisMatch.evaluate(candidates: [], against: vehicles) == nil)
        #expect(ChassisMatch.evaluate(candidates: ["GB5-1130359"], against: vehicles) == .matched(vehicle: vehicles[1], chassis: "GB5-1130359"))
        // One digit off, or only the last 4 digits agreeing, is a mismatch.
        #expect(ChassisMatch.evaluate(candidates: ["GB5-1130358"], against: vehicles) == .mismatch(read: "GB5-1130358"))
        #expect(ChassisMatch.evaluate(candidates: ["GB6-1130359"], against: vehicles) == .mismatch(read: "GB6-1130359"))
        // Any candidate that matches wins over earlier noise.
        #expect(ChassisMatch.evaluate(candidates: ["DAA-12345", "HA36S-522329"], against: vehicles) == .matched(vehicle: vehicles[2], chassis: "HA36S-522329"))
    }

    @Test func checkRowsCaptionAndProgress() throws {
        let row = ChassisCheckRow(id: "c", sheet_id: "s", chassis_number: "GB5-1130359", method: .cautionPlate, checked_at: "2026-08-31T22:41:00+00:00")
        let sameDay = DBTimestamp.parse("2026-09-01T03:00:00+00:00")!
        #expect(row.caption(now: sameDay, calendar: tokyo) == "07:41 コーションプレートで照合")
        let nextDay = DBTimestamp.parse("2026-09-02T03:00:00+00:00")!
        #expect(row.caption(now: nextDay, calendar: tokyo) == "9/1 07:41 コーションプレートで照合")

        let vehicles = try Self.decode(Self.v2).rounds[1].vehicles
        let progress = ChassisCheckProgress(vehicles: vehicles, checks: ChassisChecks([row]))
        #expect(progress.checked == 1 && progress.remaining == 1 && !progress.isComplete)

        let insert = ChassisCheckInsert(sheetID: "s", vehicle: vehicles[0], read: "ignored", method: .stamp)
        #expect(insert.chassis_number == "GB5-1130359" && insert.vehicle_index == nil)
        let json = String(decoding: try JSONEncoder().encode(insert), as: UTF8.self)
        #expect(json.contains(#""method":"stamp""#) && !json.contains("vehicle_index"))
    }

    @Test func sheetRowStatusAndDetailDecoding() throws {
        let json = #"[{"id":"1","blob_url":"u/a.pdf","original_filename":"a.pdf","uploaded_at":"2026-10-01T09:20:00+00:00","dispatch_date":null,"parse_error":"bad","vehicle_count":null},{"id":"2","blob_url":"u/b.pdf","original_filename":"b.pdf","uploaded_at":"2026-10-01T09:20:00+00:00","dispatch_date":null,"vehicle_count":null}]"#
        let rows = try JSONDecoder().decode([DispatchSheetRow].self, from: Data(json.utf8))
        #expect(rows[0].parseStatus == .failed && rows[0].statusLabel == "読み取れませんでした")
        #expect(rows[1].parseStatus == .pending && rows[1].statusLabel == "解析中")

        let detail = try JSONDecoder().decode(DispatchSheetDetailRow.self, from: Data(#"{"id":"1","extracted_data":\#(Self.v2),"parse_error":null}"#.utf8))
        #expect(detail.extracted_data?.vehicles.count == 3)
        let request = String(decoding: try JSONEncoder().encode(ParseDispatchSheetRequest.sheet("x")), as: UTF8.self)
        #expect(request == #"{"sheetId":"x"}"#)
    }

    @Test func blankChassisIsRecordedNotMatched() throws {
        var sheet = try Self.decode(Self.v2)
        sheet.rounds[1].vehicles[0].chassisNumber = ""
        let vehicles = sheet.vehicles
        let blank = vehicles[1]
        #expect(blank.needsRecording && !vehicles[0].needsRecording)

        // The blank vehicle is never "matched" by an empty or any number.
        #expect(ChassisMatch.evaluate(candidates: ["GB5-1130359"], against: vehicles) == .mismatch(read: "GB5-1130359"))

        // Recording: a number that is another vehicle's printed one is flagged.
        #expect(ChassisRecording.evaluate(read: "ha36s-522329", against: vehicles) == .belongsTo(vehicles[2]))
        #expect(ChassisRecording.evaluate(read: "gb5 - 1130359", against: vehicles) == .record("GB5-1130359"))

        let insert = ChassisCheckInsert(sheetID: "s", vehicle: blank, read: "gb5－1130359", method: .cautionPlate)
        #expect(insert.chassis_number == "GB5-1130359" && insert.vehicle_index == 1)

        let recorded = ChassisCheckRow(id: "r", sheet_id: "s", chassis_number: "GB5-1130359", vehicle_index: 1, method: .cautionPlate, checked_at: "2026-08-31T22:41:00+00:00")
        let checks = ChassisChecks([recorded])
        #expect(checks.check(for: blank) == recorded)
        // A recorded number does not count as a 照合 of a printed vehicle with the same number.
        var printed = blank
        printed.id = 5
        printed.chassisNumber = "GB5-1130359"
        #expect(checks.check(for: printed) == nil)
        #expect(recorded.caption(now: DBTimestamp.parse("2026-09-01T03:00:00+00:00")!, calendar: tokyo) == "07:41 コーションプレートで記録")
        #expect(ChassisCheckProgress(vehicles: sheet.rounds[1].vehicles, checks: checks).checked == 1)
    }

    @Test func blankVehiclesNeedReviewUntilConfirmedOrRecorded() throws {
        var sheet = try Self.decode(Self.v2)
        sheet.rounds[1].vehicles[0].chassisNumber = ""
        let vehicles = sheet.vehicles
        let blank = vehicles[1]
        let none = ChassisChecks([])

        #expect(ChassisStatus.of(blank, checks: none, acknowledgments: []) == .blankNeedsReview)
        #expect(ChassisStatus.of(vehicles[0], checks: none, acknowledgments: []) == .unmatched)
        #expect(vehicles.needingReview(checks: none, acknowledgments: []).map(\.id) == [1])

        let ack = BlankAcknowledgmentRow(id: "a", sheet_id: "s", vehicle_index: 1, acknowledged_at: "2026-08-31T22:40:00+00:00")
        #expect(ChassisStatus.of(blank, checks: none, acknowledgments: [ack]) == .blankConfirmed(ack))
        #expect(vehicles.needingReview(checks: none, acknowledgments: [ack]).isEmpty)
        // An acknowledgment for another position does not count.
        let otherAck = BlankAcknowledgmentRow(id: "b", sheet_id: "s", vehicle_index: 2, acknowledged_at: "2026-08-31T22:40:00+00:00")
        #expect(ChassisStatus.of(blank, checks: none, acknowledgments: [otherAck]) == .blankNeedsReview)

        let recorded = ChassisCheckRow(id: "r", sheet_id: "s", chassis_number: "GB5-1130359", vehicle_index: 1, method: .cautionPlate, checked_at: "2026-08-31T22:52:00+00:00")
        #expect(ChassisStatus.of(blank, checks: ChassisChecks([recorded]), acknowledgments: []) == .done(recorded))
        #expect(recorded.headline == "コーションプレートで記録")
        #expect(recorded.detailLine(calendar: tokyo) == "9月1日 07:52 ・ 実車から読み取り")

        let matched = ChassisCheckRow(id: "m", sheet_id: "s", chassis_number: "HA36S-522329", method: .stamp, checked_at: "2026-08-31T22:41:00+00:00")
        #expect(matched.headline == "刻印で照合")
        #expect(matched.detailLine(calendar: tokyo) == "9月1日 07:41 ・ 配車表と一致")

        let insert = BlankAcknowledgmentInsert(sheetID: "s", vehicle: blank)
        #expect(insert == BlankAcknowledgmentInsert(sheetID: "s", vehicle: blank) && insert.vehicle_index == 1)
    }

    @Test func matchingAnotherVehicleThanTheTargetIsAWarning() throws {
        let vehicles = try Self.decode(Self.v2).vehicles
        let freed = vehicles[1], alto = vehicles[2]
        let readAlto = ChassisMatch.evaluate(candidates: ["HA36S-522329"], against: vehicles)
        #expect(readAlto?.wrongVehicle(for: freed) == alto)
        #expect(readAlto?.wrongVehicle(for: alto) == nil)
        // Opened from the top button (no target): any match is fine.
        #expect(readAlto?.wrongVehicle(for: nil) == nil)
        // A plain mismatch is not a "wrong vehicle".
        #expect(ChassisMatch.evaluate(candidates: ["XX1-000000"], against: vehicles)?.wrongVehicle(for: freed) == nil)
    }
}
