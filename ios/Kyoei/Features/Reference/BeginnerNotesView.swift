import KyoeiCore
import PhotosUI
import Supabase
import SwiftUI

enum BeginnerNoteRepository {
    private struct Payload: Encodable {
        var title: String
        var body: String
        var category: String
        var image_paths: [String]
    }

    static func fetch() async throws -> [BeginnerNoteRow] {
        try await Backend.client.from("beginner_notes").select(BeginnerNoteRow.selectColumns)
            .order("created_at", ascending: false).execute().value
    }

    /// Saves the note, then deletes any images an edit dropped.
    static func save(id: String?, title: String, body: String, category: String, images: [String], previous: [String]) async throws {
        let trimmedCategory = category.trimmingCharacters(in: .whitespaces)
        let payload = Payload(title: title.trimmingCharacters(in: .whitespaces),
                              body: body.trimmingCharacters(in: .whitespacesAndNewlines),
                              category: trimmedCategory.isEmpty ? uncategorizedLabel : trimmedCategory,
                              image_paths: images)
        if let id {
            try await Backend.client.from("beginner_notes").update(payload).eq("id", value: id).execute()
            await AttachmentStore.shared.remove(BeginnerNotes.removedImages(previous: previous, next: images), from: .beginnerNotes)
        } else {
            try await Backend.client.from("beginner_notes").insert(payload).execute()
        }
    }

    static func delete(_ note: BeginnerNoteRow) async throws {
        try await Backend.client.from("beginner_notes").delete().eq("id", value: note.id).execute()
        await AttachmentStore.shared.remove(note.image_paths, from: .beginnerNotes)
    }
}

