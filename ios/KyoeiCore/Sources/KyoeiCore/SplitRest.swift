import Foundation

// Split-rest (分割休息) cumulative tracking. Port of lib/split-rest.ts, minus
// persistence: callers (ShiftStore in the app) load/save the state.
//
// 改善基準告示 rules enforced here:
// - Each individual split segment must be at least 3 hours.
// - A sequence of 2 splits needs a cumulative total of at least 10 hours.
// - A sequence of 3 splits needs a cumulative total of at least 12 hours.
// A segment only "completes" the sequence if it is itself >= 3 hours.

public struct SplitRestState: Codable, Equatable, Sendable {
    /// Total rest accumulated across the current split-rest sequence.
    public var cumulative: TimeInterval
    /// How many times 分割休息による出庫 has been used in the current sequence.
    public var splitCount: Int

    public init(cumulative: TimeInterval = 0, splitCount: Int = 0) {
        self.cumulative = cumulative
        self.splitCount = splitCount
    }

    public static let initial = SplitRestState()
}

public struct SplitRestRegistration: Equatable, Sendable {
    public var state: SplitRestState
    public var remaining: TimeInterval
    public var satisfied: Bool
    public var target: TimeInterval
}

private let threeHours: TimeInterval = 3 * 3600

/// Minimum cumulative total once `splitCountSoFar` segments have been taken:
/// aiming for 2-split (10h) for the first two segments, then 3-split (12h).
private func target(forSplitCount splitCountSoFar: Int) -> TimeInterval {
    splitCountSoFar <= 1 ? TripLimits.tenHours : TripLimits.twelveHours
}

extension SplitRestState {
    /// Registers a rest period taken via 分割休息による出庫. The displayed
    /// 要休息時間 is always floored at 3 hours, since no legal segment can be
    /// shorter than that.
    public func registering(rest: TimeInterval) -> SplitRestRegistration {
        let clamped = max(0, rest)
        let total = cumulative + clamped
        let isValidSegment = clamped >= threeHours
        let currentTarget = target(forSplitCount: splitCount)

        if isValidSegment && total >= currentTarget {
            return SplitRestRegistration(state: .initial, remaining: 0, satisfied: true, target: currentTarget)
        }

        let next = SplitRestState(cumulative: total, splitCount: splitCount + 1)
        let nextTarget = target(forSplitCount: next.splitCount)
        return SplitRestRegistration(
            state: next,
            remaining: max(nextTarget - total, threeHours),
            satisfied: false,
            target: nextTarget
        )
    }

    /// Predicts, without registering anything, whether departing now would push
    /// the sequence from "could still finish as a 2-split (10h)" to "now needs a
    /// 3rd split (12h total)". Used to warn before an inefficient departure.
    public func wouldEscalate(rest: TimeInterval) -> Bool {
        // The very first split can't yet be "escalating" anything.
        guard splitCount > 0 else { return false }
        let currentTarget = target(forSplitCount: splitCount)
        // Once already escalated to 12h there's no further tier to warn about.
        guard currentTarget == TripLimits.tenHours else { return false }
        let clamped = max(0, rest)
        let wouldSatisfy = clamped >= threeHours && cumulative + clamped >= currentTarget
        return !wouldSatisfy
    }
}
