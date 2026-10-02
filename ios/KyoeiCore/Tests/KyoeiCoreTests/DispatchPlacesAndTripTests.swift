import Foundation
import Testing
@testable import KyoeiCore

@Suite struct ForeignChassisTests {
    let benz = DispatchVehicle(id: 0, round: "1", vehicleName: "Cクラス", chassisNumber: "WDD2050422R123456", pickup: "A", dropoff: "B")
    let shortened = DispatchVehicle(id: 1, round: "1", vehicleName: "ゴルフ", chassisNumber: "ZHW654321", pickup: "A", dropoff: "B")
    let fit = DispatchVehicle(id: 2, round: "1", vehicleName: "フィット", chassisNumber: "GK3-1234567", pickup: "A", dropoff: "B")

    @Test func emphasisIsAfterTheHyphenOrTheLastLetter() {
        #expect(ChassisNumber.emphasis("GP3-1022135") == ("GP3-", "1022135"))
        #expect(ChassisNumber.emphasis("VZNY12-103585") == ("VZNY12-", "103585"))
        #expect(ChassisNumber.emphasis("WDD2050422R123456") == ("WDD2050422R", "123456"))
        #expect(ChassisNumber.emphasis("123456") == ("", "123456"))
    }

    @Test func hyphensAreNotPartOfTheJudgment() {
        #expect(ChassisNumber.matches(read: "GK3-1234567", sheet: "GK31234567"))
        #expect(ChassisNumber.matches(read: "GK31234567", sheet: "GK3-1234567"))
        #expect(ChassisNumber.matches(read: "WDD-2050422-R123456", sheet: "WDD2050422R123456"))
        let hyphenless = DispatchVehicle(id: 3, round: "1", vehicleName: "フィット", chassisNumber: "GK31234567", pickup: "A", dropoff: "B")
        #expect(ChassisMatch.evaluate(candidates: ["GK3-1234567"], against: [hyphenless]) == .matched(vehicle: hyphenless, chassis: "GK3-1234567"))
    }

    @Test func thePartAfterTheLastLetterMustMatchInFull() {
        // The sheet has the full VIN; the plate read is the same.
        #expect(ChassisMatch.evaluate(candidates: ["WDD2050422R123456"], against: [fit, benz]) == .matched(vehicle: benz, chassis: "WDD2050422R123456"))
        // The sheet shortened it: the real car's full VIN still matches.
        #expect(ChassisMatch.evaluate(candidates: ["WVWZZZAUZHW654321"], against: [fit, shortened]) == .matched(vehicle: shortened, chassis: "WVWZZZAUZHW654321"))
        #expect(ChassisNumber.matches(read: "R123456", sheet: "WDD2050422R123456"))
        // Every digit counts: one off, one missing or one extra is a mismatch.
        #expect(ChassisMatch.evaluate(candidates: ["WDD2050422R123457"], against: [fit, benz]) == .mismatch(read: "WDD2050422R123457"))
        #expect(!ChassisNumber.matches(read: "R23456", sheet: "WDD2050422R123456"))
        #expect(!ChassisNumber.matches(read: "R1234567", sheet: "WDD2050422R123456"))
        // The digits right after the letter belong to the tail too.
        #expect(!ChassisNumber.matches(read: "1234567", sheet: "GK3-1234567"))
        #expect(!ChassisNumber.matches(read: "GK5-1234567", sheet: "GK3-1234567"))
    }

    @Test func theShorterNumberMustBeTheEndOfTheLongerOne() {
        // Shortened from the front: still the same car.
        #expect(ChassisNumber.matches(read: "WDD2050422R123456", sheet: "0422R123456"))
        #expect(ChassisNumber.matches(read: "0422R123456", sheet: "WDD2050422R123456"))
        // Same digits after the last letter, but other letters differ: another car.
        #expect(!ChassisNumber.matches(read: "ABW30-1234567", sheet: "ZVW30-1234567"))
        #expect(!ChassisNumber.matches(read: "XR123456", sheet: "WDD2050422R123456"))
        #expect(!ChassisNumber.matches(read: "WVWZZZAUZHW654321", sheet: "AUW654321"))
        // A misread letter is a mismatch too (retake, or speak it).
        #expect(!ChassisNumber.matches(read: "WDD2O50422R123456", sheet: "WDD2050422R123456"))
    }

    @Test func stampingsWithoutAHyphenAreRead() {
        #expect(ChassisNumber.candidates(in: ["車台番号 GP31022135"]) == ["GP31022135"])
        #expect(ChassisNumber.candidates(in: ["R123456"]) == ["R123456"])
        // A hyphenated number is still read whole, not split.
        #expect(ChassisNumber.candidates(in: ["GP3-1022135"]) == ["GP3-1022135"])
    }

