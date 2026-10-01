import Foundation

// Threshold-crossing detection for the 運行状況 timers. Port of
// lib/notifications/driving-notifications.ts, plus `upcomingFireDates`,
// which is new on iOS: rather than relying on the app being awake to tick,
// the app schedules a local notification for the exact moment each rule
// will cross, so it's delivered even while suspended. The in-app tick
// (`tick`) still drives the blocking "了解しました。" modal.

public enum NotificationTimerType: String, Codable, Sendable {
    /// 連続走行時間
    case continuous
    /// 累計休憩時間が30分に達した瞬間
    case `break`
    /// 運行時間（出庫からの経過）
    case driving
}

public struct PushNotificationRule: Identifiable, Equatable, Sendable {
    public var id: String
    public var timerType: NotificationTimerType
    /// Threshold for continuous/driving rules. Unused for break.
    public var threshold: TimeInterval
    public var title: String
    public var message: String

    public init(id: String, timerType: NotificationTimerType, threshold: TimeInterval, title: String, message: String) {
        self.id = id
        self.timerType = timerType
        self.threshold = threshold
        self.title = title
        self.message = message
    }
}

/// Row shape of `push_notification_rules`.
public struct PushNotificationRuleRow: Codable, Sendable {
    public static let selectColumns = "id, timer_type, threshold_ms, title, message"

    public var id: String
    public var timer_type: NotificationTimerType
    public var threshold_ms: Double
    public var title: String
    public var message: String

    public var rule: PushNotificationRule {
        PushNotificationRule(id: id, timerType: timer_type, threshold: threshold_ms / 1000, title: title, message: message)
    }
}

public struct NotifyState: Codable, Equatable, Sendable {
    /// Rule ids that have already fired for the current occurrence.
    public var firedRuleIDs: Set<String>
    /// Previous tick's 連続走行時間, used to detect a reset.
    public var previousContinuous: TimeInterval
    /// Previous tick's breakSatisfied, used to detect the false→true edge.
    public var previousBreakSatisfied: Bool

    public init(firedRuleIDs: Set<String> = [], previousContinuous: TimeInterval = 0, previousBreakSatisfied: Bool = false) {
        self.firedRuleIDs = firedRuleIDs
        self.previousContinuous = previousContinuous
        self.previousBreakSatisfied = previousBreakSatisfied
    }

    public static let initial = NotifyState()
}

public struct NotifyEvent: Equatable, Sendable {
    public var ruleID: String
    public var title: String
    public var message: String
}

public struct ScheduledRuleFire: Equatable, Sendable {
    public var rule: PushNotificationRule
    public var fireDate: Date
}

public enum DrivingNotifications {
    /// A drop of more than this means the 連続走行時間 counter was reset rather
    /// than clock jitter, so previously-fired continuous thresholds re-arm.
    static let resetDropThreshold: TimeInterval = 1

    /// Advances notify state by one tick and returns newly-crossed thresholds.
    /// Continuous rules re-arm when the counter resets, driving rules only on a
    /// new trip (NotifyState.initial), break rules once per false→true edge.
    public static func tick(
        _ state: NotifyState,
        continuous: TimeInterval,
        driving: TimeInterval,
        breakSatisfied: Bool,
        rules: [PushNotificationRule]
    ) -> (state: NotifyState, events: [NotifyEvent]) {
        var events: [NotifyEvent] = []
        var fired = state.firedRuleIDs

        if continuous < state.previousContinuous - resetDropThreshold {
            for rule in rules where rule.timerType == .continuous {
                fired.remove(rule.id)
            }
        }

        for rule in rules {
            switch rule.timerType {
            case .break:
                if !state.previousBreakSatisfied && breakSatisfied {
                    events.append(NotifyEvent(ruleID: rule.id, title: rule.title, message: rule.message))
                }
            case .continuous, .driving:
                let live = rule.timerType == .continuous ? continuous : driving
                if !fired.contains(rule.id) && live >= rule.threshold {
                    fired.insert(rule.id)
                    events.append(NotifyEvent(ruleID: rule.id, title: rule.title, message: rule.message))
                }
            }
        }

        return (
            NotifyState(firedRuleIDs: fired, previousContinuous: continuous, previousBreakSatisfied: breakSatisfied),
            events
        )
    }

    /// Future moments at which each rule will cross, given the trip as it
    /// stands right now. Must be recomputed after every trip transition
    /// (出庫, break tap, 走行再開), since only running timers can be predicted.
    public static func upcomingFireDates(
        trip: TripState,
        tripStartedAt: Date,
        notify: NotifyState,
        rules: [PushNotificationRule],
        now: Date
    ) -> [ScheduledRuleFire] {
        var result: [ScheduledRuleFire] = []
        for rule in rules {
            let fireDate: Date?
            switch rule.timerType {
            case .continuous:
                guard trip.continuousDrivingRunning, !notify.firedRuleIDs.contains(rule.id) else { continue }
                fireDate = now.addingTimeInterval(rule.threshold - trip.liveContinuousDriving(at: now))
            case .driving:
                guard !notify.firedRuleIDs.contains(rule.id) else { continue }
                fireDate = tripStartedAt.addingTimeInterval(rule.threshold)
            case .break:
                guard !trip.breakSatisfied else { continue }
                fireDate = trip.breakSatisfiesAt
            }
            if let fireDate, fireDate > now {
                result.append(ScheduledRuleFire(rule: rule, fireDate: fireDate))
            }
        }
        return result.sorted { $0.fireDate < $1.fireDate }
    }
}
