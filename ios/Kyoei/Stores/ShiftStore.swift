import Foundation
import KyoeiCore
import Observation

/// Owns this device's 出庫/帰庫 (driver mode) and 出勤/退勤 (timecard mode)
/// state and their side effects. On the web, HomeView / TimecardHomeView each
/// kept this in component state + localStorage while StatusBand polled
/// localStorage; here one store is the single source of truth.
///
/// Side effects of a transition (all best-effort, never blocking the switch):
///  - 帰庫 writes the finished trip to trip_history
///  - 出庫/帰庫 flip the linked staff_members row (設定 > 乗務員ID)
///  - local notifications are rescheduled for the new timer state
@MainActor
@Observable
final class ShiftStore {
    enum DriverScreen: String, Codable { case home, driving, rest }
    enum TimecardScreen: String, Codable { case home, status }

    private static let shiftKey = "kyoei-shift-state"
    private static let timecardKey = "kyoei-timecard-state"
    private static let screensKey = "kyoei-screens"

    private(set) var shift: ShiftSnapshot {
        didSet { Self.save(shift, key: Self.shiftKey, to: defaults) }
    }

    private(set) var timecard: TimecardState {
        didSet { Self.save(timecard, key: Self.timecardKey, to: defaults) }
    }

    var driverScreen: DriverScreen = .home {
        didSet { saveScreens() }
    }

    var timecardScreen: TimecardScreen = .home {
        didSet { saveScreens() }
    }

    /// Kept current by AppShell from the push_notification_rules table and 設定.
    var notificationRules: [PushNotificationRule] = [] {
        didSet { if notificationRules != oldValue { rescheduleNotifications() } }
    }

    var notificationsEnabled = true {
        didSet { if notificationsEnabled != oldValue { rescheduleNotifications() } }
    }

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var scheduleTask: Task<Void, Never>?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        shift = Self.load(ShiftSnapshot.self, key: Self.shiftKey, from: defaults) ?? ShiftSnapshot()
        timecard = Self.load(TimecardState.self, key: Self.timecardKey, from: defaults) ?? .initial
        if let screens = Self.load(Screens.self, key: Self.screensKey, from: defaults) {
            driverScreen = screens.driver
            timecardScreen = screens.timecard
        }
    }

    func bandStatus(for appMode: AppMode) -> ShiftBandStatus {
        .resolve(appMode: appMode, shift: shift.mode, timecardClockedIn: timecard.clockedIn)
    }

    // MARK: Driver mode

    func depart(viaSplitRest: Bool, staffMemberID: String?) {
        shift.depart(at: Date(), viaSplitRest: viaSplitRest)
        // Jump straight into 運行状況 so the running timers are visible at once.
        driverScreen = .driving
        rescheduleNotifications()
        Task { await StaffStatusSync.update(staffMemberID: staffMemberID, working: true) }
    }

    func returnToYard(staffMemberID: String?) {
        let completed = shift.returnToYard(at: Date())
        // Mirror 出庫 -> 運行状況 with 帰庫 -> 休息状況.
        driverScreen = .rest
        rescheduleNotifications()
        Task {
            if let completed { await TripHistoryRepository.save(completed) }
            await StaffStatusSync.update(staffMemberID: staffMemberID, working: false)
        }
    }

    func tapBreak(_ category: BreakCategory) {
        shift.tapBreak(category, at: Date())
        rescheduleNotifications()
    }

    func resumeDriving() {
        shift.resumeDriving(at: Date())
        rescheduleNotifications()
    }

    func setCountdownHours(_ hours: Int) {
        shift.countdownHours = hours
    }

    func toggleHour12() {
        shift.hour12.toggle()
    }

    func reconcileSplitRestReturn(with trips: [TripHistoryEntry]) {
        var next = shift
        next.reconcileSplitRestReturn(with: trips)
        if next != shift { shift = next }
    }

    /// Advances timers; returns notification events for the in-app modal.
    /// Only writes (and persists) the snapshot when something changed.
    func tick(at now: Date = Date()) -> [NotifyEvent] {
        var next = shift
        let events = next.tick(at: now, rules: notificationRules, notificationsEnabled: notificationsEnabled)
        if next != shift {
            let breakFlipped = next.trip?.breakSatisfied != shift.trip?.breakSatisfied
            shift = next
            if breakFlipped { rescheduleNotifications() }
        }
        return events
    }

    // MARK: Timecard mode

    func clockIn() {
        timecard = .clockedIn(at: Date())
        timecardScreen = .home
    }

    func clockOut() {
        timecard = timecard.clockingOut(at: Date())
        timecardScreen = .home
    }

    func startBreak() {
        timecard = timecard.startingBreak(at: Date())
    }

    func endBreak() {
        timecard = timecard.endingBreak(at: Date())
    }

    // MARK: Notifications

    private func rescheduleNotifications() {
        let fires = notificationsEnabled ? shift.upcomingNotifications(rules: notificationRules, now: Date()) : []
        scheduleTask?.cancel()
        scheduleTask = Task {
            guard !Task.isCancelled else { return }
            await NotificationScheduler.scheduleDriving(fires)
        }
    }

    // MARK: Persistence

    private struct Screens: Codable {
        var driver: DriverScreen
        var timecard: TimecardScreen
    }

    private func saveScreens() {
        Self.save(Screens(driver: driverScreen, timecard: timecardScreen), key: Self.screensKey, to: defaults)
    }

    private static func load<T: Decodable>(_ type: T.Type, key: String, from defaults: UserDefaults) -> T? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }

    private static func save<T: Encodable>(_ value: T, key: String, to defaults: UserDefaults) {
        if let data = try? JSONEncoder().encode(value) {
            defaults.set(data, forKey: key)
        }
    }
}
