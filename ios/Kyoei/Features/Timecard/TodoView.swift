import KyoeiCore
import PhotosUI
import SwiftUI

/// やること: shared to-do list with optional images. Titles expand to show
/// the styled body. Add/edit/delete are hidden in part-time mode and gated by
/// PIN 2486. Images are uploaded straight to Supabase Storage. Port of
/// components/timecard-todo-view.tsx.
struct TodoView: View {
    let onBack: () -> Void

    @Environment(SettingsStore.self) private var settings
    @State private var table = RealtimeTable<TodoItemRow>(table: "timecard_todo_items", fetch: TodoRepository.fetch)
    @State private var gate = PinGate(code: "2486")
    @State private var openID: String?
    @State private var adding = false
    @State private var editingID: String?
    @State private var confirmDeleteID: String?

    private var canEdit: Bool { !settings.settings.partTimeMode }

    var body: some View {
        TabPage {
            BackHeader(variant: .subtle, onBack: onBack)
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("やること").appFont(20, weight: .bold).foregroundStyle(Color.appForeground)
                    Text("タイトルをタップすると詳しい内容を確認できます。").appFont(14).foregroundStyle(Color.mutedForeground)
                }
                Spacer()
                if canEdit {
                    Button {
                        if adding { adding = false } else { gate.guarded { adding = true } }
                    } label: {
                        Label(adding ? "閉じる" : "追加", systemImage: adding ? "xmark" : "plus")
                    }
                    .buttonStyle(PillButtonStyle(kind: .secondary)).fixedSize()
                }
            }

            if canEdit && adding {
                TodoForm(initial: .init(), submitLabel: "追加する", onCancel: { adding = false }) { form in
                    try await TodoRepository.add(title: form.title, body: form.body, imagePath: form.imagePath)
                    await table.refresh()
                    adding = false
                }
                .padding(20)
                .card(radius: Radius.card)
            }

            if table.rows.isEmpty {
                Text(table.isLoading ? "読み込み中…" : "まだ登録されていません。")
                    .appFont(14)
                    .foregroundStyle(Color.mutedForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
            } else {
                ForEach(table.rows) { item in
                    itemRow(item)
                }
            }
        }
        .syncing(table)
        .pinGate(gate)
    }

    @ViewBuilder private func itemRow(_ item: TodoItemRow) -> some View {
        let isOpen = openID == item.id
        VStack(alignment: .leading, spacing: 12) {
            if editingID == item.id {
                TodoForm(initial: .init(title: item.title, body: item.body, imagePath: item.image_url), submitLabel: "保存", onCancel: { editingID = nil }) { form in
                    try await TodoRepository.update(id: item.id, title: form.title, body: form.body, imagePath: form.imagePath)
                    // The replaced image is no longer referenced by any row.
                    if case .stored(let bucket, let path) = item.image, path != form.imagePath {
                        await AttachmentStore.shared.remove([path], from: bucket)
                    }
                    await table.refresh()
                    editingID = nil
                }
            } else {
                HStack(spacing: 8) {
                    Button { openID = isOpen ? nil : item.id } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "list.clipboard")
                                .foregroundStyle(Color.primary)
                                .frame(width: 36, height: 36)
                                .background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
                            Text(item.title).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.down")
                                .rotationEffect(.degrees(isOpen ? 180 : 0))
                                .foregroundStyle(Color.mutedForeground)
                        }
                    }
                    .buttonStyle(.plain)
                    if canEdit {
                        Button { gate.guarded { editingID = item.id } } label: { Image(systemName: "pencil") }
                            .accessibilityLabel("編集する")
                        Button { gate.guarded { confirmDeleteID = item.id } } label: { Image(systemName: "trash") }
                            .accessibilityLabel("削除する")
                    }
                }
                .font(.system(size: 13))
                .foregroundStyle(Color.mutedForeground.opacity(0.6))
                .buttonStyle(.plain)

                if isOpen {
                    VStack(alignment: .leading, spacing: 12) {
                        if !item.body.isEmpty {
                            StyledTextView(raw: item.body).appFont(14).foregroundStyle(Color.appForeground).lineSpacing(4)
                        }
                        if let image = item.image {
                            AttachmentImage(reference: image)
                                .clipShape(RoundedRectangle(cornerRadius: Radius.card))
                                .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Color.border))
                        }
                    }
                    .padding(.leading, 48)
                }

                if confirmDeleteID == item.id {
                    ConfirmDeleteInline(message: "この項目を削除しますか？", onConfirm: {
                        Task {
                            try? await TodoRepository.delete(item)
                            await table.refresh()
                            confirmDeleteID = nil
                            if openID == item.id { openID = nil }
                        }
                    }, onCancel: { confirmDeleteID = nil })
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .card(border: isOpen || editingID == item.id ? Color.primary.opacity(0.5) : .border)
    }
}

