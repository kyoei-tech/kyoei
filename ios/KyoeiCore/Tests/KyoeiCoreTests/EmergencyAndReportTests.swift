import Foundation
import Testing
@testable import KyoeiCore

@Suite struct EmergencyAndReportTests {
    func contact(hours: String) -> EmergencyContactRow {
        EmergencyContactRow(id: "1", name: "本社", hours: hours, phone: "03", summary: nil, sort_order: 0)
    }

    @Test func contactHoursParsing() {
        #expect(EmergencyContactDraft(contact(hours: "24時間対応")).is24h)
        let ranged = EmergencyContactDraft(contact(hours: "9:00〜17:30"))
        #expect(!ranged.is24h && ranged.startTime == "09:00" && ranged.endTime == "17:30")
        #expect(ranged.hoursText == "09:00〜17:30")
        // Off-grid or free text falls back to the default range.
        let odd = EmergencyContactDraft(contact(hours: "9:15〜17:00"))
        #expect(odd.startTime == "09:00" && odd.endTime == "18:00")
        let free = EmergencyContactDraft(contact(hours: "平日のみ"))
        #expect(free.startTime == "09:00" && !free.is24h)
        var draft = EmergencyContactDraft()
        draft.is24h = true
        #expect(draft.hoursText == "24時間対応" && !draft.canSave)
        #expect(EmergencyContactDraft.timeOptions.count == 48 && EmergencyContactDraft.timeOptions.last == "23:30")
    }

    @Test func reportPartiesAndExports() throws {
        var report = AccidentReport()
        #expect(report.parties.count == 1 && report.parties[0].isEmpty)
        report.removeParty(id: report.parties[0].id)
        #expect(report.parties.count == 1) // never removes the last one
        report.parties[0].name = "山田"
        report.parties[0].licensePhotoBack = "b.jpg"
        report.addParty()
        report.addParty()
        report.parties[2].ownership = .company
        #expect(report.exportNames().map(\.fileName) == ["相手1_情報.jpg", "相手1_免許証裏.jpg", "相手3_情報.jpg"])
        #expect(report.photoFiles == ["b.jpg"])
        #expect(report.parties[2].cardRows.last?.value == "社用車")
        #expect(report.parties[0].cardRows[1].value == "（未入力）")

        report.completedAt = Date(timeIntervalSince1970: 1_000)
        let decoded = try JSONDecoder().decode(AccidentReport.self, from: JSONEncoder().encode(report))
        #expect(decoded == report && decoded.isCompleted)
        #expect(CarOwnership(rawValue: "private") == .personal)
    }
}
