import Foundation

// 赤枠管理 (回送運行許可番号標): which plate is out with whom. Rows come from
// red_plate_board() / red_plate_history(); taking out and returning go
// through take_red_plate() / return_red_plate().

public struct RedPlateBoardRow: Codable, Equatable, Identifiable, Sendable {
    public var plate_id: String
    public var region: String
    public var number: String
    public var note: String
    public var sort_order: Int
    public var use_id: String?
    public var user_id: String?
    public var holder_name: String?
    public var taken_at: String?
    public var destination: String?

    public var id: String { plate_id }
    /// "相模 4218"
    public var label: String { "\(region) \(number)" }
    public var isOut: Bool { use_id != nil }
    public var takenAt: Date? { taken_at.flatMap(DBTimestamp.parse) }

    public func isHeld(by userID: String?) -> Bool {
        guard let userID, let user_id else { return false }
        return user_id.lowercased() == userID.lowercased()
    }
}

public struct RedPlateUse: Codable, Equatable, Identifiable, Sendable {
    public var use_id: String
    public var user_id: String
    public var user_name: String
    public var taken_at: String
    public var destination: String
    public var returned_at: String?
    public var returned_by_name: String?
    public var return_method: String?

    public var id: String { use_id }
    public var takenAt: Date? { DBTimestamp.parse(taken_at) }
    public var returnedAt: Date? { returned_at.flatMap(DBTimestamp.parse) }

    public var returnMethodLabel: String? {
        switch return_method {
        case "app": "アプリで返却"
        case "nfc": "事務所のNFCで返却"
        case "admin": "管理画面で返却処理"
        default: nil
        }
    }
}

public enum RedPlateBoard {
    /// The signed-in user's plates first, then the rest in board order.
    public static func mine(_ rows: [RedPlateBoardRow], userID: String?) -> [RedPlateBoardRow] {
        rows.filter { $0.isHeld(by: userID) }
    }

    public static func counts(_ rows: [RedPlateBoardRow]) -> (out: Int, available: Int) {
        let out = rows.filter(\.isOut).count
        return (out, rows.count - out)
    }

    /// "2時間05分" since the plate was taken out.
    public static func elapsed(since start: Date, now: Date) -> String {
        let minutes = max(0, Int(now.timeIntervalSince(start) / 60))
        if minutes >= 24 * 60 { return "\(minutes / (24 * 60))日\(minutes % (24 * 60) / 60)時間" }
        return "\(minutes / 60)時間\(String(format: "%02d", minutes % 60))分"
    }
}
