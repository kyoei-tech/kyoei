import KyoeiCore
import PDFKit
import Supabase
import SwiftUI
import UniformTypeIdentifiers

enum DispatchSheetRepository {
    static func fetchOwn(staffID: String) async throws -> [DispatchSheetRow] {
        try await Backend.client.from("dispatch_sheets").select(DispatchSheetRow.selectColumns)
            .eq("uploaded_by_staff_id", value: staffID)
            .order("uploaded_at", ascending: false)
            .execute().value
    }

    /// Stores the original under the user's own folder, then records it.
    /// Parsing (extracted_data) is added once the parser approach is decided.
    static func upload(_ data: Data, filename: String, staffID: String, userID: String) async throws {
        let path = try await AttachmentStore.shared.upload(data, filename: filename, to: .dispatchSheets, folder: userID)
        do {
            try await Backend.client.from("dispatch_sheets")
                .insert(DispatchSheetInsert(path: path, filename: filename, staffID: staffID))
                .execute()
        } catch {
            await AttachmentStore.shared.remove([path], from: .dispatchSheets)
            throw error
        }
    }

    /// Deletes the row first, then the original (best-effort).
    static func delete(_ sheet: DispatchSheetRow) async throws {
        try await Backend.client.from("dispatch_sheets").delete().eq("id", value: sheet.id).execute()
        await AttachmentStore.shared.remove([sheet.blob_url], from: .dispatchSheets)
        PDFCache.remove(sheet.blob_url)
    }
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

/// 配車表: the signed-in driver's own sheets. Upload a PDF, browse the list,
/// open the original, delete. Parsed vehicle cards come later (parser
/// approach pending). Port of components/dispatch-sheet-view.tsx (minus parsing).
struct DispatchSheetView: View {
    let staffID: String
    let staffName: String
    let userID: String

    @State private var table: RealtimeTable<DispatchSheetRow>
    @State private var importing = false
    @State private var uploading = false
    @State private var error: String?
    @State private var editing = false
    @State private var confirmDeleteID: String?
    @State private var openedID: String?

    init(staffID: String, staffName: String, userID: String) {
        self.staffID = staffID
        self.staffName = staffName
        self.userID = userID
        _table = State(initialValue: RealtimeTable(table: "dispatch_sheets") { try await DispatchSheetRepository.fetchOwn(staffID: staffID) })
    }

    var body: some View {
        Group {
            if let sheet = table.rows.first(where: { $0.id == openedID }) {
                DispatchSheetDetail(sheet: sheet, onBack: { openedID = nil })
            } else {
                list
            }
        }
        .syncing(table)
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf]) { result in
            if case .success(let url) = result { upload(url) }
        }
    }

    private var list: some View {
        TabPage {
            PageHeading(title: "配車表", subtitle: "\(staffName)さんの配車表です。PDFをアップロードすると、原本をいつでも確認できます。") {
                if !table.rows.isEmpty {
                    EditToggleButton(editing: editing) {
                        editing.toggle()
                        confirmDeleteID = nil
                    }
                }
            }
            Button { importing = true } label: {
                Label(uploading ? "アップロード中…" : "配車表PDFをアップロード", systemImage: uploading ? "arrow.up.circle" : "doc.badge.plus")
                    .appFont(16, weight: .bold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundStyle(Color.primaryForeground)
                    .background(Color.primary, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(PressScaleStyle())
            .disabled(uploading)
            if let error {
                Text(error).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
            }
            if table.rows.isEmpty {
                EmptyStateBox(text: table.isLoading ? "読み込み中…" : "まだ配車表をアップロードしていません。")
            }
            ForEach(table.rows) { sheet in
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 12) {
                        Button { openedID = sheet.id } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "doc.text").foregroundStyle(Color.primary)
                                    .frame(width: 40, height: 40).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(sheet.title).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                                    Text(sheet.isParsed ? "\(sheet.vehicle_count ?? 0)台 ・ \(sheet.uploadedLabel())" : "解析待ち ・ \(sheet.uploadedLabel())")
                                        .appFont(12).foregroundStyle(Color.mutedForeground)
                                }
                                Spacer(minLength: 0)
                            }
                        }
                        .buttonStyle(.plain)
                        if editing {
                            Button { confirmDeleteID = sheet.id } label: { Image(systemName: "trash") }
                                .buttonStyle(.plain).foregroundStyle(Color.destructive)
                                .accessibilityLabel("\(sheet.title)を削除")
                        } else {
                            Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                        }
                    }
                    if confirmDeleteID == sheet.id {
                        ConfirmDeleteInline(message: "「\(sheet.title)」を削除しますか？", onConfirm: {
                            Task {
                                do {
                                    try await DispatchSheetRepository.delete(sheet)
                                } catch {
                                    self.error = "削除に失敗しました。もう一度お試しください。"
                                }
                                confirmDeleteID = nil
                                await table.refresh()
                            }
                        }, onCancel: { confirmDeleteID = nil })
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .card()
            }
        }
    }

    private func upload(_ url: URL) {
        uploading = true
        error = nil
        Task {
            defer { uploading = false }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url), DispatchSheetUpload.isPDF(filename: url.lastPathComponent, data: data) else {
                error = "PDFファイルを選択してください。"
                return
            }
            do {
                try await DispatchSheetRepository.upload(data, filename: url.lastPathComponent, staffID: staffID, userID: userID)
                await table.refresh()
            } catch let failure as AttachmentStore.UploadError {
                error = failure.errorDescription
            } catch {
                self.error = "アップロードに失敗しました。もう一度お試しください。"
            }
        }
    }
}

/// One sheet: its original PDF (parsed cards will appear above it later).
private struct DispatchSheetDetail: View {
    let sheet: DispatchSheetRow
    let onBack: () -> Void

    @State private var document: PDFDocument?
    @State private var failed = false
    @State private var sharing = false

    var body: some View {
        VStack(spacing: 8) {
            BackHeader(label: "一覧へ戻る", variant: .subtle, onBack: onBack) {
                Spacer()
                if document != nil {
                    Button { sharing = true } label: { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("PDFを共有")
                }
            }
            .padding(.horizontal, 16)
            VStack(alignment: .leading, spacing: 2) {
                Text(sheet.title).appFont(18, weight: .bold).foregroundStyle(Color.appForeground)
                Text(sheet.isParsed ? "解析結果の表示は準備中です。原本を表示しています。" : "解析待ちです。原本を表示しています。")
                    .appFont(12).foregroundStyle(Color.mutedForeground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            Group {
                if let document {
                    PDFDocumentView(document: document)
                } else if failed {
                    EmptyStateBox(text: "原本を読み込めませんでした。通信状況を確認してください。").padding(16)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task(id: sheet.id) {
            do {
                document = PDFDocument(data: try await PDFCache.load(sheet.blob_url))
                failed = document == nil
            } catch {
                failed = true
            }
        }
        .sheet(isPresented: $sharing) {
            ShareSheet(items: [PDFCache.url(for: sheet.blob_url)])
        }
    }
}

/// PDFKit viewer (pinch to zoom; landscape sheets fit the width).
private struct PDFDocumentView {
    let document: PDFDocument

    @MainActor private func configure(_ view: PDFView) {
        view.document = document
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
    }
}

#if canImport(UIKit)
extension PDFDocumentView: UIViewRepresentable {
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        configure(view)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document !== document { configure(view) }
    }
}
#else
extension PDFDocumentView: NSViewRepresentable {
    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        configure(view)
        return view
    }

    func updateNSView(_ view: PDFView, context: Context) {
        if view.document !== document { configure(view) }
    }
}
#endif
