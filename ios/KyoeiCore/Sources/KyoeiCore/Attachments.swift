import Foundation

// Attachments live in private Supabase Storage buckets, read and written
// directly by the app — the replacement for the web app's private Vercel
// Blob store, which could only be reached through Next.js /api routes.
// Bucket setup and access policies: supabase/migrations/*_storage_buckets.sql.

public enum AttachmentBucket: String, CaseIterable, Sendable {
    /// 配車表 PDFs. Private to each signed-in driver: objects live under
    /// `<auth user id>/...` and storage policies only expose one's own folder.
    case dispatchSheets = "dispatch-sheets"
    /// 初心者ノート images (beginner_notes.image_paths).
    case beginnerNotes = "beginner-notes"
    /// タイムカード TODO images (timecard_todo_items.image_url).
    case timecardTodo = "timecard-todo"
    /// 点検簿の否の写真. Private like dispatch sheets: `<auth user id>/...`.
    case inspectionPhotos = "inspection-photos"
    /// 荷姿の写真. Private: `<auth user id>/...`.
    case packingPhotos = "packing-photos"
    /// 修理申請の写真（ドライバー: `<auth user id>/...`、伝票: `slips/...`）.
    case repairPhotos = "repair-photos"

    public var maxBytes: Int {
        switch self {
        case .dispatchSheets: 20 * 1024 * 1024
        case .beginnerNotes, .timecardTodo, .inspectionPhotos, .packingPhotos, .repairPhotos: 10 * 1024 * 1024
        }
    }
}

public enum StoragePath {
    private static let suffixAlphabet = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

    /// Object path for a new upload: a sanitized copy of the original file
    /// name plus a random suffix (like Blob's `addRandomSuffix`), so two
    /// uploads of "IMG_0001.jpg" never overwrite each other. `folder` is used
    /// for per-user buckets.
    public static func make(
        filename: String,
        folder: String? = nil,
        randomSuffix: String = randomSuffix()
    ) -> String {
        let name = (filename as NSString).lastPathComponent
        let ext = (name as NSString).pathExtension.lowercased()
        var stem = sanitize((name as NSString).deletingPathExtension)
        if stem.isEmpty { stem = "file" }
        let file = ext.isEmpty ? "\(stem)-\(randomSuffix)" : "\(stem)-\(randomSuffix).\(sanitize(ext))"
        guard let folder, !folder.isEmpty else { return file }
        return "\(folder)/\(file)"
    }

    public static func randomSuffix(length: Int = 21) -> String {
        String((0..<length).map { _ in suffixAlphabet.randomElement()! })
    }

    /// Storage keys must be URL-safe; Japanese file names (e.g. 配車表.pdf)
    /// are reduced to safe characters while staying readable where possible.
    static func sanitize(_ raw: String) -> String {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        let mapped = raw.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" }
        var result = String(mapped)
        while result.contains("__") { result = result.replacingOccurrences(of: "__", with: "_") }
        return result.trimmingCharacters(in: CharacterSet(charactersIn: "_"))
    }

    public static func contentType(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": "application/pdf"
        case "jpg", "jpeg": "image/jpeg"
        case "png": "image/png"
        case "heic": "image/heic"
        case "gif": "image/gif"
        case "webp": "image/webp"
        default: "application/octet-stream"
        }
    }
}

/// What an attachment column value points at. Most values are object paths
/// in a bucket; timecard_todo_items.image_url may still hold a hand-typed
/// http(s) URL from before uploads existed.
public enum AttachmentReference: Equatable, Sendable {
    case stored(bucket: AttachmentBucket, path: String)
    case remote(URL)

    public init?(column value: String?, bucket: AttachmentBucket) {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else { return nil }
        if value.hasPrefix("http://") || value.hasPrefix("https://") {
            guard let url = URL(string: value) else { return nil }
            self = .remote(url)
        } else {
            self = .stored(bucket: bucket, path: value)
        }
    }
}
