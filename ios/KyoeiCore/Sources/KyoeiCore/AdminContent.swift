import Foundation

// Rules behind the secret admin screens reached from 設定 (通知の管理) and the
// Version page. Ports of push-notification-editor-view.tsx,
// confirm-messages.ts, yard-destination-registry-view.tsx and changelog.ts.

// MARK: - プッシュ通知の管理 (push_notification_rules)

public struct PushRuleDraft: Equatable, Sendable {
    /// 累計休息時間 rules always fire at the fixed 30-minute auto-reset.
    public static let breakThreshold: TimeInterval = TripLimits.thirtyMinutes

    public var hours = 0
    public var minutes = 0
    public var title = ""
    public var message = ""

    public init(hours: Int = 0, minutes: Int = 0, title: String = "", message: String = "") {
        self.hours = hours
        self.minutes = minutes
        self.title = title
        self.message = message
    }

    public init(rule: PushNotificationRule) {
        let totalMinutes = Int((rule.threshold / 60).rounded())
        self.init(hours: totalMinutes / 60, minutes: totalMinutes % 60, title: rule.title, message: rule.message)
    }

    public static func new(for type: NotificationTimerType) -> PushRuleDraft {
        type == .break ? PushRuleDraft(minutes: 30) : PushRuleDraft()
    }

    /// The threshold to store, or the error message to show.
    public func validated(for type: NotificationTimerType) -> Result<TimeInterval, ValidationError> {
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .failure(ValidationError("タイトルと本文を入力してください。"))
        }
        if type == .break { return .success(Self.breakThreshold) }
        let threshold = TimeInterval((max(0, hours) * 60 + min(59, max(0, minutes))) * 60)
        guard threshold > 0 else { return .failure(ValidationError("時間を1分以上に設定してください。")) }
        return .success(threshold)
    }

    /// e.g. "4時間", "30分", "3時間30分".
    public static func thresholdLabel(_ threshold: TimeInterval) -> String {
        let totalMinutes = Int((threshold / 60).rounded())
        let (h, m) = (totalMinutes / 60, totalMinutes % 60)
        if h == 0 { return "\(m)分" }
        if m == 0 { return "\(h)時間" }
        return "\(h)時間\(m)分"
    }
}

public struct ValidationError: Error, Equatable, Sendable {
    public let message: String
    public init(_ message: String) { self.message = message }
}

extension NotificationTimerType: CaseIterable {
    public static let allCases: [NotificationTimerType] = [.continuous, .break, .driving]

    public var editorLabel: String {
        switch self {
        case .continuous: "連続走行時間"
        case .break: "累計休息時間"
        case .driving: "運行時間"
        }
    }

    public var editorDescription: String {
        switch self {
        case .continuous: "連続走行時間がこの時間を超えたら送信します。"
        case .break: "累計休息時間が30分に達し自動リセットされた時に送信します（時間は変更できません）。"
        case .driving: "運行時間がこの時間を超えたら送信します。"
        }
    }

    public var hasEditableThreshold: Bool { self != .break }
}

// MARK: - アラートの管理 (confirm_action_messages)

extension ConfirmMessages {
    public struct ButtonVisibility: Equatable, Sendable {
        public var hasButtons: Bool
        public var hasCancel: Bool
    }

    /// Ids whose buttons aren't just editable wording: body text rendered
    /// inside another dialog, or an acknowledgement-only dialog.
    public static func buttonVisibility(_ id: String) -> ButtonVisibility {
        switch id {
        case "home-split-rest-body": ButtonVisibility(hasButtons: false, hasCancel: false)
        case "home-split-rest-message": ButtonVisibility(hasButtons: true, hasCancel: false)
        default: ButtonVisibility(hasButtons: true, hasCancel: true)
        }
    }
}

public struct ConfirmMessageUpdate: Encodable, Equatable, Sendable {
    public var message: String
    public var confirm_label: String?
    public var cancel_label: String?
    public var updated_at: String

    /// Empty labels are stored as null, meaning "use the original wording".
    public init(id: String, message: String, confirmLabel: String, cancelLabel: String, now: Date = Date()) {
        let visibility = ConfirmMessages.buttonVisibility(id)
        func normalized(_ s: String) -> String? {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? nil : t
        }
        self.message = message.trimmingCharacters(in: .whitespacesAndNewlines)
        confirm_label = visibility.hasButtons ? normalized(confirmLabel) : nil
        cancel_label = visibility.hasButtons && visibility.hasCancel ? normalized(cancelLabel) : nil
        updated_at = DBTimestamp.format(now)
    }

    public static func validationError(id: String, message: String, confirmLabel: String) -> String? {
        if message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "本文を入力してください。" }
        if ConfirmMessages.buttonVisibility(id).hasButtons && confirmLabel.trimmingCharacters(in: .whitespaces).isEmpty {
            return "ボタンの文言を入力してください。"
        }
        return nil
    }
}

// MARK: - 検索結果登録 (yard_destination_stores)

public enum StoreNameInput {
    /// Bulk entry: one name per line or separated by 「、」.
    public static func split(_ raw: String) -> [String] {
        raw.split(whereSeparator: { $0 == "\n" || $0 == "、" })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }
}

// MARK: - Version (changelog_entries)

public enum ChangeKind: String, Codable, CaseIterable, Sendable {
    case added = "追加"
    case changed = "変更"
    case removed = "削除"
}

public struct ChangelogRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, version, version_date, page, kind, description, hidden, version_order, entry_order"

    public var id: String
    public var version: String
    public var version_date: String
    public var page: String
    public var kind: ChangeKind
    public var description: String
    public var hidden: Bool
    public var version_order: Int
    public var entry_order: Int
}

public struct ChangelogVersion: Equatable, Identifiable, Sendable {
    public var version: String
    public var date: String
    public var order: Int
    public var entries: [ChangelogRow]

    public var id: Int { order }
    public var visibleEntries: [ChangelogRow] { entries.filter { !$0.hidden } }

    /// e.g. "2026年9月10日"
    public var dateLabel: String {
        guard let day = LocalDate(iso: String(date.prefix(10))) else { return date }
        return "\(day.year)年\(day.month)月\(day.day)日"
    }

    public var nextEntryOrder: Int { (entries.map(\.entry_order).max() ?? -1) + 1 }
}

public enum Changelog {
    /// The web app's last hardcoded version, shown until the table loads.
    public static let fallbackVersion = "1.10.0"

    /// Lower version_order = newer; the first group is 最新.
    public static func grouped(_ rows: [ChangelogRow]) -> [ChangelogVersion] {
        Dictionary(grouping: rows, by: \.version_order)
            .map { order, entries in
                let sorted = entries.sorted { $0.entry_order < $1.entry_order }
                return ChangelogVersion(version: sorted[0].version, date: sorted[0].version_date, order: order, entries: sorted)
            }
            .sorted { $0.order < $1.order }
    }

    /// A brand-new version must sort before every existing one.
    public static func nextVersionOrder(_ versions: [ChangelogVersion]) -> Int {
        min(versions.map(\.order).min() ?? 0, 0) - 1
    }

    public static func currentVersion(_ rows: [ChangelogRow]) -> String {
        grouped(rows).first?.version ?? fallbackVersion
    }
}
