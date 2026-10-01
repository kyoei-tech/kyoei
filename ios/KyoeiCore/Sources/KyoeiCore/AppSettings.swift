import Foundation

// Device-local app settings. Port of lib/settings/settings-context.tsx's
// StoredSettings; persisted by the app's SettingsStore.

public enum AppTab: String, Codable, CaseIterable, Sendable {
    case home, yard, staff, news, menu

    public var label: String {
        switch self {
        case .home: "ホーム"
        case .yard: "ヤード配置"
        case .staff: "出勤簿"
        case .news: "おしらせ"
        case .menu: "メニュー"
        }
    }
}

public enum ThemeMode: String, Codable, CaseIterable, Sendable {
    case dark, light, system
}

/// 'driver' is the full-featured mode for truck drivers. 'timecard' is a
/// stripped-down clock-in/out mode for office staff who don't drive.
public enum AppMode: String, Codable, Sendable {
    case driver, timecard
}

public struct AppSettings: Codable, Equatable, Sendable {
    /// Level 1 is the floor (today's default size); each level steps up by 0.1.
    public static let fontScales: [Double] = [1, 1.1, 1.2, 1.3, 1.4, 1.5]
    public static let defaultFontLevel = 1

    public var theme: ThemeMode = .light
    public var fontLevels: [AppTab: Int] = Dictionary(uniqueKeysWithValues: AppTab.allCases.map { ($0, AppSettings.defaultFontLevel) })
    /// When true, per-tab font levels are ignored and text follows the device's
    /// own text size (Dynamic Type) instead.
    public var deviceFont = false
    public var appMode: AppMode = .driver
    /// Simplified "part-time worker" experience: always timecard mode, hides
    /// most edit affordances. Guarded by a PIN when toggling.
    public var partTimeMode = false
    /// When true, the 運行状況 timer thresholds trigger notifications.
    public var pushNotificationsEnabled = true
    /// Links this device to a `staff_members` row so 出庫/帰庫 also flips that
    /// staff member's 出勤簿 status.
    public var staffMemberID: String?
    /// Unlocks the trial menu section (マイページ etc).
    public var testDriveMode = false
    /// Remote push events this device subscribes to.
    public var pushTopics: Set<PushTopic> = Set(PushTopic.allCases)

    public init() {}

    public func fontScale(for tab: AppTab) -> Double {
        if deviceFont { return 1 }
        let level = fontLevels[tab] ?? Self.defaultFontLevel
        return Self.fontScales.indices.contains(level - 1) ? Self.fontScales[level - 1] : 1
    }

    /// Part-time mode's base experience is the timecard mode; switching back
    /// returns to the full driver mode.
    public mutating func setPartTimeMode(_ enabled: Bool) {
        partTimeMode = enabled
        appMode = enabled ? .timecard : .driver
    }

    private enum CodingKeys: String, CodingKey {
        case theme, fontLevels, deviceFont, appMode, partTimeMode, pushNotificationsEnabled, staffMemberID, testDriveMode, pushTopics
    }

    // Tolerant decoding: every field falls back to its default, so adding a
    // setting in a later version never wipes the user's existing ones.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let base = AppSettings()
        theme = (try? c.decodeIfPresent(ThemeMode.self, forKey: .theme)) ?? base.theme
        let storedLevels = (try? c.decodeIfPresent([String: Int].self, forKey: .fontLevels)) ?? [:]
        fontLevels = base.fontLevels.merging(
            storedLevels.compactMap { key, value in AppTab(rawValue: key).map { ($0, value) } },
            uniquingKeysWith: { _, stored in stored }
        )
        deviceFont = (try? c.decodeIfPresent(Bool.self, forKey: .deviceFont)) ?? base.deviceFont
        appMode = (try? c.decodeIfPresent(AppMode.self, forKey: .appMode)) ?? base.appMode
        partTimeMode = (try? c.decodeIfPresent(Bool.self, forKey: .partTimeMode)) ?? base.partTimeMode
        pushNotificationsEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .pushNotificationsEnabled)) ?? base.pushNotificationsEnabled
        staffMemberID = (try? c.decodeIfPresent(String.self, forKey: .staffMemberID)) ?? base.staffMemberID
        testDriveMode = (try? c.decodeIfPresent(Bool.self, forKey: .testDriveMode)) ?? base.testDriveMode
        // Unknown topic names (from a newer build) are dropped, not fatal.
        let storedTopics = (try? c.decodeIfPresent([String].self, forKey: .pushTopics)).flatMap { $0 }
        pushTopics = storedTopics.map { Set($0.compactMap(PushTopic.init(rawValue:))) } ?? base.pushTopics
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(theme, forKey: .theme)
        try c.encode(Dictionary(uniqueKeysWithValues: fontLevels.map { ($0.key.rawValue, $0.value) }), forKey: .fontLevels)
        try c.encode(deviceFont, forKey: .deviceFont)
        try c.encode(appMode, forKey: .appMode)
        try c.encode(partTimeMode, forKey: .partTimeMode)
        try c.encode(pushNotificationsEnabled, forKey: .pushNotificationsEnabled)
        try c.encodeIfPresent(staffMemberID, forKey: .staffMemberID)
        try c.encode(testDriveMode, forKey: .testDriveMode)
        try c.encode(pushTopics.map(\.rawValue).sorted(), forKey: .pushTopics)
    }
}
