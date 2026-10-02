import Foundation

// 出庫/帰庫 state transitions and everything the driver home screen derives
// from them. Port of the logic inside components/home-view.tsx, pulled out of
// the view so it can be tested.

/// A trip that just ended at 帰庫, ready to be written to trip_history.
public struct CompletedTrip: Equatable, Sendable {
    public var departedAt: Date
    public var returnedAt: Date
    public var totals: CategoryTotals
    public var splitRestRemaining: TimeInterval?
}

/// Rounds to whole milliseconds — the precision trip_history stores — so a
/// saved row's returned_at compares equal to the local 帰庫 time.
func wholeMilliseconds(_ date: Date) -> Date {
    Date(timeIntervalSince1970: (date.timeIntervalSince1970 * 1000).rounded() / 1000)
}

extension ShiftSnapshot {
    static let nineHours: TimeInterval = 9 * 3600
    static let eightHours: TimeInterval = 8 * 3600

    /// Time rested so far (0 unless 帰庫済み).
    public func restElapsed(at now: Date) -> TimeInterval {
        guard mode == .return, let startedAt else { return 0 }
        return now.timeIntervalSince(startedAt)
    }

    /// 出庫可能時刻 while resting.
    public var departableAt: Date? {
        guard mode == .return, let startedAt else { return nil }
        return startedAt.addingTimeInterval(TimeInterval(countdownHours) * 3600)
    }

    /// 出庫. Via 分割休息 the rest just taken is registered against the running
    /// split sequence; a normal departure means a full rest was taken, which
    /// clears any in-progress sequence.
    public mutating func depart(at rawNow: Date, viaSplitRest: Bool) {
        let now = wholeMilliseconds(rawNow)
        var remaining: TimeInterval?
        if viaSplitRest {
            let registration = splitRest.registering(rest: restElapsed(at: now))
            splitRest = registration.state
            remaining = registration.satisfied ? nil : registration.remaining
        } else {
            splitRest = .initial
        }
        mode = .departure
        startedAt = now
        trip = .start(at: now, splitRestRemaining: remaining)
        notify = .initial
    }

    /// 帰庫. Returns the finished trip for 運行履歴 (nil if there was none).
    /// A trip that departed via 分割休息 left rest owed, so this rest must
    /// complete that sequence: default to the 3h option and flag it.
    @discardableResult
    public mutating func returnToYard(at rawNow: Date, calendar: Calendar = .current) -> CompletedTrip? {
        let now = wholeMilliseconds(rawNow)
        var completed: CompletedTrip?
        if let trip, let startedAt, mode == .departure {
            completed = CompletedTrip(
                departedAt: startedAt,
                returnedAt: now,
                totals: trip.finalizedTotals(at: now),
                splitRestRemaining: trip.splitRestRemaining
            )
        }
        let wasSplitRestTrip = trip?.splitRestRemaining != nil
        isSplitRestReturn = wasSplitRestTrip
        countdownHours = wasSplitRestTrip ? 3 : (isSaturday(now, calendar: calendar) ? 33 : 9)
        mode = .return
        startedAt = now
        trip = nil
        return completed
    }

    public mutating func tapBreak(_ category: BreakCategory, at now: Date) {
        trip = trip?.tappingBreak(category, at: now)
    }

    public mutating func resumeDriving(at now: Date) {
        trip = trip?.tappingResumeDriving(at: now)
    }

    /// Applies the 30-minute auto-reset and, when enabled, detects newly
    /// crossed notification thresholds.
    public mutating func tick(
        at now: Date,
        rules: [PushNotificationRule],
        notificationsEnabled: Bool
    ) -> [NotifyEvent] {
        guard let current = trip else { return [] }
        let ticked = current.ticked(at: now)
        if ticked != current { trip = ticked }
        guard notificationsEnabled, !rules.isEmpty else { return [] }
        let driving = mode == .departure ? startedAt.map { now.timeIntervalSince($0) } ?? 0 : 0
        let result = DrivingNotifications.tick(
            notify,
            continuous: ticked.liveContinuousDriving(at: now),
            driving: driving,
            breakSatisfied: ticked.breakSatisfied,
            rules: rules
        )
        notify = result.state
        return result.events
    }

