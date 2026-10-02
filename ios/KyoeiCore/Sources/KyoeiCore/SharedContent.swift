import Foundation

// Row shapes and lookups for small shared tables used across screens.

// MARK: - confirm_action_messages

/// Editable 誤タップ防止 dialog copy (アラートの管理). Port of
/// lib/notifications/confirm-messages.ts.
public struct ConfirmActionMessageRow: Codable, Equatable, Sendable {
    public static let selectColumns = "id, label, message, confirm_label, cancel_label"

    public var id: String
    public var label: String
    public var message: String
    public var confirm_label: String?
    public var cancel_label: String?
}

public struct ConfirmMessages: Sendable {
    /// The original hardcoded button wording per dialog.
    static let defaultLabels: [String: (confirm: String, cancel: String)] = [
        "accident-report-reset": ("リセットする", "キャンセル"),
        "home-split-rest-message": ("確認しました", "キャンセル"),
        "timecard-break-end": ("終了する", "キャンセル"),
        "timecard-clock-in": ("押しました", "キャンセル"),
        "timecard-clock-out": ("押しました", "キャンセル"),
    ]

    private let byID: [String: ConfirmActionMessageRow]

    public init(rows: [ConfirmActionMessageRow]) {
        byID = Dictionary(rows.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    /// Falls back to the hardcoded copy while loading or if the row is missing,
    /// so a dialog is never blank.
    public func message(_ id: String, fallback: String) -> String {
        byID[id]?.message ?? fallback
    }

    public func confirmLabel(_ id: String, fallback: String? = nil) -> String {
        byID[id]?.confirm_label ?? fallback ?? Self.defaultLabels[id]?.confirm ?? "開始する"
    }

    public func cancelLabel(_ id: String, fallback: String? = nil) -> String {
        byID[id]?.cancel_label ?? fallback ?? Self.defaultLabels[id]?.cancel ?? "キャンセル"
    }
}

// MARK: - weekly_goal

/// 今月の目標 (one row per goal id: 'current' for drivers, 'timecard').
public struct WeeklyGoalRow: Codable, Equatable, Sendable {
    public static let selectColumns = "id, title, content, next_content, next_content_set_at, content_month, updated_at"

    public var id: String
    public var title: String
    public var content: String
    public var next_content: String
    public var next_content_set_at: String?
    public var content_month: String
    public var updated_at: String

    /// The stored goal is from a past month and a next-month draft exists, so
    /// it should be promoted into the current month.
    public func needsRollover(currentMonth: YearMonth) -> Bool {
        content_month != currentMonth.key && !next_content.isEmpty
    }
}

// MARK: - timecard_shared_memos / timecard_todo_items

public struct SharedMemoRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, author_name, content, created_at"

    public var id: String
    public var author_name: String
    public var content: String
    public var created_at: String
}

public struct TodoItemRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, title, body, image_url, created_at"

    public var id: String
    public var title: String
    public var body: String
    public var image_url: String?
    public var created_at: String

    public var image: AttachmentReference? {
        AttachmentReference(column: image_url, bucket: .timecardTodo)
    }
}
