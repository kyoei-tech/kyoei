import KyoeiCore
import SwiftUI

/// 通知の管理: the secret admin menu (bell ×5 + PIN in 設定). Port of
/// components/notification-admin-menu.tsx.
struct AdminMenuView: View {
    let onBack: () -> Void
    let open: (SettingsView.Screen) -> Void

    var body: some View {
        TabPage {
            BackHeader(label: "設定へ戻る", variant: .subtle, onBack: onBack)
            PageHeading(title: "通知の管理", subtitle: "編集した内容は全ての端末にリアルタイムで反映されます。")
            item("プッシュ通知の管理", "運行状況の各タイマーで送信する通知の時間・タイトル・本文を編集します。", "bell") { open(.pushEditor) }
            item("アラートの管理", "誤タップ防止の確認画面に表示される文言を編集します。", "exclamationmark.shield") { open(.alertEditor) }
            item("検索結果登録", "ヤード配置の行き先検索に表示される店舗名・タイトルを編集します。", "list.clipboard") { open(.registry) }
        }
    }

    private func item(_ title: String, _ description: String, _ systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage).foregroundStyle(Color.primary)
                    .frame(width: 40, height: 40).background(Color.primary.opacity(0.1), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
                    Text(description).appFont(12).foregroundStyle(Color.mutedForeground).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
            }
            .padding(16)
            .card()
        }
        .buttonStyle(.plain)
    }
}

// MARK: - プッシュ通知の管理

/// Edits the shared push_notification_rules (時間・タイトル・本文) per timer.
/// Port of components/push-notification-editor-view.tsx.
struct PushRuleEditorView: View {
    let onBack: () -> Void

    @Environment(SharedData.self) private var data
    @Environment(PendingNotificationStore.self) private var pending
    @State private var form: Form?
    @State private var draft = PushRuleDraft()
    @State private var error: String?
    @State private var pendingDelete: PushNotificationRule?
    @State private var previewingID: String?

    private enum Form: Equatable {
        case add(NotificationTimerType)
        case edit(id: String, type: NotificationTimerType)
    }

    var body: some View {
        TabPage {
            BackHeader(label: "設定へ戻る", variant: .subtle, onBack: onBack)
            PageHeading(title: "プッシュ通知の管理", subtitle: "運行状況の各タイマーで送信する通知の時間・タイトル・本文を編集できます。ここでの変更は全員のプッシュ通知に反映されます。")
            if data.notificationRuleRows.isLoading && data.notificationRules.isEmpty {
                Text("読み込み中です…").appFont(14).foregroundStyle(Color.mutedForeground)
            }
            ForEach(NotificationTimerType.allCases, id: \.self) { type in
                section(type)
            }
        }
        .overlay {
            if let rule = pendingDelete {
                ConfirmActionDialog(message: "この通知を削除しますか？\n削除すると元に戻せません。", confirmLabel: "削除する",
                                    onConfirm: {
                                        pendingDelete = nil
                                        Task {
                                            try? await PushRuleRepository.delete(id: rule.id)
                                            await data.notificationRuleRows.refresh()
                                        }
                                    }, onCancel: { pendingDelete = nil })
            }
        }
    }