    /// When each rule should fire as an OS notification, given the trip now.
    public func upcomingNotifications(rules: [PushNotificationRule], now: Date) -> [ScheduledRuleFire] {
        guard mode == .departure, let trip, let startedAt else { return [] }
        return DrivingNotifications.upcomingFireDates(trip: trip, tripStartedAt: startedAt, notify: notify, rules: rules, now: now)
    }

    /// isSplitRestReturn is set optimistically at 帰庫, then reconciled against
    /// the saved 運行履歴 row once trips load — and cleared if that row is
    /// later deleted, so a stale 分割休息 badge never lingers.
    public mutating func reconcileSplitRestReturn(with trips: [TripHistoryEntry]) {
        guard mode == .return, let startedAt else { return }
        let match = trips.first { abs($0.returnedAt.timeIntervalSince(startedAt)) < 0.001 }
        isSplitRestReturn = match?.splitRestRemaining != nil
    }
}

/// The 誤タップ防止 dialogs shown before 出庫, in the order they can chain.
public enum DepartureConfirmation: Equatable, Sendable {
    case departure
    /// 今月の分割休息が全運行数の1/2に達している
    case splitRestOverLimit
    /// あと少しで通常の9時間休息が完了する
    case splitRestNearFull
    /// この休息では2分割（10時間）を満たせず3分割が必要になる
    case splitRestEscalation
    /// 分割休息のルール説明（確認しました）
    case splitRestMessage

    public var messageID: String {
        switch self {
        case .departure: "home-departure"
        case .splitRestOverLimit: "home-split-rest-over-limit"
        case .splitRestNearFull: "home-split-rest-near-full"
        case .splitRestEscalation: "home-split-rest-escalation"
        case .splitRestMessage: "home-split-rest-message"
        }
    }
}

/// Everything the driver home derives from the snapshot + trip history.
public struct DriverHomeStatus: Sendable {
    public let restElapsed: TimeInterval
    /// Departing now (before a full 9h rest) would be a 分割休息 departure.
    public let isSplitRestEligible: Bool
    public let isRestNearNineHours: Bool
    public let isSplitRestEscalating: Bool
    public let splitRestUsedThisMonth: Int
    public let tripsThisMonth: Int

    public init(snapshot: ShiftSnapshot, trips: [TripHistoryEntry], now: Date, calendar: Calendar = .current) {
        restElapsed = snapshot.restElapsed(at: now)
        isSplitRestEligible = snapshot.mode == .return && restElapsed < ShiftSnapshot.nineHours
        isRestNearNineHours = isSplitRestEligible && restElapsed >= ShiftSnapshot.eightHours
        isSplitRestEscalating = isSplitRestEligible && !isRestNearNineHours && snapshot.splitRest.wouldEscalate(rest: restElapsed)
        let usage = LegalLimits.splitRestUsageThisMonth(trips: trips, now: now, calendar: calendar)
        splitRestUsedThisMonth = usage.used
        tripsThisMonth = usage.total
    }

    /// The month's split-rest use has already reached half of all trips.
    public var splitRestOverHalfLimit: Bool {
        tripsThisMonth > 0 && splitRestUsedThisMonth * 2 >= tripsThisMonth
    }

    /// Remaining time until a full 9h rest completes.
    public var remainingToNineHours: TimeInterval { max(0, ShiftSnapshot.nineHours - restElapsed) }

    /// First dialog when 出庫 is tapped.
    public var firstConfirmation: DepartureConfirmation {
        guard isSplitRestEligible else { return .departure }
        if splitRestOverHalfLimit { return .splitRestOverLimit }
        return afterOverLimit
    }

    /// The next dialog after confirming `step`, or nil when confirming `step`
    /// performs the departure itself.
    public func confirmation(after step: DepartureConfirmation) -> DepartureConfirmation? {
        switch step {
        case .departure, .splitRestMessage: nil
        case .splitRestOverLimit: afterOverLimit
        case .splitRestNearFull, .splitRestEscalation: .splitRestMessage
        }
    }

    private var afterOverLimit: DepartureConfirmation {
        if isRestNearNineHours { return .splitRestNearFull }
        if isSplitRestEscalating { return .splitRestEscalation }
        return .splitRestMessage
    }
}
