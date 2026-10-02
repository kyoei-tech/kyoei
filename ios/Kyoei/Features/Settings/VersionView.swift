import KyoeiCore
import SwiftUI

/// Version: the shared update history (changelog_entries). Adding versions or
/// entries, and editing / hiding / deleting entries, needs PIN 0525. Hidden
/// entries collect at the bottom and can be restored. Port of
/// components/version-view.tsx.
struct VersionView: View {
    let onBack: () -> Void

    @State private var table = RealtimeTable<ChangelogRow>(table: "changelog_entries", fetch: ChangelogRepository.fetch)
    @State private var gate = PinGate(code: "0525")
    @State private var openOrder: Int??
    @State private var addingVersion = false
    @State private var newVersion = ""
    @State private var newVersionDate = Date()
    @State private var newVersionEntry = ChangelogRepository.EntryDraft()
    @State private var addingEntryTo: Int?
    @State private var entryDraft = ChangelogRepository.EntryDraft()
    @State private var editingID: String?
    @State private var actionTarget: ChangelogRow?

    var body: some View {
        let versions = Changelog.grouped(table.rows)
        TabPage {
            BackHeader(label: "設定へ戻る", variant: .subtle, onBack: onBack)
            PageHeading(title: "Version", subtitle: "これまでの更新内容を日付順に確認できます。各項目の編集ボタンから削除・非表示・編集を行えます（暗証番号が必要です）。") {
                Button {
                    gate.guarded {
                        newVersion = ""
                        newVersionDate = Date()
                        newVersionEntry = .init()
                        addingVersion = true
                    }
                } label: { Label("新しいバージョン", systemImage: "plus") }
                    .buttonStyle(PillButtonStyle()).fixedSize()
            }
            if addingVersion { newVersionForm(versions) }
            if table.isLoading && table.rows.isEmpty {
                Text("読み込み中です…").appFont(14).foregroundStyle(Color.mutedForeground)
            }
            ForEach(Array(versions.enumerated()), id: \.element.id) { index, version in
                versionCard(version, isLatest: index == 0, isOpen: isOpen(version, index: index))
            }
            hiddenSection
        }
        .syncing(table)
        .pinGate(gate)
        .confirmationDialog("この項目をどうしますか？", isPresented: Binding(get: { actionTarget != nil }, set: { if !$0 { actionTarget = nil } }), presenting: actionTarget) { row in
            Button("編集") {
                entryDraft = .init(page: row.page, kind: row.kind, description: row.description)
                editingID = row.id
            }
            Button("非表示") { write { try await ChangelogRepository.setHidden(id: row.id, true) } }
            Button("削除", role: .destructive) { write { try await ChangelogRepository.delete(id: row.id) } }
            Button("キャンセル", role: .cancel) {}
        }
    }

    /// The newest version starts open; tapping toggles (only one open at a time).
    private func isOpen(_ version: ChangelogVersion, index: Int) -> Bool {
        switch openOrder {
        case .none: index == 0
        case .some(let order): order == version.order
        }
    }

