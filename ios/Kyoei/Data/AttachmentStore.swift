import Foundation
import KyoeiCore
import Supabase

/// Reads and writes attachment files directly in Supabase Storage — the
/// replacement for the web app's /api/{dispatch-sheet,beginner-notes,
/// timecard-todo}/upload|file routes in front of Vercel Blob.
actor AttachmentStore {
    static let shared = AttachmentStore()

    enum UploadError: LocalizedError {
        case tooLarge(limit: Int)

        var errorDescription: String? {
            switch self {
            case .tooLarge(let limit):
                "ファイルサイズが大きすぎます（上限 \(limit / 1024 / 1024)MB）"
            }
        }
    }

    private let cache = NSCache<NSString, NSData>()

    init() {
        cache.totalCostLimit = 64 * 1024 * 1024
    }

    /// Uploads `data` and returns the object path to store in the row.
    /// For dispatch sheets, `folder` must be the signed-in user's id — the
    /// bucket's policies only allow writes under one's own folder.
    func upload(
        _ data: Data,
        filename: String,
        to bucket: AttachmentBucket,
        folder: String? = nil
    ) async throws -> String {
        guard data.count <= bucket.maxBytes else { throw UploadError.tooLarge(limit: bucket.maxBytes) }
        let path = StoragePath.make(filename: filename, folder: folder)
        let contentType = StoragePath.contentType(forExtension: (filename as NSString).pathExtension)
        try await Backend.client.storage
            .from(bucket.rawValue)
            .upload(path, data: data, options: FileOptions(contentType: contentType, upsert: false))
        cache.setObject(data as NSData, forKey: Self.key(bucket, path), cost: data.count)
        return path
    }

    func data(for reference: AttachmentReference) async throws -> Data {
        switch reference {
        case .remote(let url):
            return try await URLSession.shared.data(from: url).0
        case .stored(let bucket, let path):
            let key = Self.key(bucket, path)
            if let cached = cache.object(forKey: key) {
                return cached as Data
            }
            let data = try await Backend.client.storage.from(bucket.rawValue).download(path: path)
            cache.setObject(data as NSData, forKey: key, cost: data.count)
            return data
        }
    }

    /// Best-effort delete, called after the owning row is deleted/updated.
    func remove(_ paths: [String], from bucket: AttachmentBucket) async {
        guard !paths.isEmpty else { return }
        for path in paths {
            cache.removeObject(forKey: Self.key(bucket, path))
        }
        _ = try? await Backend.client.storage.from(bucket.rawValue).remove(paths: paths)
    }

    private static func key(_ bucket: AttachmentBucket, _ path: String) -> NSString {
        "\(bucket.rawValue)/\(path)" as NSString
    }
}