    @Test func voiceCheckKeepsThePhotoOfAnUnreadableShot() {
        let voice = ChassisCheckInsert(sheetID: "s", vehicle: fit, read: "GK3-1234567", method: .stamp, input: .voice, photoPath: "u/p.jpg")
        #expect(voice.photo_path == "u/p.jpg" && voice.vehicle_index == nil)
        let camera = ChassisCheckInsert(sheetID: "s", vehicle: fit, read: "GK3-1234567", method: .stamp, input: .camera, photoPath: "u/p.jpg")
        #expect(camera.photo_path == nil)
    }
}

@Suite struct PlaceAliasTests {
    func vehicle(_ id: Int, _ pickup: String, _ dropoff: String) -> DispatchVehicle {
        DispatchVehicle(id: id, round: "1", vehicleName: "x", chassisNumber: "A-\(id)", pickup: pickup, dropoff: dropoff)
    }

    @Test func similarNames() {
        #expect(PlaceNames.similar("東西海運 あおなみヤード", "東西海運 あおなみヤード(愛知)"))
        #expect(PlaceNames.similar("東西海運 あおなみヤード", "東西海運あおなみヤード（愛知）"))
        #expect(PlaceNames.similar("ECL木更津", "ECL木更津 オーシャンヤード"))
        #expect(!PlaceNames.similar("JU神奈川", "木更津JFA"))
        #expect(!PlaceNames.similar("USS", "USS東京"))  // too short to count as a prefix
        #expect(!PlaceNames.similar("同じ", "同じ"))
    }

    @Test func asksEachPairOnceAndGroupsAnsweredSamePlaces() {
        let a = "東西海運 あおなみヤード", b = "東西海運 あおなみヤード(愛知)"
        let content = DispatchSheetContent(rounds: [DispatchRound(round: "1", vehicles: [
            vehicle(0, "共栄 本郷ヤード", a), vehicle(1, "共栄 本郷ヤード", b), vehicle(2, "共栄 本郷ヤード", "木更津JFA"),
        ])])
        #expect(PlaceNames.unansweredPairs(in: content, answers: []) == [PlacePair(a, b)])
        let yes = PlaceAliasRow(id: "1", name_a: PlacePair(a, b).first, name_b: PlacePair(a, b).second, same: true)
        #expect(PlaceNames.unansweredPairs(in: content, answers: [yes]).isEmpty)

        let aliases = PlaceAliases([yes], order: PlaceNames.places(in: content))
        let routes = content.rounds[0].routes(aliases: aliases)
        #expect(routes.map(\.dropoff) == [a, "木更津JFA"])
        #expect(routes[0].vehicles.map(\.id) == [0, 1])

        // 「違う場所」 keeps them apart.
        let no = PlaceAliasRow(id: "1", name_a: yes.name_a, name_b: yes.name_b, same: false)
        #expect(content.rounds[0].routes(aliases: PlaceAliases([no], order: [])).count == 3)
    }
}

@Suite struct TripDispatchSheetTests {
    let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        return c
    }()

    func at(_ day: Int, _ hour: Int) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour))!
    }

    func row(_ id: String, _ date: String?, uploaded: String = "2026-10-01T09:00:00+09:00", parsed: Bool = true) -> DispatchSheetRow {
        DispatchSheetRow(id: id, blob_url: "u/\(id).pdf", original_filename: "\(id).pdf", uploaded_at: uploaded, dispatch_date: date, parse_error: nil, vehicle_count: parsed ? 3 : nil)
    }

    @Test func readsTheDispatchDate() {
        #expect(row("a", "09月01日").dispatchMonthDay! == (9, 1))
        #expect(row("a", "10/2").dispatchMonthDay! == (10, 2))
        #expect(row("a", nil).dispatchMonthDay == nil)
    }

    @Test func daytimeDepartureUsesThatDaysSheet() {
        let rows = [row("today", "10月02日"), row("tomorrow", "10月03日")]
        #expect(TripDispatchSheet.sheet(departedAt: at(2, 6), in: rows, calendar: calendar)?.id == "today")
        #expect(TripDispatchSheet.sheet(departedAt: at(2, 6), in: [row("tomorrow", "10月03日")], calendar: calendar) == nil)
    }

    @Test func eveningDeparturePrefersTheNextDay() {
        let rows = [row("today", "10月02日"), row("tomorrow", "10月03日")]
        #expect(TripDispatchSheet.sheet(departedAt: at(2, 22), in: rows, calendar: calendar)?.id == "tomorrow")
        #expect(TripDispatchSheet.sheet(departedAt: at(2, 22), in: [row("today", "10月02日")], calendar: calendar)?.id == "today")
    }

    @Test func newestUploadWinsAndUnparsedIsIgnored() {
        let rows = [
            row("old", "10月02日", uploaded: "2026-10-01T09:00:00+09:00"),
            row("new", "10月02日", uploaded: "2026-10-01T20:00:00+09:00"),
            row("pending", "10月02日", uploaded: "2026-10-01T21:00:00+09:00", parsed: false),
        ]
        #expect(TripDispatchSheet.sheet(departedAt: at(2, 6), in: rows, calendar: calendar)?.id == "new")
    }
}
