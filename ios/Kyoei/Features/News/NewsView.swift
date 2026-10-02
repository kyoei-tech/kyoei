import KyoeiCore
import SwiftUI

/// おしらせ: newest-first list, detail, and (PIN 2486, hidden for part-time
/// staff) posting / editing past posts. A new post instantly pushes to every
/// device via the database trigger. Port of components/news-view.tsx.
struct NewsView: View {
    /// Bumped by the shell when the おしらせ tab is tapped: back to the list,
    /// like the メニュー tab does for its sub-pages.
    var resetToken = 0
    @Environment(SettingsStore.self) private var settings
    @State private var table = RealtimeTable<NewsPostRow>(table: "news_posts", fetch: NewsRepository.fetch)
    @State private var gate = PinGate(code: "2486")
    @State private var screen: Screen = .list

    #if DEBUG
    private func openDebugShot() {
        if DebugShot.name == "news-detail", screen == .list, let first = table.rows.first { screen = .detail(id: first.id) }
    }
    #endif

    private enum Screen: Equatable {
        case list
        case detail(id: String)
        case compose(editingID: String?)
        case manage
    }

    var body: some View {
        Group {
            switch screen {
            case .list: list
            case .detail(let id): detail(id)
            case .compose(let id): NewsComposer(post: table.rows.first { $0.id == id }, onBack: { screen = .list }, onManage: { screen = .manage }) { draft in
                if let id {
                    try await NewsRepository.update(id: id, draft)
                } else {
                    try await NewsRepository.add(draft)
                }
                await table.refresh()
                screen = .list
            }
            .id(id ?? "new")
            case .manage: manage
            }
        }
        .syncing(table)
        #if DEBUG
        .onChange(of: table.rows.count) { _, _ in openDebugShot() }
        #endif
        .pinGate(gate)
        .onChange(of: resetToken) { _, _ in screen = .list }
    }

    private var list: some View {
        TabPage {
            PageHeading(title: "おしらせ", subtitle: "新しい投稿から順に表示されます。") {
                if !settings.settings.partTimeMode {
                    Button { gate.guarded { screen = .compose(editingID: nil) } } label: {
                        Label("投稿", systemImage: "plus")
                    }
                    .buttonStyle(PillButtonStyle()).fixedSize()
                }
            }
            if table.rows.isEmpty {
                EmptyStateBox(text: table.isLoading ? "読み込み中…" : "まだおしらせはありません。")
            } else {
                ForEach(table.rows) { post in
                    Button { screen = .detail(id: post.id) } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(post.title).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                                Text(post.dateLabel()).appFont(12).foregroundStyle(Color.mutedForeground)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                        .card()
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private func detail(_ id: String) -> some View {
        TabPage {
            BackHeader(label: "一覧へ戻る", variant: .subtle) { screen = .list }
            if let post = table.rows.first(where: { $0.id == id }) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(post.title).appFont(18, weight: .bold).foregroundStyle(Color.appForeground)
                        Spacer(minLength: 0)
                        Text(post.dateLabel()).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                    }
                    Text(post.content.isEmpty ? "内容はありません。" : post.content)
                        .appFont(16)
                        .foregroundStyle(Color.appForeground)
                        .lineSpacing(5)
                        .textSelection(.enabled)
                    if !post.author.isEmpty {
                        Text(post.author).appFont(14, weight: .medium).foregroundStyle(Color.mutedForeground)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .card()
            } else {
                EmptyStateBox(text: "このおしらせは削除されました。")
            }
        }
    }

    private var manage: some View {
        TabPage {
            BackHeader(variant: .subtle) { screen = .compose(editingID: nil) }
            PageHeading(title: "過去の投稿を編集")
            if table.rows.isEmpty {
                EmptyStateBox(text: "まだ投稿がありません。")
            } else {
                ForEach(table.rows) { post in
                    ManageRow(post: post, onEdit: { gate.guarded { screen = .compose(editingID: post.id) } }) {
                        try? await NewsRepository.delete(id: post.id)
                        await table.refresh()
                    }
                }
            }
        }
    }
}

private struct ManageRow: View {
    let post: NewsPostRow
    let onEdit: () -> Void
    let onDelete: () async -> Void

    @State private var confirmingDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(post.title).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                    Text(post.dateLabel()).appFont(12).foregroundStyle(Color.mutedForeground)
                }
                Spacer(minLength: 0)
                Button(action: onEdit) { Image(systemName: "pencil") }
                    .accessibilityLabel("\(post.title)を編集")
                Button { confirmingDelete = true } label: { Image(systemName: "trash") }
                    .accessibilityLabel("\(post.title)を削除")
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.mutedForeground)
            if confirmingDelete {
                ConfirmDeleteInline(onConfirm: { Task { await onDelete() } }, onCancel: { confirmingDelete = false })
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .card()
    }
}

private struct NewsComposer: View {
    let post: NewsPostRow?
    let onBack: () -> Void
    let onManage: () -> Void
    let onSave: (NewsRepository.Draft) async throws -> Void

    @State private var draft = NewsRepository.Draft()
    @State private var saving = false
    @State private var failed = false

    var body: some View {
        TabPage {
            BackHeader(variant: .subtle, onBack: onBack) {
                Spacer()
                Button(action: onManage) {
                    Label("過去の投稿を編集", systemImage: "clock.arrow.circlepath")
                        .appFont(12, weight: .semibold)
                        .foregroundStyle(Color.mutedForeground)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .overlay(Capsule().stroke(Color.border))
                }
                .buttonStyle(.plain)
            }
            PageHeading(title: post == nil ? "新しいおしらせ" : "おしらせを編集")
            FormField(label: "タイトル") { BoxedTextField(placeholder: "", text: $draft.title, fill: .card) }
            FormField(label: "カテゴリー") { BoxedTextField(placeholder: "", text: $draft.category, fill: .card) }
            FormField(label: "内容") { MemoEditor(placeholder: "", text: $draft.content, minLines: 6) }
            FormField(label: "投稿者名") { BoxedTextField(placeholder: "", text: $draft.author, fill: .card) }
            if failed {
                Text("保存に失敗しました。もう一度お試しください。").appFont(12).foregroundStyle(Color.destructive)
            }
            Button(post == nil ? "投稿する" : "更新する", action: save)
                .buttonStyle(PillButtonStyle())
                .disabled(saving || draft.trimmed.title.isEmpty)
                .opacity(saving || draft.trimmed.title.isEmpty ? 0.4 : 1)
        }
        .onAppear {
            guard let post else { return }
            draft = .init(title: post.title, category: post.category, content: post.content, author: post.author)
        }
    }

    private func save() {
        saving = true
        failed = false
        Task {
            defer { saving = false }
            do { try await onSave(draft) } catch { failed = true }
        }
    }
}
