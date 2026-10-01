import KyoeiCore
import Supabase
import SwiftUI

/// 無事故カレンダー: streak, the month's goal, daily accident counts (月間) or
/// month/category totals (年間). 編集 (PIN 2486, hidden for part-time staff)
/// records accidents and edits past ones. Shared via accident_records. Ports
/// of accident-calendar-view.tsx and accident-yearly-view.tsx.
struct AccidentCalendarView: View {
    @Environment(SettingsStore.self) private var settings
    @Environment(SharedData.self) private var data
    @State private var categories = RealtimeTable<AccidentCategoryRow>(table: "accident_categories", select: AccidentCategoryRow.selectColumns, orderBy: "sort_order")
    @State private var gate = PinGate(code: "2486")
    @State private var period: Period = .month
    @State private var month = YearMonth(Date())
    @State private var selectedDay: LocalDate?
    @State private var editing = false
    @State private var draft = AccidentDraft(occurredOn: LocalDate(Date()))
    @State private var saving = false
    @State private var showsHistory = false

    private enum Period { case month, year }

    private var rows: [AccidentRecordRow] { data.accidentRows.rows }

    var body: some View {
        TabPage {
            PageHeading(title: "無事故カレンダー", subtitle: "目指せ無事故！") {
                Picker("期間", selection: $period) {
                    Text("月間").tag(Period.month)
                    Text("年間").tag(Period.year)
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            AccidentStreakBadge(large: true).padding(20).card()

            switch period {
            case .year:
                AccidentYearlyView(rows: rows, categories: categories.rows)
            case .month:
                MonthlyGoalCard(goalID: settings.settings.appMode == .timecard ? "timecard" : "current", month: month)
                monthCalendar
                if let selectedDay {
                    detailList(title: "\(selectedDay.iso) の事故詳細", rows: AccidentStats.rows(rows, on: selectedDay))
                }
            }

            if !settings.settings.partTimeMode {
                EditToggleButton(editing: editing, label: "編集") {
                    if editing {
                        editing = false
                        showsHistory = false
                    } else {
                        gate.guarded {
                            draft = AccidentDraft(occurredOn: LocalDate(Date()))
                            showsHistory = false
                            editing = true
                        }
                    }
                }
                .frame(maxWidth: .infinity)
            }
            if editing {
                newRecordForm
                Button("過去の詳細を編集") { showsHistory.toggle() }
                    .buttonStyle(PillButtonStyle(kind: .outline))
                if showsHistory {
                    AccidentHistoryEditor(rows: rows, categories: categories) { await data.accidentRows.refresh() }
                }
            }
        }
        .syncing(categories)
        .pinGate(gate)
    }

    private var monthCalendar: some View {
        let counts = AccidentStats.countsByDate(rows)
        return VStack(spacing: 12) {
            MonthNav(month: $month)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(Array(JapaneseCalendarText.weekdays.enumerated()), id: \.offset) { index, name in
                    Text(name).appFont(12, weight: .semibold).foregroundStyle(weekdayColor(index))
                }
                ForEach(Array(month.cells().enumerated()), id: \.offset) { index, cell in
                    if let cell {
                        let count = counts[cell] ?? 0
                        Button { selectedDay = selectedDay == cell ? nil : cell } label: {
                            VStack(spacing: 2) {
                                Text("\(cell.day)").appFont(12, weight: .medium).foregroundStyle(weekdayColor(index % 7))
                                Text("\(count)").appFont(14, weight: .bold).foregroundStyle(count > 0 ? Color.destructive : Color.mutedForeground.opacity(0.4))
                            }
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(selectedDay == cell ? Color.primary.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(selectedDay == cell ? Color.primary : .clear))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(cell.month)月\(cell.day)日 事故\(count)件")
                    } else {
                        Color.clear.frame(height: 48)
                    }
                }
            }
        }
        .padding(16)
        .card()
        .monthSwipe($month)
        .onChange(of: month) { _, _ in selectedDay = nil }
    }

    private var newRecordForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("事故を記録").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            AccidentFields(draft: $draft, categories: categories)
            Text("車格または事故内容のいずれかを入力してください。").appFont(12).foregroundStyle(Color.mutedForeground)
            Button(saving ? "保存中…" : "保存") {
                saving = true
                Task {
                    defer { saving = false }
                    do {
                        try await AccidentRepository.add(draft)
                        draft = AccidentDraft(occurredOn: LocalDate(Date()))
                        await data.accidentRows.refresh()
                    } catch {}
                }
            }
            .buttonStyle(PillButtonStyle())
            .disabled(!draft.canSaveNew || saving)
            .opacity(draft.canSaveNew && !saving ? 1 : 0.4)
        }
        .padding(20)
        .card()
    }