/// Title / styled body / optional image, shared by add and edit.
private struct TodoForm: View {
    struct Values {
        var title = ""
        var body = ""
        var imagePath: String?
    }

    let initial: Values
    let submitLabel: String
    var onCancel: (() -> Void)?
    let onSubmit: (Values) async throws -> Void

    @State private var values = Values()
    @State private var loaded = false
    @State private var photo: PhotosPickerItem?
    @State private var uploading = false
    @State private var errorMessage: String?
    /// Images uploaded in this form but not (yet) saved to a row.
    @State private var uncommittedPaths: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            field("タイトル") {
                TextField("一覧に表示される短い見出し", text: $values.title)
                    .appFont(14)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .card(fill: .appBackground)
            }
            field("内容") {
                MemoEditor(placeholder: "タップして開いたときに表示される本文", text: $values.body, minLines: 4)
                Text(StyledText.markupHelp).appFont(10.4).foregroundStyle(Color.mutedForeground)
            }
            field("画像（任意）") {
                if let path = values.imagePath, let reference = AttachmentReference(column: path, bucket: .timecardTodo) {
                    AttachmentImage(reference: reference)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .topTrailing) {
                            Button {
                                removeImage(path)
                            } label: {
                                Image(systemName: "xmark").padding(6).background(Color.appBackground.opacity(0.9), in: Circle())
                            }
                            .buttonStyle(.plain)
                            .padding(8)
                            .accessibilityLabel("画像を削除")
                        }
                } else {
                    // Captured outside: the label closure isn't main-actor isolated.
                    let isUploading = uploading
                    PhotosPicker(selection: $photo, matching: .images) {
                        ImagePickerLabel(uploading: isUploading)
                    }
                    .disabled(uploading)
                }
                if let errorMessage {
                    Text(errorMessage).appFont(12).foregroundStyle(Color.destructive)
                }
            }
            HStack(spacing: 8) {
                Spacer()
                if let onCancel {
                    Button("キャンセル") {
                        discardUncommitted()
                        onCancel()
                    }
                    .buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                }
                Button(submitLabel, action: submit)
                    .buttonStyle(PillButtonStyle()).fixedSize()
                    .disabled(values.title.trimmingCharacters(in: .whitespaces).isEmpty || uploading)
            }
        }
        .onAppear {
            guard !loaded else { return }
            values = initial
            loaded = true
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            upload(item)
        }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            content()
        }
    }

    private func upload(_ item: PhotosPickerItem) {
        uploading = true
        errorMessage = nil
        Task {
            defer {
                uploading = false
                photo = nil
            }
            do {
                guard let raw = try await item.loadTransferable(type: Data.self),
                      let jpeg = ImageEncoding.jpeg(from: raw)
                else {
                    errorMessage = "画像を読み込めませんでした"
                    return
                }
                let path = try await AttachmentStore.shared.upload(jpeg, filename: "todo.jpg", to: .timecardTodo)
                uncommittedPaths.append(path)
                values.imagePath = path
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func removeImage(_ path: String) {
        // Only delete right away if this form uploaded it; an image already
        // saved on the row is removed after the row is updated.
        if uncommittedPaths.contains(path) {
            uncommittedPaths.removeAll { $0 == path }
            Task { await AttachmentStore.shared.remove([path], from: .timecardTodo) }
        }
        values.imagePath = nil
    }

    private func discardUncommitted() {
        let paths = uncommittedPaths
        uncommittedPaths = []
        Task { await AttachmentStore.shared.remove(paths, from: .timecardTodo) }
    }

    private func submit() {
        var trimmed = values
        trimmed.title = trimmed.title.trimmingCharacters(in: .whitespacesAndNewlines)
        trimmed.body = trimmed.body.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                try await onSubmit(trimmed)
                // Saved; any other images uploaded along the way are orphans.
                let orphans = uncommittedPaths.filter { $0 != trimmed.imagePath }
                uncommittedPaths = []
                await AttachmentStore.shared.remove(orphans, from: .timecardTodo)
            } catch {
                errorMessage = "保存に失敗しました。もう一度お試しください。"
            }
        }
    }
}

/// PhotosPicker's label closure isn't main-actor isolated, so the styled
/// label lives in its own view.
private struct ImagePickerLabel: View {
    let uploading: Bool

    var body: some View {
        Label(uploading ? "アップロード中..." : "画像を選択", systemImage: uploading ? "arrow.up.circle" : "photo.badge.plus")
            .appFont(14, weight: .medium)
            .foregroundStyle(Color.mutedForeground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
    }
}
