import KyoeiCore
import Supabase
import SwiftUI

enum LolRepository {
    static func fetch() async throws -> [LolEntryRow] {
        try await Backend.client.from("lol_entries").select(LolEntryRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func add(destinationID: String, _ draft: LolEntryDraft) async throws {
        try await Backend.client.from("lol_entries").insert(LolEntryPayload(destinationID: destinationID, draft: draft)).execute()
    }

    static func update(id: String, destinationID: String, _ draft: LolEntryDraft) async throws {
        try await Backend.client.from("lol_entries").update(LolEntryPayload(destinationID: destinationID, draft: draft)).eq("id", value: id).execute()
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("lol_entries").delete().eq("id", value: id).execute()
    }

    static func setVisitors(id: String, _ visitors: [VisitedPerson]) async throws {
        struct Update: Encodable { var visited_by: [VisitedPerson] }
        try await Backend.client.from("lol_entries").update(Update(visited_by: visitors)).eq("id", value: id).execute()
    }
}

/// Tap-to-call button for a freely typed phone number.
struct CallButton: View {
    let phone: String

    var body: some View {
        if let url = telURL(phone) {
            Link(destination: url) {
                Image(systemName: "phone.fill").foregroundStyle(Color.primaryForeground)
                    .frame(width: 36, height: 36).background(Color.primary, in: Circle())
            }
            .accessibilityLabel("\(phone)に電話する")
        }
    }
}

/// List of Location: destinations → their stores, with full-text search,
/// AA's weekly calendar, 荷扱車格可否 and 既訪者. Port of components/lol-view.tsx.
struct LolView: View {
    var initialDestinationID: String?

    @State private var table = RealtimeTable<LolEntryRow>(table: "lol_entries", fetch: LolRepository.fetch)
    @State private var destinationID: String?
    @State private var focusedEntryID: String?
    @State private var query = ""
    @State private var form: LolEntryDraft?
    @State private var editingID: String?
    @State private var confirmDeleteID: String?
    @State private var editingVisitorsID: String?
    @State private var visitorDraft = ""
    @State private var didApplyInitial = false

    var body: some View {
        Group {
            if let destination = LolDestination.all.first(where: { $0.id == destinationID }) {
                detail(destination)
            } else {
                picker
            }
        }
        .syncing(table)
        .onAppear {
            guard !didApplyInitial else { return }
            didApplyInitial = true
            destinationID = initialDestinationID
        }
    }

    private var picker: some View {
        let byDestination = ListOfLocation.entriesByDestination(table.rows)
        return TabPage {
            PageHeading(title: "配達先", subtitle: "配達先を選ぶと登録した情報を確認できます。")
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.mutedForeground)
                TextField("店舗名・住所・電話番号などで検索", text: $query).appFont(14).autocorrectionDisabled()
            }
            .padding(.horizontal, 12).padding(.vertical, 10).card(radius: 14)
            if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                let results = ListOfLocation.search(query, rows: table.rows)
                if results.isEmpty {
                    EmptyStateBox(text: "「\(query)」に一致する配達先はありません。", verticalPadding: 32)
                }
                ForEach(results, id: \.entry.id) { result in
                    navRow(title: result.entry.displayName,
                           subtitle: result.destination.name + (result.entry[.address].isEmpty ? "" : " ・ \(result.entry[.address])")) {
                        open(result.destination.id, entry: result.entry.id)
                    }
                }
            } else {
                ForEach(LolDestination.all) { destination in
                    let count = byDestination[destination.id]?.count ?? 0
                    navRow(title: destination.name, subtitle: destination.category + (count > 0 ? " ・ \(count)件" : "")) {
                        open(destination.id, entry: nil)
                    }
                }
            }
        }
    }

    private func detail(_ destination: LolDestination) -> some View {
        let all = ListOfLocation.entriesByDestination(table.rows)[destination.id] ?? []
        let focused = all.first { $0.id == focusedEntryID }
        return TabPage {
            BackHeader(label: "一覧へ戻る", variant: .subtle, onBack: { destinationID = nil }) {
                Spacer()
                Button {
                    if form == nil {
                        editingID = nil
                        form = LolEntryDraft()
                    } else {
                        form = nil
                    }
                } label: { Label(form == nil ? "情報を追加" : "閉じる", systemImage: form == nil ? "plus" : "xmark") }
                    .buttonStyle(PillButtonStyle(kind: .secondary)).fixedSize()
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(destination.category).appFont(12, weight: .semibold).foregroundStyle(Color.primary)
                Text(destination.name).appFont(24, weight: .bold).foregroundStyle(Color.appForeground)
                if focused != nil {
                    Button("\(destination.name)の登録情報をすべて表示（\(all.count)件）") { focusedEntryID = nil }
                        .appFont(12, weight: .semibold)
                }
            }
            if form != nil {
                LolEntryForm(draft: Binding(get: { form ?? LolEntryDraft() }, set: { form = $0 }),
                             isAA: destination.isAA, isEditing: editingID != nil) {
                    guard let draft = form else { return }
                    Task {
                        if let editingID {
                            try? await LolRepository.update(id: editingID, destinationID: destination.id, draft)
                        } else {
                            try? await LolRepository.add(destinationID: destination.id, draft)
                        }
                        await table.refresh()
                        form = nil
                        editingID = nil
                    }
                }
            }
            if all.isEmpty {
                EmptyStateBox(text: "まだ情報がありません。\n右上の「情報を追加」から登録できます。")
            } else if let focused {
                entryCard(focused, destination: destination)
            } else {
                ForEach(all) { entry in
                    navRow(title: entry.displayName, subtitle: nil) { focusedEntryID = entry.id }
                }
            }
        }
    }

    private func entryCard(_ entry: LolEntryRow, destination: LolDestination) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Text(entry.displayName).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                Spacer()
                Button {
                    editingID = entry.id
                    form = LolEntryDraft(entry)
                } label: { Image(systemName: "pencil") }.accessibilityLabel("編集")
                Button { confirmDeleteID = entry.id } label: { Image(systemName: "trash") }.accessibilityLabel("削除")
            }
            .buttonStyle(.plain)
            .foregroundStyle(Color.mutedForeground)
            if confirmDeleteID == entry.id {
                ConfirmDeleteInline(onConfirm: {
                    Task {
                        try? await LolRepository.delete(id: entry.id)
                        confirmDeleteID = nil
                        focusedEntryID = nil
                        await table.refresh()
                    }
                }, onCancel: { confirmDeleteID = nil })
            }
            ForEach(LolField.fields(isAA: destination.isAA).filter { $0 != .shopName && !entry[$0].isEmpty }, id: \.self) { field in
                infoRow(field.label(isAA: destination.isAA)) {
                    if field == .phone, let url = telURL(entry[.phone]) {
                        Link(entry[.phone], destination: url)
                    } else {
                        Text(entry[field])
                    }
                }
            }
            if destination.isAA && entry.hasCalendar {
                Text("週間カレンダー").appFont(14).foregroundStyle(Color.mutedForeground)
                WeeklyCalendarTable(out: entry.calOut, inn: entry.calIn)
            }
            if !destination.isAA && entry.vehiclePermission.isSet {
                infoRow("荷扱車格") { VehiclePermissionGrid(permission: entry.vehiclePermission) }
            }
            if !destination.isAA { visitorsSection(entry) }
        }
        .padding(20)
        .card(radius: Radius.card)
    }

    private func infoRow<Value: View>(_ label: String, @ViewBuilder value: () -> Value) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label).foregroundStyle(Color.mutedForeground).frame(width: 104, alignment: .leading)
            value().foregroundStyle(Color.appForeground).frame(maxWidth: .infinity, alignment: .leading)
        }
        .appFont(14)
    }

    private func visitorsSection(_ entry: LolEntryRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Divider()
            HStack {
                Text("既訪者").appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                Spacer()
                Button {
                    editingVisitorsID = editingVisitorsID == entry.id ? nil : entry.id
                    visitorDraft = ""
                } label: { Label(editingVisitorsID == entry.id ? "閉じる" : "編集", systemImage: "pencil").appFont(12) }
                    .buttonStyle(.plain).foregroundStyle(Color.mutedForeground)
            }
            let editing = editingVisitorsID == entry.id
            if entry.visitedBy.isEmpty && !editing {
                Text("登録なし").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            VisitorChips(visitors: entry.visitedBy, onRemove: editing ? { person in
                let next = entry.visitedBy.filter { $0.id != person.id }
                Task {
                    try? await LolRepository.setVisitors(id: entry.id, next)
                    await table.refresh()
                }
            } : nil)
            if editing {
                HStack(spacing: 6) {
                    BoxedTextField(placeholder: "訪問した人の名前", text: $visitorDraft).onSubmit { addVisitor(to: entry) }
                    Button("追加") { addVisitor(to: entry) }.buttonStyle(PillButtonStyle()).fixedSize()
                }
            }
        }
    }

    private func addVisitor(to entry: LolEntryRow) {
        var draft = LolEntryDraft(entry)
        draft.addVisitor(visitorDraft)
        guard draft.visitedBy.count > entry.visitedBy.count else { return }
        visitorDraft = ""
        Task {
            try? await LolRepository.setVisitors(id: entry.id, draft.visitedBy)
            await table.refresh()
        }
    }

    private func open(_ destination: String, entry: String?) {
        destinationID = destination
        focusedEntryID = entry
        form = nil
        editingID = nil
        confirmDeleteID = nil
        editingVisitorsID = nil
    }

    private func navRow(title: String, subtitle: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "mappin").foregroundStyle(Color.primary)
                    .frame(width: 40, height: 40).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(1)
                    if let subtitle {
                        Text(subtitle).appFont(12).foregroundStyle(Color.mutedForeground).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
            }
            .padding(.horizontal, 20).padding(.vertical, 16).card()
        }
        .buttonStyle(.plain)
    }
}