    private func detailList(title: String, rows: [AccidentRecordRow]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            if rows.isEmpty {
                Text("事故はありません。").appFont(14).foregroundStyle(Color.mutedForeground)
            }
            ForEach(rows) { AccidentSummary(row: $0) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .card()
    }
}

func weekdayColor(_ index: Int) -> Color {
    index == 0 ? .destructive : (index == 6 ? .secondary : .appForeground)
}

/// One accident: category chip, 車格, location and description.
struct AccidentSummary: View {
    let row: AccidentRecordRow
    var showsDate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                if showsDate {
                    Text(row.occurred_on).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                    Spacer()
                }
                if !row.category.isEmpty {
                    Text(row.category).appFont(12, weight: .semibold).foregroundStyle(Color.appForeground)
                        .padding(.horizontal, 8).padding(.vertical, 2).background(Color.accent, in: Capsule())
                }
                if !row.vehicle_class.isEmpty {
                    Text(row.vehicle_class).appFont(12, weight: .semibold).foregroundStyle(Color.primary)
                }
            }
            if !row.location.isEmpty {
                Text("発生場所：\(row.location)").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            Text(row.description.isEmpty ? "詳細なし" : row.description).appFont(14).foregroundStyle(Color.appForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .card(radius: 12, fill: .appBackground)
    }
}

/// The viewed month's goal from weekly_goal_history.
private struct MonthlyGoalCard: View {
    let goalID: String
    let month: YearMonth

    @State private var title: RealtimeTable<WeeklyGoalRow>
    @State private var history: RealtimeTable<GoalHistoryRow>

    init(goalID: String, month: YearMonth) {
        self.goalID = goalID
        self.month = month
        _title = State(initialValue: RealtimeTable(table: "weekly_goal") { try await WeeklyGoalRepository.fetch(goalID: goalID) })
        _history = State(initialValue: RealtimeTable(table: "weekly_goal_history") {
            try await Backend.client.from("weekly_goal_history").select("goal_id, month, content").eq("goal_id", value: goalID).execute().value
        })
    }

    var body: some View {
        let content = history.rows.first { $0.month == month.key }?.content ?? ""
        VStack(alignment: .leading, spacing: 4) {
            Label(title.rows.first?.title ?? "今月の目標", systemImage: "target").appFont(14, weight: .bold).foregroundStyle(Color.primary)
            Text(content.isEmpty ? "目標未設定" : content).appFont(14, weight: .medium).foregroundStyle(Color.appForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .card()
        .syncing(title)
        .syncing(history)
    }
}

/// Shared add/edit fields.
struct AccidentFields: View {
    @Binding var draft: AccidentDraft
    let categories: RealtimeTable<AccidentCategoryRow>

    var body: some View {
        FormField(label: "発生日") {
            DatePicker("発生日", selection: Binding(
                get: { draft.occurredOn.startDate() },
                set: { draft.occurredOn = LocalDate($0) }
            ), displayedComponents: .date)
            .labelsHidden()
        }
        FormField(label: "カテゴリー") { AccidentCategoryPicker(selection: $draft.category, categories: categories) }
        FormField(label: "車格") { BoxedTextField(placeholder: "例：中型", text: $draft.vehicleClass) }
        FormField(label: "事故発生場所") { BoxedTextField(placeholder: "例：東京都渋谷区付近", text: $draft.location) }
        FormField(label: "事故内容") { MemoEditor(placeholder: "事故の内容を入力", text: $draft.description, minLines: 3) }
    }
}

/// Category picker with in-place 「＋ 新しいカテゴリーを追加」.
private struct AccidentCategoryPicker: View {
    @Binding var selection: String
    let categories: RealtimeTable<AccidentCategoryRow>

    @State private var adding = false
    @State private var newName = ""
    @State private var saving = false

    var body: some View {
        if adding {
            HStack(spacing: 8) {
                BoxedTextField(placeholder: "新しいカテゴリー名", text: $newName).onSubmit(create)
                Button("追加", action: create).buttonStyle(PillButtonStyle()).fixedSize()
                    .disabled(newName.trimmingCharacters(in: .whitespaces).isEmpty || saving)
                Button("取消") { adding = false; newName = "" }.buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
            }
        } else {
            Menu {
                Button(AccidentStats.uncategorized) { selection = "" }
                ForEach(categories.rows.sorted { $0.sort_order < $1.sort_order }) { category in
                    Button(category.name) { selection = category.name }
                }
                Divider()
                Button("＋ 新しいカテゴリーを追加") { adding = true }
            } label: {
                HStack {
                    Text(selection.isEmpty ? AccidentStats.uncategorized : selection).appFont(14).foregroundStyle(Color.appForeground)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").foregroundStyle(Color.mutedForeground)
                }
                .padding(.horizontal, 14).padding(.vertical, 10).card(radius: 14, fill: .appBackground)
            }
        }
    }

    private func create() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !saving else { return }
        saving = true
        Task {
            defer { saving = false }
            // A duplicate name (unique violation) just selects the existing one.
            try? await AccidentRepository.addCategory(name: name, sortOrder: AccidentStats.nextCategoryOrder(categories.rows))
            await categories.refresh()
            selection = name
            newName = ""
            adding = false
        }
    }
}

/// 過去の詳細を編集: a month's records, each editable or deletable.
private struct AccidentHistoryEditor: View {
    let rows: [AccidentRecordRow]
    let categories: RealtimeTable<AccidentCategoryRow>
    let onChanged: () async -> Void