    private func section(_ type: NotificationTimerType) -> some View {
        let rules = data.notificationRules.filter { $0.timerType == type }.sorted { $0.threshold < $1.threshold }
        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(type.editorLabel).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                Text(type.editorDescription).appFont(12).foregroundStyle(Color.mutedForeground)
            }
            if rules.isEmpty && form != .add(type) {
                Text("通知はまだありません。").appFont(14).foregroundStyle(Color.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(10).card(radius: 12, fill: .appBackground)
            }
            ForEach(rules) { rule in
                if form == .edit(id: rule.id, type: type) {
                    editor(type) { threshold in
                        try await PushRuleRepository.update(id: rule.id, threshold: threshold, title: draft.title.trimmingCharacters(in: .whitespacesAndNewlines), message: draft.message.trimmingCharacters(in: .whitespacesAndNewlines))
                    }
                } else {
                    ruleRow(rule, type: type)
                }
            }
            if form == .add(type) {
                editor(type) { threshold in
                    try await PushRuleRepository.add(type: type, threshold: threshold, title: draft.title.trimmingCharacters(in: .whitespacesAndNewlines), message: draft.message.trimmingCharacters(in: .whitespacesAndNewlines))
                }
            } else {
                Button {
                    draft = .new(for: type)
                    error = nil
                    form = .add(type)
                } label: { Label("通知を追加", systemImage: "plus") }
                    .buttonStyle(PillButtonStyle(kind: .outline))
            }
        }
        .padding(16)
        .card()
    }

    private func ruleRow(_ rule: PushNotificationRule, type: NotificationTimerType) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                if type.hasEditableThreshold {
                    Text(PushRuleDraft.thresholdLabel(rule.threshold)).appFont(10.4, weight: .semibold).foregroundStyle(Color.primary)
                }
                StyledTextView(raw: rule.title).appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
                StyledTextView(raw: rule.message).appFont(12).foregroundStyle(Color.appForeground)
            }
            Spacer(minLength: 0)
            Button { preview(rule) } label: {
                Image(systemName: previewingID == rule.id ? "hourglass" : "play.fill")
            }
            .disabled(previewingID != nil)
            .accessibilityLabel(previewingID == rule.id ? "3秒後にテスト通知を送信します" : "テスト通知を送信")
            Button {
                draft = PushRuleDraft(rule: rule)
                error = nil
                form = .edit(id: rule.id, type: type)
            } label: { Image(systemName: "pencil") }
            Button { pendingDelete = rule } label: { Image(systemName: "trash") }
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.mutedForeground)
        .padding(12)
        .card(radius: 12, fill: .appBackground)
    }

    private func editor(_ type: NotificationTimerType, save: @escaping (TimeInterval) async throws -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if type.hasEditableThreshold {
                HStack(spacing: 8) {
                    Stepper("\(draft.hours)時間", value: $draft.hours, in: 0...24)
                    Stepper("\(draft.minutes)分", value: $draft.minutes, in: 0...59)
                }
                .appFont(14)
            }
            FormField(label: "タイトル") { BoxedTextField(placeholder: "", text: $draft.title, fill: .card) }
            FormField(label: "本文") { MemoEditor(placeholder: "", text: $draft.message, minLines: 3) }
            Text(StyledText.markupHelp).appFont(10.4).foregroundStyle(Color.mutedForeground)
            if !draft.title.isEmpty || !draft.message.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("プレビュー").appFont(10.4, weight: .semibold).foregroundStyle(Color.mutedForeground)
                    StyledTextView(raw: draft.title).appFont(14, weight: .bold)
                    StyledTextView(raw: draft.message).appFont(12)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .card(radius: 10)
            }
            if let error {
                Text(error).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
            }
            FormActions(onCancel: { form = nil; error = nil }) {
                switch draft.validated(for: type) {
                case .failure(let failure):
                    error = failure.message
                case .success(let threshold):
                    Task {
                        do {
                            try await save(threshold)
                            await data.notificationRuleRows.refresh()
                            form = nil
                            error = nil
                        } catch {
                            self.error = error.localizedDescription
                        }
                    }
                }
            }
        }
        .padding(12)
        .card(radius: 12, border: Color.primary.opacity(0.5), fill: .appBackground)
    }

    /// Sends the rule as a real notification in 3 seconds (time to lock the
    /// phone and see the banner), plus the in-app modal.
    private func preview(_ rule: PushNotificationRule) {
        previewingID = rule.id
        Task {
            await NotificationScheduler.schedulePreview(title: rule.title, message: rule.message, after: 3)
            try? await Task.sleep(for: .seconds(3))
            pending.enqueue(title: rule.title, message: rule.message)
            previewingID = nil
        }
    }
}

// MARK: - アラートの管理

/// Edits every 誤タップ防止 dialog's wording and button labels. Port of
/// components/alert-message-editor-view.tsx.
struct AlertMessageEditorView: View {
    let onBack: () -> Void