/// Name chips, up to four per row.
private struct VisitorChips: View {
    let visitors: [VisitedPerson]
    var onRemove: ((VisitedPerson) -> Void)?

    var body: some View {
        if !visitors.isEmpty {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6, alignment: .leading), count: 4), alignment: .leading, spacing: 6) {
                ForEach(visitors) { person in
                    HStack(spacing: 4) {
                        Text(person.name).appFont(14).foregroundStyle(Color.appForeground).lineLimit(1)
                        if let onRemove {
                            Button { onRemove(person) } label: { Image(systemName: "xmark").font(.system(size: 10)) }
                                .buttonStyle(.plain).foregroundStyle(Color.mutedForeground)
                                .accessibilityLabel("\(person.name)を削除")
                        }
                    }
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.border))
                }
            }
        }
    }
}

private struct VehiclePermissionGrid: View {
    let permission: VehiclePermission

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading), GridItem(.flexible(), alignment: .leading)], alignment: .leading, spacing: 8) {
            ForEach(VehicleKind.allCases.filter { permission[$0].status != .unset }, id: \.self) { kind in
                let entry = permission[kind]
                VStack(alignment: .leading, spacing: 0) {
                    Text(kind.label).appFont(12).foregroundStyle(Color.mutedForeground)
                    Text(entry.displayStatus).appFont(14, weight: .medium).foregroundStyle(Color.appForeground)
                    if entry.status == .conditional && !entry.condition.isEmpty {
                        Text(entry.condition).appFont(12, weight: .bold).foregroundStyle(Color.destructive)
                    }
                }
            }
        }
    }
}