    @State private var month = YearMonth(Date())
    @State private var editingID: String?
    @State private var draft = AccidentDraft(occurredOn: LocalDate(Date()))

    var body: some View {
        let monthRows = AccidentStats.rows(rows, in: month)
        VStack(alignment: .leading, spacing: 10) {
            MonthNav(month: $month)
            if monthRows.isEmpty {
                Text("この月の記録はありません。").appFont(14).foregroundStyle(Color.mutedForeground).frame(maxWidth: .infinity).padding(.vertical, 16)
            }
            ForEach(monthRows) { row in
                if editingID == row.id {
                    VStack(alignment: .leading, spacing: 10) {
                        AccidentFields(draft: $draft, categories: categories)
                        FormActions(onDelete: {
                            Task {
                                try? await AccidentRepository.delete(id: row.id)
                                editingID = nil
                                await onChanged()
                            }
                        }, onCancel: { editingID = nil }) {
                            let saved = draft
                            Task {
                                try? await AccidentRepository.update(id: row.id, saved)
                                editingID = nil
                                await onChanged()
                            }
                        }
                    }
                    .padding(12)
                    .card(radius: 12, border: Color.primary.opacity(0.4), fill: .appBackground)
                } else {
                    Button {
                        draft = AccidentDraft(row: row, fallbackDate: LocalDate(Date()))
                        editingID = row.id
                    } label: { AccidentSummary(row: row, showsDate: true) }
                        .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .card()
        .monthSwipe($month)
    }
}

/// 年間: per-month and per-category totals with drill-down. Port of
/// components/accident-yearly-view.tsx.
private struct AccidentYearlyView: View {
    let rows: [AccidentRecordRow]
    let categories: [AccidentCategoryRow]

    @State private var year = Calendar.current.component(.year, from: Date())
    @State private var selection: AccidentStats.YearSelection?

    var body: some View {
        let byMonth = AccidentStats.countsByMonth(rows, year: year)
        let byCategory = AccidentStats.countsByCategory(rows, year: year)
        let total = AccidentStats.rows(rows, inYear: year).count
        VStack(alignment: .leading, spacing: 16) {
            VStack(spacing: 12) {
                HStack {
                    yearButton("chevron.left", "前の年") { year -= 1 }
                    Spacer()
                    VStack(spacing: 4) {
                        Text("\(String(year))年（\(eraLabel(year))）").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                        (Text("年間事故件数：") + Text("\(total)").foregroundColor(total > 0 ? .destructive : .mutedForeground).bold() + Text("件"))
                            .appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                    }
                    Spacer()
                    yearButton("chevron.right", "次の年") { year += 1 }
                }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 6), spacing: 6) {
                    ForEach(1...12, id: \.self) { m in
                        let count = byMonth[m] ?? 0
                        let selected = selection == .month(m)
                        Button { selection = selected ? nil : .month(m) } label: {
                            VStack(spacing: 2) {
                                Text("\(m)月").appFont(12, weight: .medium).foregroundStyle(Color.appForeground)
                                Text("\(count)").appFont(16, weight: .bold).foregroundStyle(count > 0 ? Color.destructive : Color.mutedForeground.opacity(0.4))
                            }
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(selected ? Color.primary.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Color.primary : .clear))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
            .card()
            .simultaneousGesture(DragGesture(minimumDistance: 30).onEnded { value in
                if value.translation.width > 50 { year -= 1 } else if value.translation.width < -50 { year += 1 }
            })

            VStack(alignment: .leading, spacing: 8) {
                Text("カテゴリー別件数").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
                let names = AccidentStats.categoryNames(categories, counts: byCategory)
                if names.isEmpty {
                    Text("カテゴリーがありません。").appFont(14).foregroundStyle(Color.mutedForeground)
                }
                ForEach(names, id: \.self) { name in
                    let count = byCategory[name] ?? 0
                    let selected = selection == .category(name)
                    Button { selection = selected ? nil : .category(name) } label: {
                        HStack {
                            Text(name).appFont(14).foregroundStyle(Color.appForeground)
                            Spacer()
                            Text("\(count)件").appFont(14, weight: .bold).foregroundStyle(count > 0 ? Color.destructive : Color.mutedForeground.opacity(0.4))
                        }
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(selected ? Color.primary.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? Color.primary : .clear))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
            .card()

            if let selection {
                let selectedRows = AccidentStats.rows(rows, year: year, selection: selection)
                VStack(alignment: .leading, spacing: 8) {
                    Text({
                        switch selection {
                        case .month(let m): "\(String(year))年\(m)月の事故詳細"
                        case .category(let name): "\(name) の事故詳細（\(String(year))年）"
                        }
                    }()).appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
                    if selectedRows.isEmpty {
                        Text("事故はありません。").appFont(14).foregroundStyle(Color.mutedForeground)
                    }
                    ForEach(selectedRows) { AccidentSummary(row: $0, showsDate: true) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
                .card()
            }
        }
        .onChange(of: year) { _, _ in selection = nil }
    }

    private func yearButton(_ systemName: String, _ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName).font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.mutedForeground)
                .frame(width: 32, height: 32).overlay(Circle().stroke(Color.border))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
