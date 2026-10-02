import KyoeiCore
import Supabase
import SwiftUI

enum DictionaryRepository {
    private struct Payload: Encodable {
        var category: String
        var term: String
        var reading: String
        var meaning: String
        var antonym: String
        var example: String
        var updated_at: String?
    }

    private struct NewCategory: Encodable {
        var name: String
        var sort_order: Int
    }

    static func fetchTerms() async throws -> [DictionaryTermRow] {
        try await Backend.client.from("dictionary_terms").select(DictionaryTermRow.selectColumns)
            .order("created_at", ascending: true).execute().value
    }

    static func fetchCategories() async throws -> [DictionaryCategoryRow] {
        try await Backend.client.from("dictionary_categories").select(DictionaryCategoryRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    /// Saves the term and makes sure its category is in the shared list.
    static func save(_ draft: DictionaryTermDraft, id: String?, categoryCount: Int) async throws {
        func t(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }
        let payload = Payload(category: draft.finalCategory, term: t(draft.term), reading: t(draft.reading), meaning: t(draft.meaning),
                              antonym: t(draft.antonym), example: t(draft.example), updated_at: id == nil ? nil : DBTimestamp.format(Date()))
        if let id {
            try await Backend.client.from("dictionary_terms").update(payload).eq("id", value: id).execute()
        } else {
            try await Backend.client.from("dictionary_terms").insert(payload).execute()
        }
        try await Backend.client.from("dictionary_categories")
            .upsert(NewCategory(name: draft.finalCategory, sort_order: categoryCount), onConflict: "name", ignoreDuplicates: true)
            .execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("dictionary_terms").delete().eq("id", value: id).execute()
    }
}

/// ドライバー語録: industry terms and slang in 50音順 or by category, with
/// kana-aware search. Registering is hidden for part-time staff. Port of
/// components/driver-terms-view.tsx.
struct DriverTermsView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var terms = RealtimeTable<DictionaryTermRow>(table: "dictionary_terms", fetch: DictionaryRepository.fetchTerms)
    @State private var categories = RealtimeTable<DictionaryCategoryRow>(table: "dictionary_categories", fetch: DictionaryRepository.fetchCategories)
    @State private var byCategory = false
    @State private var selectedCategory: String?
    @State private var selectedTermID: String?
    @State private var query = ""
    @State private var form: DictionaryTermDraft?
    @State private var editingID: String?
    @State private var confirmingDelete = false

    private var canEdit: Bool { !settings.settings.partTimeMode }

    var body: some View {
        Group {
            if let term = terms.rows.first(where: { $0.id == selectedTermID }) {
                detail(term)
            } else if byCategory, let selectedCategory {
                categoryTerms(selectedCategory)
            } else {
                top
            }
        }
        .syncing(terms)
        .syncing(categories)
    }

    private var top: some View {
        TabPage {
            PageHeading(title: "ドライバー語録", subtitle: "業界用語、隠語を調べられるおもしろ辞典📖") { registerToggle }
            Button(byCategory ? "50音順表示に切り替え" : "カテゴリー表示に切り替え") {
                byCategory.toggle()
                selectedCategory = nil
                form = nil
            }
            .buttonStyle(PillButtonStyle(kind: .outline))
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.mutedForeground)
                TextField("単語・読み・意味で検索", text: $query).appFont(14).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).padding(.vertical, 10).card(radius: 14)
            formIfAdding
            if let results = DriverTerms.search(query, in: terms.rows) {
                if results.isEmpty { EmptyStateBox(text: "一致する単語はありません。") }
                ForEach(results) { termRow($0) }
            } else if terms.rows.isEmpty {
                EmptyStateBox(text: terms.isLoading ? "読み込み中…" : "まだ登録がありません。")
            } else if byCategory {
                ForEach(DriverTerms.byCategory(terms.rows), id: \.category) { group in
                    Button { selectedCategory = group.category } label: {
                        HStack {
                            Text(group.category).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                            Spacer()
                            Text("\(group.terms.count)件").appFont(12).foregroundStyle(Color.mutedForeground)
                            Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                        }
                        .padding(.horizontal, 20).padding(.vertical, 16).card()
                    }
                    .buttonStyle(.plain)
                }
            } else {
                ForEach(DriverTerms.kanaOrder(terms.rows)) { termRow($0) }
            }
        }
    }

    private func categoryTerms(_ category: String) -> some View {
        TabPage {
            BackHeader(label: "カテゴリー一覧に戻る", variant: .icon, onBack: { selectedCategory = nil; form = nil }) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("ドライバー語録").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                    Text(category).appFont(20, weight: .bold).foregroundStyle(Color.appForeground)
                }
                Spacer()
                registerToggle
            }
            formIfAdding
            let list = DriverTerms.byCategory(terms.rows).first { $0.category == category }?.terms ?? []
            if list.isEmpty { EmptyStateBox(text: "まだ登録がありません。") }
            ForEach(list) { termRow($0) }
        }
    }

    private func detail(_ term: DictionaryTermRow) -> some View {
        TabPage {
            BackHeader(label: "一覧へ戻る", variant: .subtle) {
                selectedTermID = nil
                confirmingDelete = false
                form = nil
            }
            if canEdit, form != nil, editingID == term.id {
                termForm
            } else {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(term.categoryLabel).appFont(12, weight: .semibold).foregroundStyle(Color.primary)
                                .padding(.horizontal, 12).padding(.vertical, 4).background(Color.primary.opacity(0.1), in: Capsule())
                            Text(term.term).appFont(20, weight: .bold).foregroundStyle(Color.appForeground)
                            if !term.reading.isEmpty {
                                Text(term.reading).appFont(14).foregroundStyle(Color.mutedForeground)
                            }
                        }
                        Spacer()
                        if canEdit {
                            Button {
                                editingID = term.id
                                form = DictionaryTermDraft(term)
                            } label: { Image(systemName: "pencil") }.accessibilityLabel("編集")
                            Button { confirmingDelete = true } label: { Image(systemName: "trash") }.accessibilityLabel("削除")
                        }
                    }
                    .buttonStyle(.plain).foregroundStyle(Color.mutedForeground)
                    if canEdit && confirmingDelete {
                        ConfirmDeleteInline(message: "この単語を削除しますか？", onConfirm: {
                            Task {
                                try? await DictionaryRepository.delete(id: term.id)
                                confirmingDelete = false
                                selectedTermID = nil
                                await terms.refresh()
                            }
                        }, onCancel: { confirmingDelete = false })
                    }
                    section("意味", term.meaning)
                    section("対義語", term.antonym)
                    section("例文", term.example)
                }
                .padding(20)
                .card(radius: Radius.card)
            }
        }
    }

    @ViewBuilder private func section(_ title: String, _ text: String) -> some View {
        if !text.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                Text(text).appFont(14).foregroundStyle(Color.appForeground).lineSpacing(4)
            }
        }
    }

    @ViewBuilder private var registerToggle: some View {
        if canEdit {
            Button {
                if form == nil {
                    editingID = nil
                    form = DictionaryTermDraft(category: selectedCategory ?? "")
                } else {
                    form = nil
                }
            } label: { Label(form == nil ? "登録" : "閉じる", systemImage: form == nil ? "plus" : "xmark") }
                .buttonStyle(PillButtonStyle(kind: .secondary)).fixedSize()
        }
    }

    @ViewBuilder private var formIfAdding: some View {
        if canEdit, form != nil, editingID == nil { termForm }
    }

    private var termForm: some View {
        let draft = Binding(get: { form ?? DictionaryTermDraft() }, set: { form = $0 })
        let names = categories.rows.map(\.name)
        return VStack(alignment: .leading, spacing: 12) {
            FormField(label: "カテゴリー") {
                Menu {
                    ForEach(names, id: \.self) { name in Button(name) { draft.wrappedValue.category = name } }
                    Divider()
                    Button("＋ 新しいカテゴリーを追加") { draft.wrappedValue.category = nil }
                } label: {
                    HStack {
                        Text(draft.wrappedValue.category.map { $0.isEmpty ? "カテゴリーを選択" : $0 } ?? "新しいカテゴリー")
                            .appFont(14).foregroundStyle(Color.appForeground)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down").foregroundStyle(Color.mutedForeground)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10).card(radius: 14, fill: .appBackground)
                }
                if draft.wrappedValue.category == nil {
                    BoxedTextField(placeholder: "新しいカテゴリー名", text: draft.newCategory)
                }
            }
            FormField(label: "単語（用語名）") { BoxedTextField(placeholder: "", text: draft.term) }
            FormField(label: "読みがな") { BoxedTextField(placeholder: "", text: draft.reading) }
            FormField(label: "意味（概要）") { MemoEditor(placeholder: "", text: draft.meaning, minLines: 3) }
            FormField(label: "対義語（反対の意味の言葉）") { BoxedTextField(placeholder: "", text: draft.antonym) }
            FormField(label: "例文（どのような時に使われるか）") { MemoEditor(placeholder: "", text: draft.example, minLines: 3) }
            FormActions(canSave: draft.wrappedValue.canSave, saveLabel: editingID == nil ? "登録" : "更新", onCancel: { form = nil }) {
                let saved = draft.wrappedValue
                let id = editingID
                Task {
                    try? await DictionaryRepository.save(saved, id: id, categoryCount: categories.rows.count)
                    await terms.refresh()
                    await categories.refresh()
                    form = nil
                }
            }
        }
        .padding(20)
        .card(radius: Radius.card)
    }

    private func termRow(_ term: DictionaryTermRow) -> some View {
        Button {
            selectedTermID = term.id
            confirmingDelete = false
            form = nil
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(term.term).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                    if !term.reading.isEmpty {
                        Text(term.reading).appFont(12).foregroundStyle(Color.mutedForeground).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
            }
            .padding(.horizontal, 20).padding(.vertical, 14).card()
        }
        .buttonStyle(.plain)
    }
}