/// AA's 搬出/搬入 weekly table.
private struct WeeklyCalendarTable: View {
    let out: [String]
    let inn: [String]

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
            GridRow {
                header("曜日").frame(width: 48)
                header("搬出")
                header("搬入")
            }
            ForEach(0..<7, id: \.self) { day in
                GridRow {
                    Text(JapaneseCalendarText.weekdays[day]).appFont(14, weight: .semibold)
                        .foregroundStyle(weekdayColor(day)).frame(width: 48).padding(.vertical, 8)
                    Text(TimeRangeValue.cellText(out[safe: day] ?? "")).appFont(14).padding(8)
                    Text(TimeRangeValue.cellText(inn[safe: day] ?? "")).appFont(14).padding(8)
                }
                .foregroundStyle(Color.appForeground)
                Divider().gridCellUnsizedAxes(.horizontal)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.border))
    }

    private func header(_ text: String) -> some View {
        Text(text).appFont(14, weight: .medium).foregroundStyle(Color.mutedForeground)
            .frame(maxWidth: .infinity, alignment: .leading).padding(8).background(Color.muted)
    }
}

/// The add/edit form, including AA's calendar or the 車格/既訪者 extras.
private struct LolEntryForm: View {
    @Binding var draft: LolEntryDraft
    let isAA: Bool
    let isEditing: Bool
    let onSave: () -> Void