    private func versionCard(_ version: ChangelogVersion, isLatest: Bool, isOpen: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { openOrder = .some(isOpen ? nil : version.order) } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 8) {
                            Text("Version \(version.version)").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                            if isLatest {
                                Text("最新").appFont(10.4, weight: .bold).foregroundStyle(Color.primary)
                                    .padding(.horizontal, 8).padding(.vertical, 2).background(Color.primary.opacity(0.15), in: Capsule())
                            }
                        }
                        Text(version.dateLabel).appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                    Spacer()
                    Image(systemName: "chevron.down").rotationEffect(.degrees(isOpen ? 180 : 0)).foregroundStyle(Color.mutedForeground)
                }
                .padding(.horizontal, 20).padding(.vertical, 16)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isOpen {
                Divider()
                VStack(alignment: .leading, spacing: 8) {
                    if version.visibleEntries.isEmpty {
                        Text("表示できる項目はありません（非表示にした項目のみ）。").appFont(14).foregroundStyle(Color.mutedForeground)
                    }
                    ForEach(version.visibleEntries) { entry in
                        if editingID == entry.id {
                            EntryForm(draft: $entryDraft, onCancel: { editingID = nil }) {
                                let draft = entryDraft
                                write { try await ChangelogRepository.update(entry, with: draft) }
                                editingID = nil
                            }
                        } else {
                            entryRow(entry)
                        }
                    }
                    if addingEntryTo == version.order {
                        EntryForm(draft: $entryDraft, onCancel: { addingEntryTo = nil }) {
                            guard entryDraft.isComplete else { return }
                            let draft = entryDraft
                            write { try await ChangelogRepository.addEntry(draft, version: version.version, date: version.date, versionOrder: version.order, entryOrder: version.nextEntryOrder) }
                            addingEntryTo = nil
                        }
                    } else {
                        Button {
                            gate.guarded {
                                entryDraft = .init()
                                addingEntryTo = version.order
                            }
                        } label: { Label("項目を追加", systemImage: "plus") }
                            .buttonStyle(PillButtonStyle(kind: .outline))
                    }
                }
                .padding(.horizontal, 20).padding(.vertical, 16)
            }
        }
        .card()
    }

    private func entryRow(_ entry: ChangelogRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: entry.kind.systemImage)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(entry.kind.tint)
                .frame(width: 24, height: 24)
                .background(entry.kind.tint.opacity(0.15), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(entry.page).appFont(12, weight: .bold).foregroundStyle(Color.appForeground)
                    Text(entry.kind.rawValue).appFont(10.4).foregroundStyle(Color.mutedForeground)
                }
                Text(entry.description).appFont(14).foregroundStyle(Color.appForeground).lineSpacing(3)
            }
            Spacer(minLength: 0)
            Button { gate.guarded { actionTarget = entry } } label: { Image(systemName: "pencil") }
                .buttonStyle(.plain).foregroundStyle(Color.mutedForeground)
                .accessibilityLabel("この項目を編集")
        }
        .padding(12)
        .card(radius: 12, fill: .appBackground)
    }

    @ViewBuilder private var hiddenSection: some View {
        let hidden = table.rows.filter(\.hidden)
        if !hidden.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("非表示の項目").appFont(14, weight: .bold).foregroundStyle(Color.mutedForeground)
                ForEach(hidden) { row in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Version \(row.version)・\(row.page)").appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
                            Text(row.description).appFont(12).foregroundStyle(Color.mutedForeground).lineLimit(2)
                        }
                        Spacer()
                        Button("元に戻す") { gate.guarded { write { try await ChangelogRepository.setHidden(id: row.id, false) } } }
                            .appFont(12, weight: .semibold)
                    }
                    .padding(12)
                    .card(radius: 12, fill: .appBackground)
                }
            }
        }
    }

    private func newVersionForm(_ versions: [ChangelogVersion]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            FormField(label: "バージョン") { BoxedTextField(placeholder: "例：1.11.0", text: $newVersion) }
            DatePicker("日付", selection: $newVersionDate, displayedComponents: .date).appFont(14)
            EntryForm(draft: $newVersionEntry, onCancel: { addingVersion = false }) {
                let version = newVersion.trimmingCharacters(in: .whitespaces)
                guard !version.isEmpty, newVersionEntry.isComplete else { return }
                let draft = newVersionEntry
                let order = Changelog.nextVersionOrder(versions)
                let date = LocalDate(newVersionDate).iso
                write { try await ChangelogRepository.addEntry(draft, version: version, date: date, versionOrder: order, entryOrder: 0) }
                openOrder = .some(order)
                addingVersion = false
            }
        }
        .padding(16)
        .card(border: Color.primary.opacity(0.5))
    }

    private func write(_ operation: @escaping () async throws -> Void) {
        Task {
            try? await operation()
            await table.refresh()
        }
    }
}

private struct EntryForm: View {
    @Binding var draft: ChangelogRepository.EntryDraft
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            FormField(label: "ページ") { BoxedTextField(placeholder: "", text: $draft.page) }
            FormField(label: "種類") {
                Picker("種類", selection: $draft.kind) {
                    ForEach(ChangeKind.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            FormField(label: "内容") { MemoEditor(placeholder: "", text: $draft.description, minLines: 3) }
            FormActions(onCancel: onCancel, onSave: onSave)
        }
        .padding(12)
        .card(radius: 12, border: Color.primary.opacity(0.6), fill: .appBackground)
    }
}

extension ChangeKind {
    var systemImage: String {
        switch self {
        case .added: "plus"
        case .changed: "pencil"
        case .removed: "trash"
        }
    }

    var tint: Color {
        switch self {
        case .added: .secondary
        case .changed: .primary
        case .removed: .destructive
        }
    }
}