    @Environment(SharedData.self) private var data
    @State private var editingID: String?
    @State private var draft = ""
    @State private var confirmLabel = ""
    @State private var cancelLabel = ""
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        let messages = data.confirmMessages
        TabPage {
            BackHeader(variant: .subtle, onBack: onBack)
            PageHeading(title: "アラートの管理", subtitle: "誤タップ防止の確認画面に表示される文言を編集できます。ここでの変更は全ての端末にリアルタイムで反映されます。")
            if data.confirmMessageRows.isLoading && data.confirmMessageRows.rows.isEmpty {
                Text("読み込み中です…").appFont(14).foregroundStyle(Color.mutedForeground)
            }
            ForEach(data.confirmMessageRows.rows, id: \.id) { item in
                let visibility = ConfirmMessages.buttonVisibility(item.id)
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(item.label).appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
                        Spacer()
                        if editingID != item.id {
                            Button {
                                draft = item.message
                                confirmLabel = messages.confirmLabel(item.id)
                                cancelLabel = messages.cancelLabel(item.id)
                                error = nil
                                editingID = item.id
                            } label: { Image(systemName: "pencil") }
                            .buttonStyle(.plain).foregroundStyle(Color.mutedForeground)
                        }
                    }
                    if editingID == item.id {
                        editor(item.id, visibility: visibility)
                    } else {
                        StyledTextView(raw: item.message).appFont(14).foregroundStyle(Color.appForeground)
                        if visibility.hasButtons {
                            let confirm = messages.confirmLabel(item.id)
                            Text("ボタン：\(visibility.hasCancel ? "\(messages.cancelLabel(item.id)) / \(confirm)" : confirm)")
                                .appFont(10.4).foregroundStyle(Color.mutedForeground)
                        }
                    }
                }
                .padding(16)
                .card(border: editingID == item.id ? Color.primary.opacity(0.5) : .border)
            }
        }
    }

    private func editor(_ id: String, visibility: ConfirmMessages.ButtonVisibility) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            MemoEditor(placeholder: "", text: $draft, minLines: 3)
            Text(StyledText.markupHelp).appFont(10.4).foregroundStyle(Color.mutedForeground)
            if !draft.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("プレビュー").appFont(10.4, weight: .semibold).foregroundStyle(Color.mutedForeground)
                    StyledTextView(raw: draft).appFont(14, weight: .bold)
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(10).card(radius: 10, fill: .appBackground)
            }
            if visibility.hasButtons {
                VStack(alignment: .leading, spacing: 6) {
                    Text("ボタンの文言").appFont(10.4, weight: .semibold).foregroundStyle(Color.mutedForeground)
                    HStack(spacing: 8) {
                        if visibility.hasCancel {
                            FormField(label: "キャンセル側") { BoxedTextField(placeholder: "", text: $cancelLabel) }
                        }
                        FormField(label: "確定側") { BoxedTextField(placeholder: "", text: $confirmLabel) }
                    }
                }
            }
            if let error {
                Text(error).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
            }
            FormActions(canSave: !saving, saveLabel: saving ? "保存中…" : "保存", onCancel: { editingID = nil; error = nil }) {
                if let message = ConfirmMessageUpdate.validationError(id: id, message: draft, confirmLabel: confirmLabel) {
                    error = message
                    return
                }
                saving = true
                Task {
                    defer { saving = false }
                    do {
                        try await ConfirmMessageRepository.update(id: id, ConfirmMessageUpdate(id: id, message: draft, confirmLabel: confirmLabel, cancelLabel: cancelLabel))
                        await data.confirmMessageRows.refresh()
                        editingID = nil
                    } catch {
                        self.error = error.localizedDescription
                    }
                }
            }
        }
    }
}

// MARK: - 検索結果登録

/// Manages the title/store registry behind ヤード配置's 移動先検索. Port of
/// components/yard-destination-registry-view.tsx.
struct DestinationRegistryView: View {
    let onBack: () -> Void

    @State private var titles = RealtimeTable<DestinationTitleRow>(table: "yard_destination_titles", fetch: YardRepository.fetchTitles)
    @State private var stores = RealtimeTable<DestinationStoreRow>(table: "yard_destination_stores", fetch: DestinationRegistryRepository.fetchStores)
    @State private var search = ""
    @State private var addingTitle = false
    @State private var newTitle = ""
    @State private var confirmDelete: String?
    @State private var bulkInputs: [String: String] = [:]