    @State private var visitorName = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !isAA {
                Text("鍵番号や鍵のセット場所は記載禁止\n盗難に繋がる恐れのある情報は記載しないでください。")
                    .appFont(14, weight: .bold).foregroundStyle(Color.destructive)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .background(Color.destructive.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.destructive.opacity(0.4)))
            }
            ForEach(LolField.fields(isAA: isAA), id: \.self) { field in
                FormField(label: field.label(isAA: isAA) + (field == .shopName ? " *" : "")) { input(for: field) }
                if isAA && field == .eventDay {
                    FormField(label: "週間カレンダー（24時間OK または 時間を選択）") {
                        ForEach(0..<7, id: \.self) { day in
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(JapaneseCalendarText.weekdays[day])曜日").appFont(14, weight: .semibold).foregroundStyle(weekdayColor(day))
                                TimeRangePicker(label: "搬出", value: $draft.calOut[day], special: "〇", specialLabel: "24時間OK",
                                                rangeLabel: "時間指定", options: TimeRangeValue.hourlyOptions)
                                TimeRangePicker(label: "搬入", value: $draft.calIn[day], special: "〇", specialLabel: "24時間OK",
                                                rangeLabel: "時間指定", options: TimeRangeValue.hourlyOptions)
                            }
                            .padding(10).card(radius: 12, fill: .appBackground)
                        }
                    }
                }
                if !isAA && field == .phone {
                    FormField(label: "荷扱車格可否") { permissionEditor }
                }
                if !isAA && field == .notes {
                    FormField(label: "既訪者") {
                        VisitorChips(visitors: draft.visitedBy) { person in draft.visitedBy.removeAll { $0.id == person.id } }
                        HStack(spacing: 6) {
                            BoxedTextField(placeholder: "訪問した人の名前", text: $visitorName).onSubmit(addVisitor)
                            Button("追加", action: addVisitor).buttonStyle(PillButtonStyle()).fixedSize()
                        }
                    }
                }
            }
            Button(isEditing ? "更新" : "保存", action: onSave)
                .buttonStyle(PillButtonStyle(kind: .secondary))
                .disabled(!draft.canSave).opacity(draft.canSave ? 1 : 0.4)
        }
        .padding(20)
        .card(radius: Radius.card)
    }

    @ViewBuilder private func input(for field: LolField) -> some View {
        if isAA && field == .eventDay {
            Picker(field.label(isAA: true), selection: $draft[field]) {
                Text("未設定").tag("")
                ForEach(JapaneseCalendarText.weekdays, id: \.self) { Text("\($0)曜日").tag("\($0)曜日") }
            }
            .pickerStyle(.menu)
        } else if !isAA && field == .hours {
            TimeRangePicker(label: nil, value: $draft[field], special: "夜間OK", specialLabel: "夜間OK",
                            rangeLabel: "時間指定（30分刻み）", options: TimeRangeValue.halfHourOptions)
        } else if !isAA && field == .breakTime {
            TimeRangePicker(label: nil, value: $draft[field], special: "なし", specialLabel: "なし",
                            rangeLabel: "時間指定（30分刻み）", options: TimeRangeValue.halfHourOptions)
        } else if field.isMultiline {
            MemoEditor(placeholder: "", text: $draft[field], minLines: 3)
        } else if field == .phone {
            HStack(spacing: 8) {
                BoxedTextField(placeholder: "", text: $draft[field])
                CallButton(phone: draft[field])
            }
        } else {
            BoxedTextField(placeholder: "", text: $draft[field])
        }
    }

    private var permissionEditor: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(VehicleKind.allCases, id: \.self) { kind in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(kind.label).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground).frame(width: 64, alignment: .leading)
                        Picker(kind.label, selection: $draft.vehiclePermission[kind].status) {
                            ForEach(VehicleStatus.allCases, id: \.self) { Text($0.pickerLabel).tag($0) }
                        }
                        .pickerStyle(.menu)
                    }
                    if draft.vehiclePermission[kind].status == .conditional {
                        BoxedTextField(placeholder: "条件を入力（例：荷降ろし場所指定など）", text: $draft.vehiclePermission[kind].condition)
                    }
                }
            }
        }
        .padding(12)
        .card(fill: .appBackground)
    }

    private func addVisitor() {
        draft.addVisitor(visitorName)
        visitorName = ""
    }
}

