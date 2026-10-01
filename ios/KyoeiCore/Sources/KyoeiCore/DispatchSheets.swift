import Foundation

// 配車表 (dispatch_sheets). The original PDF lives in the private
// dispatch-sheets bucket under the uploader's own folder; the parsed result
// (extracted_data, see DispatchSheetContent) is written by the
// parse-dispatch-sheet Edge Function right after upload.

public struct DispatchSheetRow: Codable, Equatable, Identifiable, Sendable {
    public static let selectColumns = "id, blob_url, original_filename, uploaded_at, dispatch_date, parse_error, vehicle_count:extracted_data->vehicleCount"

    public var id: String
    /// Storage object path ("<auth uid>/<file>") — the column keeps its web-era name.
    public var blob_url: String
    public var original_filename: String
    public var uploaded_at: String
    public var dispatch_date: String?
    /// Set when the parser could not read the PDF.
    public var parse_error: String?
    /// extracted_data->vehicleCount, when parsed.
    public var vehicle_count: Int?

    public var isParsed: Bool { vehicle_count != nil }

    public enum ParseStatus: Equatable, Sendable {
        case parsed(vehicles: Int), pending, failed
    }

    public var parseStatus: ParseStatus {
        if let vehicle_count { return .parsed(vehicles: vehicle_count) }
        return parse_error == nil ? .pending : .failed
    }

    /// "17台" / "解析中" / "読み取れませんでした"
    public var statusLabel: String {
        switch parseStatus {
        case .parsed(let vehicles): "\(vehicles)台"
        case .pending: "解析中"
        case .failed: "読み取れませんでした"
        }
    }

    public var pdf: AttachmentReference { .stored(bucket: .dispatchSheets, path: blob_url) }

    /// e.g. "09月01日の配車表", or the file name while unparsed.
    public var title: String {
        if let dispatch_date, !dispatch_date.isEmpty { return "\(dispatch_date)の配車表" }
        return original_filename
    }

    /// e.g. "2026/10/01 18:20 アップロード"
    public func uploadedLabel(calendar: Calendar = .current) -> String {
        guard let date = DBTimestamp.parse(uploaded_at) else { return "" }
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return "\(c.year ?? 0)/\(pad2(c.month ?? 0))/\(pad2(c.day ?? 0)) \(pad2(c.hour ?? 0)):\(pad2(c.minute ?? 0)) アップロード"
    }
}

public struct DispatchSheetInsert: Encodable, Equatable, Sendable {
    public var blob_url: String
    public var original_filename: String
    public var uploaded_by_staff_id: String

    public init(path: String, filename: String, staffID: String) {
        blob_url = path
        original_filename = filename
        uploaded_by_staff_id = staffID
    }
}

/// The full parse result for one sheet (the list only loads the counts).
public struct DispatchSheetDetailRow: Decodable, Equatable, Sendable {
    public static let selectColumns = "id, extracted_data, parse_error"

    public var id: String
    public var extracted_data: DispatchSheetContent?
    public var parse_error: String?
}

/// Request body for the parse-dispatch-sheet Edge Function.
public struct ParseDispatchSheetRequest: Encodable, Equatable, Sendable {
    public var sheetId: String?
    public var reparseOutdated: Bool?

    public static func sheet(_ id: String) -> Self { Self(sheetId: id, reparseOutdated: nil) }
    public static let outdated = Self(sheetId: nil, reparseOutdated: true)
}

public enum DispatchSheetUpload {
    /// Only PDFs are accepted (the bucket also enforces this).
    public static func isPDF(filename: String, data: Data) -> Bool {
        (filename as NSString).pathExtension.lowercased() == "pdf" && data.starts(with: Array("%PDF".utf8))
    }
}