/// 初心者ノート: shared notes for newcomers with up to 6 photos (Supabase
/// Storage), listed newest-first or by category. Editing is hidden for
/// part-time staff. Port of components/beginner-notes-view.tsx.
struct BeginnerNotesView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var table = RealtimeTable<BeginnerNoteRow>(table: "beginner_notes", fetch: BeginnerNoteRepository.fetch)
    @State private var selectedID: String?
    @State private var byCategory = false
    @State private var activeCategory: String?
    @State private var editing: EditTarget?
    @State private var confirmingDelete = false

    private enum EditTarget: Equatable {
        case new
        case existing(String)
    }

    private var canEdit: Bool { !settings.settings.partTimeMode }

    var body: some View {
        Group {
            if let note = table.rows.first(where: { $0.id == selectedID }) {
                detail(note)
            } else {
                list
            }
        }
        .syncing(table)
    }

    private var list: some View {
        let groups = BeginnerNotes.byCategory(table.rows)
        return TabPage {
            PageHeading(title: "初心者ノート", subtitle: "新人向けのメモや手順をまとめて共有できます。") {
                if canEdit {
                    Button { editing = editing == .new ? nil : .new } label: {
                        Label(editing == .new ? "閉じる" : "ノートを追加", systemImage: editing == .new ? "xmark" : "plus")
                    }
                    .buttonStyle(PillButtonStyle(kind: .secondary)).fixedSize()
                }
            }
            if canEdit && editing == .new {
                NoteForm(note: nil, categories: groups.map(\.category)) { editing = nil } onSaved: { await table.refresh() }
            }
            if !table.rows.isEmpty {
                Picker("表示", selection: $byCategory) {
                    Label("一覧", systemImage: "list.bullet").tag(false)
                    Label("カテゴリ", systemImage: "tag").tag(true)
                }
                .pickerStyle(.segmented)
            }
            if table.rows.isEmpty {
                EmptyStateBox(text: table.isLoading ? "読み込み中…" : "まだノートがありません。")
            } else if !byCategory {
                ForEach(table.rows) { noteRow($0) }
            } else if let activeCategory {
                Button("← カテゴリ一覧へ戻る") { self.activeCategory = nil }.appFont(14, weight: .semibold)
                ForEach(groups.first { $0.category == activeCategory }?.notes ?? []) { noteRow($0) }
            } else {
                ForEach(groups, id: \.category) { group in
                    Button { activeCategory = group.category } label: {
                        HStack {
                            Text(group.category).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                            Text("\(group.notes.count)件").appFont(12).foregroundStyle(Color.mutedForeground)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                        }
                        .padding(.horizontal, 20).padding(.vertical, 14).card()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func noteRow(_ note: BeginnerNoteRow) -> some View {
        Button { selectedID = note.id } label: {
            HStack(spacing: 12) {
                if let first = note.images.first {
                    AttachmentImage(reference: first, contentMode: .fill)
                        .frame(width: 48, height: 48)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(note.title).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                    Text(note.categoryLabel).appFont(12).foregroundStyle(Color.mutedForeground)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
            }
            .padding(.horizontal, 16).padding(.vertical, 12).card()
        }
        .buttonStyle(.plain)
    }

    private func detail(_ note: BeginnerNoteRow) -> some View {
        TabPage {
            BackHeader(label: "一覧へ戻る", variant: .subtle) {
                selectedID = nil
                confirmingDelete = false
                editing = nil
            }
            VStack(alignment: .leading, spacing: 12) {
                Text(note.categoryLabel).appFont(12, weight: .semibold).foregroundStyle(Color.secondary)
                    .padding(.horizontal, 10).padding(.vertical, 2).background(Color.secondary.opacity(0.1), in: Capsule())
                Text(note.title).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                if !note.body.isEmpty {
                    Text(note.body).appFont(14).foregroundStyle(Color.appForeground).lineSpacing(4).textSelection(.enabled)
                }
                if !note.images.isEmpty {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(Array(note.images.enumerated()), id: \.offset) { _, image in
                            AttachmentImage(reference: image)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .accessibilityLabel("\(note.title)の添付画像")
                        }
                    }
                }
                if canEdit {
                    HStack(spacing: 16) {
                        Spacer()
                        Button { editing = .existing(note.id) } label: { Label("編集", systemImage: "pencil") }
                        Button("削除") { confirmingDelete = true }.foregroundStyle(Color.destructive)
                    }
                    .appFont(12, weight: .semibold)
                    .buttonStyle(.plain)
                    if confirmingDelete {
                        ConfirmDeleteInline(onConfirm: {
                            Task {
                                try? await BeginnerNoteRepository.delete(note)
                                confirmingDelete = false
                                selectedID = nil
                                await table.refresh()
                            }
                        }, onCancel: { confirmingDelete = false })
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .card()
            if canEdit && editing == .existing(note.id) {
                NoteForm(note: note, categories: BeginnerNotes.byCategory(table.rows).map(\.category)) { editing = nil } onSaved: { await table.refresh() }
            }
        }
    }
}

private struct NoteForm: View {
    let note: BeginnerNoteRow?
    let categories: [String]
    let onClose: () -> Void
    let onSaved: () async -> Void

    @State private var title = ""
    @State private var noteBody = ""
    @State private var category = ""
    @State private var images: [String] = []
    @State private var uploaded: [String] = []
    @State private var picks: [PhotosPickerItem] = []
    @State private var uploading = false
    @State private var saving = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            FormField(label: "タイトル") { BoxedTextField(placeholder: "", text: $title) }
            FormField(label: "カテゴリー") {
                HStack(spacing: 8) {
                    BoxedTextField(placeholder: uncategorizedLabel, text: $category)
                    if !categories.isEmpty {
                        Menu {
                            ForEach(categories, id: \.self) { name in Button(name) { category = name } }
                        } label: { Image(systemName: "list.bullet") }
                            .accessibilityLabel("既存のカテゴリーから選ぶ")
                    }
                }
            }
            FormField(label: "内容") { MemoEditor(placeholder: "", text: $noteBody, minLines: 5) }
            FormField(label: "画像（最大\(BeginnerNoteRow.maxImages)枚）") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                    ForEach(images, id: \.self) { path in
                        AttachmentImage(reference: .stored(bucket: .beginnerNotes, path: path), contentMode: .fill)
                            .frame(height: 88).clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(alignment: .topTrailing) {
                                Button { remove(path) } label: {
                                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).padding(5)
                                        .background(Color.appBackground.opacity(0.9), in: Circle())
                                }
                                .buttonStyle(.plain).padding(4).accessibilityLabel("画像を削除")
                            }
                    }
                }
                let slots = BeginnerNotes.remainingImageSlots(current: images.count)
                if slots > 0 {
                    // Captured outside: the label closure isn't main-actor isolated.
                    let isUploading = uploading
                    PhotosPicker(selection: $picks, maxSelectionCount: slots, matching: .images) {
                        NotePickerLabel(uploading: isUploading)
                    }
                    .disabled(uploading)
                }
            }
            if let error {
                Text(error).appFont(12).foregroundStyle(Color.destructive)
            }
            FormActions(canSave: !saving && !uploading && !title.trimmingCharacters(in: .whitespaces).isEmpty,
                        saveLabel: note == nil ? "保存" : "更新", onCancel: cancel, onSave: save)
        }
        .padding(20)
        .card(radius: Radius.card)
        .onAppear {
            guard let note else { return }
            title = note.title
            noteBody = note.body
            category = note.category
            images = note.image_paths
        }
        .onChange(of: picks) { _, items in
            guard !items.isEmpty else { return }
            upload(items)
        }
    }

    private func upload(_ items: [PhotosPickerItem]) {
        uploading = true
        error = nil
        Task {
            defer {
                uploading = false
                picks = []
            }
            for item in items {
                do {
                    guard let raw = try await item.loadTransferable(type: Data.self), let jpeg = ImageEncoding.jpeg(from: raw) else { continue }
                    let path = try await AttachmentStore.shared.upload(jpeg, filename: "note.jpg", to: .beginnerNotes)
                    images.append(path)
                    uploaded.append(path)
                } catch {
                    self.error = "画像のアップロードに失敗しました。もう一度お試しください。"
                }
            }
        }
    }

    /// Images uploaded in this session are deleted right away; images already
    /// saved on the note are only deleted once the edit is saved.
    private func remove(_ path: String) {
        images.removeAll { $0 == path }
        if uploaded.contains(path) {
            uploaded.removeAll { $0 == path }
            Task { await AttachmentStore.shared.remove([path], from: .beginnerNotes) }
        }
    }

    private func cancel() {
        let orphans = uploaded
        Task { await AttachmentStore.shared.remove(orphans, from: .beginnerNotes) }
        onClose()
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            do {
                try await BeginnerNoteRepository.save(id: note?.id, title: title, body: noteBody, category: category,
                                                      images: images, previous: note?.image_paths ?? [])
                uploaded = []
                await onSaved()
                onClose()
            } catch {
                self.error = "保存に失敗しました。もう一度お試しください。"
            }
        }
    }
}

/// PhotosPicker's label closure isn't main-actor isolated.
private struct NotePickerLabel: View {
    let uploading: Bool

    var body: some View {
        Label(uploading ? "アップロード中..." : "画像を追加", systemImage: uploading ? "arrow.up.circle" : "photo.badge.plus")
            .appFont(14, weight: .medium)
            .foregroundStyle(Color.mutedForeground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
    }
}
