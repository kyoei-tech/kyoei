import Foundation

// Pure helpers for the 運行状況 (driving status) page's detailed timers.
// Port of lib/trip-log.ts. Times are `Date`, durations are `TimeInterval`
// (seconds); conversion to the DB's `*_ms` integer columns happens only at
// the row boundary (see TripHistory.swift).

public enum BreakCategory: String, Codable, Sendable, CaseIterable {
    case loading, unloading, waiting, resting
}

public enum ActiveCategory: String, Codable, Sendable, CaseIterable {
    case driving, loading, unloading, waiting, resting

    public init(_ category: BreakCategory) {
        switch category {
        case .loading: self = .loading
        case .unloading: self = .unloading
        case .waiting: self = .waiting
        case .resting: self = .resting
        }
    }
}

public struct CategoryTotals: Codable, Equatable, Sendable {
    public var driving: TimeInterval
    public var loading: TimeInterval
    public var unloading: TimeInterval
    public var waiting: TimeInterval
    public var resting: TimeInterval

    public init(
        driving: TimeInterval = 0,
        loading: TimeInterval = 0,
        unloading: TimeInterval = 0,
        waiting: TimeInterval = 0,
        resting: TimeInterval = 0
    ) {
        self.driving = driving
        self.loading = loading
        self.unloading = unloading
        self.waiting = waiting
        self.resting = resting
    }

    public static let zero = CategoryTotals()

    public subscript(category: ActiveCategory) -> TimeInterval {
        get {
            switch category {
            case .driving: driving
            case .loading: loading
            case .unloading: unloading
            case .waiting: waiting
            case .resting: resting
            }
        }
        set {
            switch category {
            case .driving: driving = newValue
            case .loading: loading = newValue
            case .unloading: unloading = newValue
            case .waiting: waiting = newValue
            case .resting: resting = newValue
            }
        }
    }
}

public enum TripLimits {
    public static let tenMinutes: TimeInterval = 10 * 60
    public static let thirtyMinutes: TimeInterval = 30 * 60
    public static let threeHours30: TimeInterval = 3.5 * 3600
    public static let fourHours: TimeInterval = 4 * 3600
    public static let tenHours: TimeInterval = 10 * 3600
    public static let twelveHours: TimeInterval = 12 * 3600
    public static let thirteenHours: TimeInterval = 13 * 3600
    /// Used for the weekly 拘束14時間超え count, distinct from the 運行時間 timer's color thresholds.
    public static let fourteenHours: TimeInterval = 14 * 3600
    public static let fifteenHours: TimeInterval = 15 * 3600
}

public struct TripState: Codable, Equatable, Sendable {
    public var activeCategory: ActiveCategory
    /// When the current activeCategory segment began.
    public var segmentStartedAt: Date
    /// Accumulated time per category, excluding the currently running segment.
    public var totals: CategoryTotals
    /// 連続走行時間 baseline, excluding the currently running driving segment.
    public var continuousDriving: TimeInterval
    public var continuousDrivingRunning: Bool
    /// 累計休憩時間（10分/30分ルール）baseline, excluding the running segment.
    public var breakTimer: TimeInterval
    public var breakTimerRunning: Bool
    /// Set to true the moment 累計休憩時間 auto-resets at 30 minutes.
    public var breakSatisfied: Bool
    /// Static remaining-rest display for this trip, set only when departed via 分割休息.
    public var splitRestRemaining: TimeInterval?
    /// When the current 連続走行時間 streak began (trip start, or 走行再開 after a satisfying break).
    public var continuousStreakStartedAt: Date
    /// When breakSatisfied last flipped to true, or nil while false.
    public var breakSatisfiedAt: Date?

    public static func start(at now: Date, splitRestRemaining: TimeInterval?) -> TripState {
        TripState(
            activeCategory: .driving,
            segmentStartedAt: now,
            totals: .zero,
            continuousDriving: 0,
            continuousDrivingRunning: true,
            breakTimer: 0,
            breakTimerRunning: false,
            breakSatisfied: false,
            splitRestRemaining: splitRestRemaining,
            continuousStreakStartedAt: now,
            breakSatisfiedAt: nil
        )
    }

    private func segmentElapsed(at now: Date) -> TimeInterval {
        max(0, now.timeIntervalSince(segmentStartedAt))
    }

    /// Live value for a given category, including the running segment if active.
    public func liveDuration(of category: ActiveCategory, at now: Date) -> TimeInterval {
        let base = totals[category]
        return activeCategory == category ? base + segmentElapsed(at: now) : base
    }

    /// Final per-category totals at 帰庫, folding in whatever segment was still running.
    public func finalizedTotals(at now: Date) -> CategoryTotals {
        var result = totals
        result[activeCategory] += segmentElapsed(at: now)
        return result
    }

    public func liveContinuousDriving(at now: Date) -> TimeInterval {
        continuousDrivingRunning ? continuousDriving + segmentElapsed(at: now) : continuousDriving
    }

    public func liveBreakTimer(at now: Date) -> TimeInterval {
        breakTimerRunning ? breakTimer + segmentElapsed(at: now) : breakTimer
    }

    /// When the running 累計休憩時間 will reach 30 minutes and auto-reset, or nil if it isn't running.
    public var breakSatisfiesAt: Date? {
        guard breakTimerRunning else { return nil }
        return segmentStartedAt.addingTimeInterval(TripLimits.thirtyMinutes - breakTimer)
    }

    /// Called on every tick; applies the 30-minute auto-reset rule.
    public func ticked(at now: Date) -> TripState {
        guard breakTimerRunning, liveBreakTimer(at: now) >= TripLimits.thirtyMinutes else { return self }
        var next = self
        next.breakTimer = 0
        next.breakTimerRunning = false
        next.breakSatisfied = true
        next.breakSatisfiedAt = now
        return next
    }

    /// 荷積 / 荷卸 / 待機 / 休憩 ボタン: stop driving/continuous timers, start the break category + 累計休憩時間.
    public func tappingBreak(_ category: BreakCategory, at now: Date) -> TripState {
        let elapsed = segmentElapsed(at: now)
        var next = self
        next.totals[activeCategory] += elapsed
        if activeCategory == .driving {
            next.continuousDriving += elapsed
        }
        next.activeCategory = ActiveCategory(category)
        next.segmentStartedAt = now
        next.continuousDrivingRunning = false
        next.breakTimerRunning = true
        return next
    }

    /// 走行再開 ボタン: apply the 10分/30分 rule, then resume driving + 連続走行時間.
    public func tappingResumeDriving(at now: Date) -> TripState {
        let elapsed = segmentElapsed(at: now)
        var next = self
        next.totals[activeCategory] += elapsed

        if breakSatisfied {
            // The break already ran to 30+ minutes and auto-reset — that satisfies
            // the legal break, so the 4-hour continuous-driving clock restarts too.
            next.continuousDriving = 0
            next.continuousStreakStartedAt = now
            next.breakTimer = 0
        } else if elapsed >= TripLimits.tenMinutes {
            // Only a break segment of 10+ minutes counts toward the 累計休憩時間
            // (30-minute) total. A shorter segment doesn't count at all.
            next.breakTimer += elapsed
        }

        next.activeCategory = .driving
        next.segmentStartedAt = now
        next.continuousDrivingRunning = true
        next.breakTimerRunning = false
        next.breakSatisfied = false
        next.breakSatisfiedAt = nil
        return next
    }
}