/// 未設定 / special word / time range, with start and end pickers.
private struct TimeRangePicker: View {
    let label: String?
    @Binding var value: String
    let special: String
    let specialLabel: String
    let rangeLabel: String
    let options: [String]

    private enum Mode: Hashable { case unset, special, range }

    var body: some View {
        let parsed = TimeRangeValue(value, special: special)
        let mode: Mode = switch parsed {
        case .unset: .unset
        case .special: .special
        case .range: .range
        }
        HStack(spacing: 6) {
            if let label {
                Text(label).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground).frame(width: 32, alignment: .leading)
            }
            Picker(label ?? "", selection: Binding(get: { mode }, set: { newMode in
                switch newMode {
                case .unset: value = ""
                case .special: value = special
                case .range:
                    if case .range = parsed { return }
                    value = TimeRangeValue.range(start: "", end: "").encoded(special: special)
                }
            })) {
                Text("未設定").tag(Mode.unset)
                Text(specialLabel).tag(Mode.special)
                Text(rangeLabel).tag(Mode.range)
            }
            .pickerStyle(.menu)
            if case .range(let start, let end) = parsed {
                timePicker(rangeBinding(start: start, end: end, editingStart: true))
                Text("〜").appFont(12).foregroundStyle(Color.mutedForeground)
                timePicker(rangeBinding(start: start, end: end, editingStart: false))
            }
        }
    }

    /// One end of the range, writing the re-encoded value back through `$value`.
    private func rangeBinding(start: String, end: String, editingStart: Bool) -> Binding<String> {
        let target = $value
        let special = special
        return Binding(
            get: { editingStart ? start : end },
            set: { new in
                target.wrappedValue = TimeRangeValue.range(start: editingStart ? new : start, end: editingStart ? end : new).encoded(special: special)
            }
        )
    }

    private func timePicker(_ selection: Binding<String>) -> some View {
        Picker("", selection: selection) {
            Text("（空白）").tag("")
            ForEach(options, id: \.self) { Text($0).tag($0) }
        }
        .pickerStyle(.menu)
    }
}
