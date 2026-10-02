import Foundation

// Device-local 出庫/帰庫 and 出勤/退勤 state, persisted across launches.
// Mirrors HomeView's / TimecardHomeView's PersistedState (localStorage
// `kyoei-shift-state` / `kyoei-timecard-state`) plus `kyoei-split-rest-state`.

public enum ShiftMode: String, Codable, Sendable {
    /// No trip yet on this device.
    case idle
    /// 出庫済み — on a trip.
    case departure
    /// 帰庫済み — resting.
    case `return`
}

public struct ShiftSnapshot: Codable, Equatable, Sendable {
    public var mode: ShiftMode = .idle
    /// 出庫時刻 while departed, 帰庫時刻 while returned.
    public var startedAt: Date?
    /// 休息状況 countdown length in hours (3 / 9 / 33).
    public var countdownHours: Int
    public var hour12 = false
    public var trip: TripState?
    public var notify: NotifyState = .initial
    /// The current rest period must complete a split-rest sequence.
    public var isSplitRestReturn = false
    public var splitRest: SplitRestState = .initial

    /// Saturdays default to the 33h weekly rest; other days to 9h.
    public init(now: Date = Date(), calendar: Calendar = .current) {
        countdownHours = isSaturday(now, calendar: calendar) ? 33 : 9
    }

    private enum CodingKeys: String, CodingKey {
        case mode, startedAt, countdownHours, hour12, trip, notify, isSplitRestReturn, splitRest
    }

    // Tolerant decoding: an app update that adds a field must never wipe a
    // driver's in-progress trip.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init()
        mode = (try? c.decodeIfPresent(ShiftMode.self, forKey: .mode)) ?? mode
        startedAt = try? c.decodeIfPresent(Date.self, forKey: .startedAt)
        countdownHours = (try? c.decodeIfPresent(Int.self, forKey: .countdownHours)) ?? countdownHours
        hour12 = (try? c.decodeIfPresent(Bool.self, forKey: .hour12)) ?? hour12
        trip = try? c.decodeIfPresent(TripState.self, forKey: .trip)
        notify = (try? c.decodeIfPresent(NotifyState.self, forKey: .notify)) ?? notify
        isSplitRestReturn = (try? c.decodeIfPresent(Bool.self, forKey: .isSplitRestReturn)) ?? isSplitRestReturn
        splitRest = (try? c.decodeIfPresent(SplitRestState.self, forKey: .splitRest)) ?? splitRest
    }
}

/// What the persistent status band above the content should show.
public enum ShiftBandStatus: Equatable, Sendable {
    case hidden
    /// 運行中 / 出勤中 (green)
    case working(String)
    /// 休息中 / 退勤済み (orange)
    case resting(String)

    public static func resolve(appMode: AppMode, shift: ShiftMode, timecardClockedIn: Bool) -> ShiftBandStatus {
        switch appMode {
        case .timecard:
            return timecardClockedIn ? .working("出勤中") : .resting("退勤済み")
        case .driver:
            switch shift {
            case .idle: return .hidden
            case .departure: return .working("運行中")
            case .return: return .resting("休息中")
            }
        }
    }
}
