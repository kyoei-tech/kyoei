import Foundation
import Testing
@testable import KyoeiCore

@Suite struct ShellModelTests {
    @Test func menuVisibility() {
        let normal = MenuItem.regularItems(partTimeMode: false, testDriveMode: false)
        #expect(normal.first == .lolmap && normal.last == .settings)
        #expect(normal.contains(.lol) && normal.contains(.tripHistory))
        #expect(!MenuItem.regularItems(partTimeMode: true, testDriveMode: false).contains(.lol))
        #expect(!MenuItem.regularItems(partTimeMode: false, testDriveMode: true).contains(.tripHistory))
        #expect(MenuItem(rawValue: "trip-history") == .tripHistory)
    }

    @Test func bandStatus() {
        #expect(ShiftBandStatus.resolve(appMode: .driver, shift: .idle, timecardClockedIn: true) == .hidden)
        #expect(ShiftBandStatus.resolve(appMode: .driver, shift: .departure, timecardClockedIn: false) == .working("運行中"))
        #expect(ShiftBandStatus.resolve(appMode: .driver, shift: .return, timecardClockedIn: false) == .resting("休息中"))
        #expect(ShiftBandStatus.resolve(appMode: .timecard, shift: .departure, timecardClockedIn: false) == .resting("退勤済み"))
        #expect(ShiftBandStatus.resolve(appMode: .timecard, shift: .idle, timecardClockedIn: true) == .working("出勤中"))
    }

    @Test func snapshotDefaultsAndTolerantDecoding() throws {
        #expect(ShiftSnapshot(now: date(2026, 9, 5), calendar: tokyo).countdownHours == 33)
        #expect(ShiftSnapshot(now: date(2026, 9, 4), calendar: tokyo).countdownHours == 9)

        var snapshot = ShiftSnapshot(now: date(2026, 9, 4), calendar: tokyo)
        snapshot.mode = .departure
        snapshot.startedAt = date(2026, 9, 4, 6)
        snapshot.trip = .start(at: date(2026, 9, 4, 6), splitRestRemaining: nil)
        snapshot.splitRest = SplitRestState(cumulative: 4 * hour, splitCount: 1)
        let data = try JSONEncoder().encode(snapshot)
        #expect(try JSONDecoder().decode(ShiftSnapshot.self, from: data) == snapshot)

        let partial = try JSONDecoder().decode(ShiftSnapshot.self, from: Data(#"{"mode":"return","unknown":1}"#.utf8))
        #expect(partial.mode == .return)
        #expect(partial.trip == nil)
    }
}
