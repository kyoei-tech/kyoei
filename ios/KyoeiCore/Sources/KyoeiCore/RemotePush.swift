import Foundation

// Remote (APNs) push: what a device subscribes to, how it registers, and how
// an incoming push is routed. Server side: supabase/functions/push-dispatch.

/// Events a device can subscribe to (device_push_tokens.topics).
public enum PushTopic: String, Codable, CaseIterable, Sendable {
    /// New おしらせ posts.
    case news
    /// 出勤簿 status changes (出勤中 / 退勤済み) of other staff.
    case staffStatus = "staff_status"

    public var label: String {
        switch self {
        case .news: "おしらせの投稿"
        case .staffStatus: "出勤簿のステータス変更"
        }
    }
}

public enum APNsEnvironment: String, Sendable {
    /// Development-signed builds run from Xcode.
    case sandbox
    /// TestFlight / App Store builds.
    case production
}

/// Parameters of the `register_push_token` RPC.
public struct PushRegistration: Encodable, Equatable, Sendable {
    public var p_device_id: String
    public var p_apns_token: String
    public var p_apns_environment: String
    public var p_staff_member_id: String?
    public var p_topics: [String]

    public init(deviceID: String, token: Data, environment: APNsEnvironment, staffMemberID: String?, topics: Set<PushTopic>) {
        p_device_id = deviceID
        p_apns_token = Self.hex(token)
        p_apns_environment = environment.rawValue
        p_staff_member_id = staffMemberID
        p_topics = topics.map(\.rawValue).sorted()
    }

    /// APNs device tokens are sent to the provider as lowercase hex.
    public static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }
}

/// What an incoming notification is, from its payload's custom keys.
public enum PushKind: Equatable, Sendable {
    case news(id: String)
    case staffStatus(id: String)

    public init?(userInfo: [AnyHashable: Any]) {
        let id = userInfo["id"] as? String ?? ""
        switch userInfo["kind"] as? String {
        case "news": self = .news(id: id)
        case "staff_status": self = .staffStatus(id: id)
        default: return nil
        }
    }

    /// How to present it while the app is in the foreground.
    public var foregroundPresentation: ForegroundPresentation {
        switch self {
        // The in-app NewsNotifier already raises the blocking "了解しました。"
        // modal for every new post (live and catch-up), so the push itself is
        // hidden to avoid announcing the same post twice.
        case .news: .suppressed
        // Status changes are frequent; a banner is enough.
        case .staffStatus: .banner
        }
    }

    /// The tab to open when the user taps the notification.
    public var destinationTab: AppTab {
        switch self {
        case .news: .news
        case .staffStatus: .staff
        }
    }
}

public enum ForegroundPresentation: Equatable, Sendable {
    case banner, suppressed
}
