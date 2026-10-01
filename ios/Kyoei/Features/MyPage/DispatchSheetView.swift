import KyoeiCore
import SwiftUI
import UniformTypeIdentifiers

/// 配車表: the signed-in driver's own sheets. Upload a PDF (read by the
/// parse-dispatch-sheet Edge Function), browse the list, open the parsed
/// views / original (DispatchSheetBoard.swift), delete. Port of
/// components/dispatch-sheet-view.tsx.
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
        // Sheets read by an older parser (or uploaded on the web) are re-read
        // in the background; their rows update through Realtime.
        .task { await DispatchSheetRepository.reparseOutdated() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf]) { result in
            if case .success(let url) = result { upload(url) }
        }
    }

    private var list: some View {
        TabPage {
            PageHeading(title: "配車表", subtitle: "\(staffName)さんの配車表です。PDFをアップロードすると、回戦ごとのまとめと1台ごとの詳細を表示します。どの端末でもログインすれば見られます。") {
                if !table.rows.isEmpty {
                    EditToggleButton(editing: editing) {
                        editing.toggle()
                        confirmDeleteID = nil
                    }
                }
            }
            Button { importing = true } label: {
                Label(uploading ? "アップロードして読み取り中…" : "配車表PDFをアップロード", systemImage: uploading ? "arrow.up.circle" : "doc.badge.plus")
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
                                    Text("\(sheet.statusLabel) ・ \(sheet.uploadedLabel())")
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
