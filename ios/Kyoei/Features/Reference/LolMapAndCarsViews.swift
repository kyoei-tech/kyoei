import KyoeiCore
import Supabase
import SwiftUI

/// LoL MAP: shortcuts to the shared Google My Maps. Port of lol-map-view.tsx.
struct LolMapView: View {
    var body: some View {
        TabPage {
            PageHeading(title: "LoL MAP", subtitle: "各ボタンを押すとGoogleマップを開きます。")
            ForEach(LolMap.links, id: \.label) { link in
                Link(destination: link.url) {
                    HStack(spacing: 12) {
                        Image(systemName: "mappin.and.ellipse").foregroundStyle(Color.primary)
                            .frame(width: 40, height: 40).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                        Text(link.label).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                        Spacer()
                        Image(systemName: "arrow.up.right.square").foregroundStyle(Color.mutedForeground)
                    }
                    .padding(.horizontal, 20).padding(.vertical, 16).card()
                }
            }
        }
    }
}

enum HighValueCarRepository {
    private struct Payload: Encodable {
        var maker: String
        var model_name: String
        var model_code: String
        var memo: String

        init(_ draft: HighValueCarDraft) {
            maker = draft.maker.trimmingCharacters(in: .whitespaces)
            model_name = draft.modelName.trimmingCharacters(in: .whitespaces)
            model_code = draft.modelCode.trimmingCharacters(in: .whitespaces)
            memo = draft.memo.trimmingCharacters(in: .whitespacesAndNewlines)
        }
    }

    static func fetch() async throws -> [HighValueCarRow] {
        try await Backend.client.from("high_value_cars").select(HighValueCarRow.selectColumns)
            .order("created_at", ascending: true).execute().value
    }

    static func add(_ draft: HighValueCarDraft) async throws {
        try await Backend.client.from("high_value_cars").insert(Payload(draft)).execute()
    }

    static func update(id: String, _ draft: HighValueCarDraft) async throws {
        try await Backend.client.from("high_value_cars").update(Payload(draft)).eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("high_value_cars").delete().eq("id", value: id).execute()
    }
}

