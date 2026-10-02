import Foundation

// Pure helpers for タイムカードモード — a stripped-down clock-in/out flow for
// office staff who don't drive. Port of lib/timecard-log.ts. Deliberately
// has no notion of 連続走行時間 or the legal rest countdown.

public struct TimecardState: Codable, Equatable, Sendable {
    public var clockedIn: Bool
    /// When the current shift started. Nil while clocked out.
    public var shiftStartedAt: Date?
    public var onBreak: Bool
    /// When the current break began. Nil while not on break.
    public var breakStartedAt: Date?
    /// Accumulated break time today, excluding any currently running break.
    public var breakTotal: TimeInterval

    public init(
        clockedIn: Bool = false,
        shiftStartedAt: Date? = nil,
        onBreak: Bool = false,
        breakStartedAt: Date? = nil,
        breakTotal: TimeInterval = 0
    ) {
        self.clockedIn = clockedIn
        self.shiftStartedAt = shiftStartedAt
        self.onBreak = onBreak
        self.breakStartedAt = breakStartedAt
        self.breakTotal = breakTotal
    }

    public static let initial = TimecardState()

    public static func clockedIn(at now: Date) -> TimecardState {
        TimecardState(clockedIn: true, shiftStartedAt: now)
    }

    /// 退勤: ends the shift. If still on break, folds the running break into the total first.
    public func clockingOut(at now: Date) -> TimecardState {
        TimecardState(breakTotal: liveBreakTotal(at: now))
    }

    public func startingBreak(at now: Date) -> TimecardState {
        guard clockedIn, !onBreak else { return self }
        var next = self
        next.onBreak = true
        next.breakStartedAt = now
        return next
    }

    public func endingBreak(at now: Date) -> TimecardState {
        guard onBreak, breakStartedAt != nil else { return self }
        var next = self
        next.breakTotal = liveBreakTotal(at: now)
        next.onBreak = false
        next.breakStartedAt = nil
        return next
    }

    /// Live break total, including the currently running break if any.
    public func liveBreakTotal(at now: Date) -> TimeInterval {
        if onBreak, let breakStartedAt {
            return breakTotal + max(0, now.timeIntervalSince(breakStartedAt))
        }
        return breakTotal
    }

    /// Live elapsed shift time since clock-in, including any break time.
    public func liveShiftElapsed(at now: Date) -> TimeInterval {
        guard clockedIn, let shiftStartedAt else { return 0 }
        return max(0, now.timeIntervalSince(shiftStartedAt))
    }
}