    var body: some View {
        let sortedTitles = titles.rows.sorted { $0.sort_order < $1.sort_order }
        let storesByTitle = Dictionary(grouping: stores.rows, by: \.title_id)
        TabPage {
            BackHeader(label: "通知の管理へ戻る", variant: .subtle, onBack: onBack)
            PageHeading(title: "検索結果登録")
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.mutedForeground)
                TextField("店舗名で検索", text: $search).appFont(14).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).padding(.vertical, 10).card(radius: 12)
            if let results = YardLayout.search(search, stores: stores.rows, titles: titles.rows) {
                VStack(alignment: .leading, spacing: 4) {
                    if results.isEmpty {
                        Text("該当なし。確認してください。").appFont(14).foregroundStyle(Color.mutedForeground)
                    }
                    ForEach(results, id: \.store.id) { Text("\($0.store.name)　\($0.title)").appFont(14) }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(12).card(radius: 12)
            }

            if addingTitle {
                HStack(spacing: 8) {
                    BoxedTextField(placeholder: "行き先タイトル名", text: $newTitle, fill: .card).onSubmit(addTitle)
                    Button("追加", action: addTitle).buttonStyle(PillButtonStyle()).fixedSize()
                    Button { addingTitle = false; newTitle = "" } label: { Image(systemName: "xmark") }.buttonStyle(.plain)
                }
            } else {
                Button { addingTitle = true } label: { Label("行き先タイトルを追加", systemImage: "plus") }
                    .buttonStyle(PillButtonStyle(kind: .outline))
            }

            ForEach(sortedTitles) { title in
                let titleStores = (storesByTitle[title.id] ?? []).sorted { ($0.sort_order ?? 0) < ($1.sort_order ?? 0) }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        CommitTextField(placeholder: "タイトル", value: title.title) { value in
                            let trimmed = value.trimmingCharacters(in: .whitespaces)
                            guard !trimmed.isEmpty else { return }
                            write { try await DestinationRegistryRepository.renameTitle(id: title.id, trimmed) }
                        }
                        .appFont(16, weight: .bold)
                        deleteButton(id: title.id, label: "\(title.title)を削除")
                    }
                    if confirmDelete == title.id {
                        ConfirmDeleteInline(message: "「\(title.title)」を削除しますか？このタイトルと配下の店舗名がすべて削除されます。", onConfirm: {
                            confirmDelete = nil
                            write { try await DestinationRegistryRepository.deleteTitle(id: title.id) }
                        }, onCancel: { confirmDelete = nil })
                    }
                    if titleStores.isEmpty {
                        Text("店舗名が登録されていません。").appFont(14).foregroundStyle(Color.mutedForeground.opacity(0.6))
                    }
                    ForEach(titleStores) { store in
                        HStack(spacing: 8) {
                            CommitTextField(placeholder: "店舗名", value: store.name) { value in
                                let trimmed = value.trimmingCharacters(in: .whitespaces)
                                guard !trimmed.isEmpty else { return }
                                write { try await DestinationRegistryRepository.renameStore(id: store.id, trimmed) }
                            }
                            .appFont(14)
                            deleteButton(id: store.id, label: "\(store.name)を削除")
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8).card(radius: 12, fill: .appBackground)
                        if confirmDelete == store.id {
                            ConfirmDeleteInline(message: "「\(store.name)」を削除しますか？", onConfirm: {
                                confirmDelete = nil
                                write { try await DestinationRegistryRepository.deleteStore(id: store.id) }
                            }, onCancel: { confirmDelete = nil })
                        }
                    }
                    MemoEditor(placeholder: "店舗名を改行または「、」区切りで入力\n（複数件を一括登録できます）", text: Binding(
                        get: { bulkInputs[title.id] ?? "" },
                        set: { bulkInputs[title.id] = $0 }
                    ))
                    Button {
                        let names = StoreNameInput.split(bulkInputs[title.id] ?? "")
                        guard !names.isEmpty else { return }
                        bulkInputs[title.id] = ""
                        write { try await DestinationRegistryRepository.addStores(names, titleID: title.id, startingAt: titleStores.count) }
                    } label: { Label("登録", systemImage: "checkmark") }
                        .buttonStyle(PillButtonStyle()).fixedSize()
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                .padding(16)
                .card()
            }
        }
        .syncing(titles)
        .syncing(stores)
    }

    private func deleteButton(id: String, label: String) -> some View {
        Button { confirmDelete = id } label: { Image(systemName: "trash").font(.system(size: 13)) }
            .buttonStyle(.plain)
            .foregroundStyle(Color.mutedForeground.opacity(0.6))
            .accessibilityLabel(label)
    }

    private func addTitle() {
        let title = newTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        newTitle = ""
        addingTitle = false
        write { try await DestinationRegistryRepository.addTitle(title, sortOrder: titles.rows.count) }
    }

    private func write(_ operation: @escaping () async throws -> Void) {
        Task {
            try? await operation()
            await titles.refresh()
            await stores.refresh()
        }
    }
}