/// 高額車一覧: makers → models → detail, with kana-aware search. Editing is
/// hidden for part-time staff. Port of components/high-value-cars-view.tsx.
struct HighValueCarsView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var table = RealtimeTable<HighValueCarRow>(table: "high_value_cars", fetch: HighValueCarRepository.fetch)
    @State private var screen: Screen = .makers
    @State private var query = ""
    @State private var form: HighValueCarDraft?
    @State private var confirmingDelete = false

    private enum Screen: Equatable {
        case makers
        case models(String)
        case detail(String)
    }

    private var canEdit: Bool { !settings.settings.partTimeMode }

    var body: some View {
        Group {
            switch screen {
            case .makers: makers
            case .models(let maker): models(maker)
            case .detail(let id): detail(id)
            }
        }
        .syncing(table)
        .onChange(of: screen) { _, _ in
            form = nil
            confirmingDelete = false
        }
    }

    private var makers: some View {
        TabPage {
            PageHeading(title: "高額車一覧", subtitle: "メーカーをタップすると車種一覧が表示されます。") { addToggle(prefill: "") }
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.mutedForeground)
                TextField("メーカー・車種名・型式・メモで検索", text: $query).appFont(14).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).padding(.vertical, 10).card(radius: 14)
            formSection(editing: nil)
            if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                let results = HighValueCars.search(query, in: table.rows)
                if results.isEmpty {
                    EmptyStateBox(text: "高額車に該当しない車種です。")
                }
                ForEach(results) { car in
                    row(title: [car.maker, car.displayName].filter { !$0.isEmpty }.joined(separator: " "),
                        subtitle: car.model_code.isEmpty ? nil : "型式：\(car.model_code)") { screen = .detail(car.id) }
                }
            } else if table.rows.isEmpty {
                EmptyStateBox(text: table.isLoading ? "読み込み中…" : "まだ登録がありません。")
            } else {
                ForEach(HighValueCars.makers(table.rows), id: \.maker) { group in
                    row(title: group.maker, subtitle: nil, badge: "\(group.count)件") { screen = .models(group.maker) }
                }
            }
        }
    }

    private func models(_ maker: String) -> some View {
        TabPage {
            BackHeader(label: "メーカー一覧に戻る", variant: .icon, onBack: { screen = .makers }) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("高額車一覧").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                    Text(maker).appFont(20, weight: .bold).foregroundStyle(Color.appForeground)
                }
                Spacer()
                addToggle(prefill: maker == HighValueCarRow.unsetMaker ? "" : maker)
            }
            formSection(editing: nil)
            let cars = HighValueCars.models(of: maker, in: table.rows)
            if cars.isEmpty { EmptyStateBox(text: "まだ登録がありません。") }
            ForEach(cars) { car in
                row(title: car.displayName, subtitle: car.model_code.isEmpty ? nil : "型式：\(car.model_code)") { screen = .detail(car.id) }
            }
        }
    }

    @ViewBuilder private func detail(_ id: String) -> some View {
        if let car = table.rows.first(where: { $0.id == id }) {
            TabPage {
                BackHeader(label: "車種一覧に戻る", variant: .icon, onBack: { screen = .models(car.makerGroup) }) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(car.makerGroup).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                        Text(car.displayName).appFont(20, weight: .bold).foregroundStyle(Color.appForeground).lineLimit(1)
                    }
                }
                if canEdit, form != nil {
                    formSection(editing: car)
                } else {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Image(systemName: "car").foregroundStyle(Color.primary)
                                .frame(width: 44, height: 44).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                            Spacer()
                            if canEdit {
                                Button { form = HighValueCarDraft(car) } label: { Image(systemName: "pencil") }.accessibilityLabel("編集")
                                Button { confirmingDelete = true } label: { Image(systemName: "trash") }.accessibilityLabel("削除")
                            }
                        }
                        .buttonStyle(.plain).foregroundStyle(Color.mutedForeground)
                        if canEdit && confirmingDelete {
                            ConfirmDeleteInline(onConfirm: {
                                Task {
                                    try? await HighValueCarRepository.delete(id: car.id)
                                    await table.refresh()
                                    screen = .models(car.makerGroup)
                                }
                            }, onCancel: { confirmingDelete = false })
                        }
                        field("メーカー", car.maker)
                        field("車種名", car.model_name)
                        field("型式", car.model_code)
                        if !car.memo.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("詳細メモ").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                                Text(car.memo).appFont(14).foregroundStyle(Color.appForeground).lineSpacing(4)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14).card(fill: .appBackground)
                        }
                    }
                    .padding(20)
                    .card(radius: Radius.card)
                }
            }
        } else {
            TabPage { EmptyStateBox(text: "この車種は削除されました。") }
        }
    }

    private func field(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground).frame(width: 64, alignment: .leading)
            Text(value.isEmpty ? "未設定" : value).appFont(14).foregroundStyle(Color.appForeground)
        }
    }

    @ViewBuilder private func addToggle(prefill: String) -> some View {
        if canEdit {
            Button {
                form = form == nil ? HighValueCarDraft(maker: prefill) : nil
            } label: {
                Label(form == nil ? "追加" : "閉じる", systemImage: form == nil ? "plus" : "xmark")
            }
            .buttonStyle(PillButtonStyle(kind: .secondary)).fixedSize()
        }
    }

    /// Add form (editing == nil) or edit form for `editing`.
    @ViewBuilder private func formSection(editing car: HighValueCarRow?) -> some View {
        if canEdit, let draft = form, (car == nil) == !isDetail {
            VStack(alignment: .leading, spacing: 12) {
                FormField(label: "メーカー") { BoxedTextField(placeholder: "", text: binding(\.maker, draft)) }
                FormField(label: "車種名") { BoxedTextField(placeholder: "", text: binding(\.modelName, draft)) }
                FormField(label: "型式（車台番号のハイフン手前。外車は空欄可）") { BoxedTextField(placeholder: "", text: binding(\.modelCode, draft)) }
                FormField(label: "詳細メモ") { MemoEditor(placeholder: "", text: binding(\.memo, draft), minLines: 3) }
                FormActions(canSave: draft.canSave, saveLabel: car == nil ? "保存" : "更新", onCancel: { form = nil }) {
                    Task {
                        if let car {
                            try? await HighValueCarRepository.update(id: car.id, draft)
                        } else {
                            try? await HighValueCarRepository.add(draft)
                        }
                        await table.refresh()
                        form = nil
                    }
                }
            }
            .padding(20)
            .card(radius: Radius.card)
        }
    }

    private var isDetail: Bool {
        if case .detail = screen { return true }
        return false
    }

    private func binding(_ keyPath: WritableKeyPath<HighValueCarDraft, String>, _ draft: HighValueCarDraft) -> Binding<String> {
        Binding(get: { form?[keyPath: keyPath] ?? "" }, set: { form?[keyPath: keyPath] = $0 })
    }

    private func row(title: String, subtitle: String?, badge: String? = nil, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "car").foregroundStyle(Color.primary)
                    .frame(width: 40, height: 40).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                    if let subtitle {
                        Text(subtitle).appFont(12).foregroundStyle(Color.mutedForeground).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                if let badge {
                    Text(badge).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                        .padding(.horizontal, 10).padding(.vertical, 4).background(Color.muted, in: Capsule())
                }
                Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
            }
            .padding(.horizontal, 20).padding(.vertical, 16).card()
        }
        .buttonStyle(.plain)
    }
}
