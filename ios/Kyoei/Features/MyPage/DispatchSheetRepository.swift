import Foundation
import KyoeiCore
import Supabase

/// 配車表 data access: the driver's own sheets (originals in Storage, parse
/// results written by the parse-dispatch-sheet Edge Function) and their
/// personal 車台番号 checks.
enum DispatchSheetRepository {
    static func fetchOwn(staffID: String) async throws -> [DispatchSheetRow] {
        try await Backend.client.from("dispatch_sheets").select(DispatchSheetRow.selectColumns)
            .eq("uploaded_by_staff_id", value: staffID)
            .order("uploaded_at", ascending: false)
            .execute().value
    }

    /// Every sheet the signed-in driver can see — only their own (RLS).
    static func fetchMine() async throws -> [DispatchSheetRow] {
        try await Backend.client.from("dispatch_sheets").select(DispatchSheetRow.selectColumns)
            .order("uploaded_at", ascending: false)
            .execute().value
    }

    static func fetchDetail(id: String) async throws -> DispatchSheetDetailRow {
        try await Backend.client.from("dispatch_sheets").select(DispatchSheetDetailRow.selectColumns)
            .eq("id", value: id)
            .single()
            .execute().value
    }

    /// Stores the original under the user's own folder, records it, then asks
    /// the Edge Function to read it. A parse failure (or no signal) leaves the
    /// sheet as 解析中 / 読み取れませんでした — the original is already safe,
    /// and `reparseOutdated` or the 再解析 button picks it up later.
    static func upload(_ data: Data, filename: String, staffID: String, userID: String) async throws {
        let path = try await AttachmentStore.shared.upload(data, filename: filename, to: .dispatchSheets, folder: userID)
        let inserted: DispatchSheetIDRow
        do {
            inserted = try await Backend.client.from("dispatch_sheets")
                .insert(DispatchSheetInsert(path: path, filename: filename, staffID: staffID))
                .select("id")
                .single()
                .execute().value
        } catch {
            await AttachmentStore.shared.remove([path], from: .dispatchSheets)
            throw error
        }
        try? await parse(sheetID: inserted.id)
    }

    static func parse(sheetID: String) async throws {
        try await Backend.client.functions.invoke(
            "parse-dispatch-sheet",
            options: FunctionInvokeOptions(body: ParseDispatchSheetRequest.sheet(sheetID))
        )
    }

    /// Re-reads the caller's sheets that an older parser (or nobody) read.
    /// Cheap when there are none; failures are ignored (best-effort).
    static func reparseOutdated() async {
        try? await Backend.client.functions.invoke(
            "parse-dispatch-sheet",
            options: FunctionInvokeOptions(body: ParseDispatchSheetRequest.outdated)
        )
    }

    /// Deletes the row first (its chassis checks cascade), then the original (best-effort).
    static func delete(_ sheet: DispatchSheetRow) async throws {
        try await Backend.client.from("dispatch_sheets").delete().eq("id", value: sheet.id).execute()
        await AttachmentStore.shared.remove([sheet.blob_url], from: .dispatchSheets)
        PDFCache.remove(sheet.blob_url)
    }

    // MARK: 車台番号の照合 (personal; RLS limits every query to the signed-in user)

    static func fetchChecks(sheetID: String) async throws -> [ChassisCheckRow] {
        try await Backend.client.from("dispatch_chassis_checks").select(ChassisCheckRow.selectColumns)
            .eq("sheet_id", value: sheetID)
            .execute().value
    }

    /// Recording the same vehicle twice (e.g. from two devices) keeps the first.
    static func recordCheck(_ check: ChassisCheckInsert) async throws {
        try await Backend.client.from("dispatch_chassis_checks")
            .upsert(check, onConflict: "user_id,sheet_id,chassis_number", returning: .minimal, ignoreDuplicates: true)
            .execute()
    }

    static func removeCheck(id: String) async throws {
        try await Backend.client.from("dispatch_chassis_checks").delete().eq("id", value: id).execute()
    }

    // MARK: 車体番号が空欄の確認 (personal; required before 記録)

    static func fetchBlankAcknowledgments(sheetID: String) async throws -> [BlankAcknowledgmentRow] {
        try await Backend.client.from("dispatch_blank_acknowledgments").select(BlankAcknowledgmentRow.selectColumns)
            .eq("sheet_id", value: sheetID)
            .execute().value
    }

    static func acknowledgeBlank(_ ack: BlankAcknowledgmentInsert) async throws {
        try await Backend.client.from("dispatch_blank_acknowledgments")
            .upsert(ack, onConflict: "user_id,sheet_id,vehicle_index", returning: .minimal, ignoreDuplicates: true)
            .execute()
    }

    static func removeBlankAcknowledgment(id: String) async throws {
        try await Backend.client.from("dispatch_blank_acknowledgments").delete().eq("id", value: id).execute()
    }
}

extension DispatchSheetRepository {
    // MARK: 似た名前の場所 (personal; applies to every sheet)

    static func fetchPlaceAliases() async throws -> [PlaceAliasRow] {
        try await Backend.client.from("dispatch_place_aliases").select(PlaceAliasRow.selectColumns).execute().value
    }

    /// Answering the same pair again (e.g. on another device) replaces the answer.
    static func answerPlaceAlias(_ answer: PlaceAliasInsert) async throws {
        try await Backend.client.from("dispatch_place_aliases")
            .upsert(answer, onConflict: "user_id,name_a,name_b", returning: .minimal)
            .execute()
    }
}

private struct DispatchSheetIDRow: Decodable {
    var id: String
}

/// Opened originals are kept in Caches so they reopen without signal; the
/// authoritative copy stays in Storage, so a reinstall just re-downloads.
enum PDFCache {
    private static var folder: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("DispatchSheets", isDirectory: true)
    }

    static func url(for path: String) -> URL {
        folder.appendingPathComponent(path.replacingOccurrences(of: "/", with: "_"))
    }

    static func load(_ path: String) async throws -> Data {
        let local = url(for: path)
        if let data = try? Data(contentsOf: local) { return data }
        let data = try await AttachmentStore.shared.data(for: .stored(bucket: .dispatchSheets, path: path))
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        try? data.write(to: local, options: .atomic)
        return data
    }

    static func remove(_ path: String) {
        try? FileManager.default.removeItem(at: url(for: path))
    }
}
