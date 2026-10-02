import KyoeiCore
import SwiftUI

/// マイページ > 点検簿: today's status, a 日常点検を開始 button and the month
/// calendar (〇 点検済 / △ 異常あり / ✕ 出勤日なのに未点検 / － 非出勤日),
/// linked with the 運行履歴 calendar's workdays. Tap a day for its records.
struct InspectionLogView: View {
    @Environment(InspectionStore.self) private var store
    @Environment(SharedData.self) private var data
    @Environment(LeaveStore.self) private var leave
    @State private var overrides = RealtimeTable<AttendanceOverrideRow>(table: "attendance_day_overrides", fetch: AttendanceOverrideRepository.fetch)
    @State private var month = YearMonth(Date())
    @State private var selected: LocalDate?
    @State private var inspecting = false

    var body: some View {
        let today = LocalDate(Date())
        let records = store.records
        let workdays = AttendanceCalendar.resolve(trips: data.trips, overrides: overrides.rows)
        TabPage {
            PageHeading(title: "点検簿", subtitle: "日常点検の記録です。出庫の前に毎日行います。")
            todayCard(today: today)
            VStack(alignment: .leading, spacing: 12) {
                MonthNav(month: $month)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                    ForEach(Array(JapaneseCalendarText.weekdays.enumerated()), id: \.offset) { index, name in
                        Text(name).appFont(12, weight: .semibold).foregroundStyle(weekdayColor(index))
                    }
                    ForEach(Array(month.cells().enumerated()), id: \.offset) { index, cell in
                        if let cell {
                            let mark = InspectionDayMark.resolve(day: cell, records: records, isWorkday: workdays[cell]?.showsMark == true, today: today, onLeave: leave.confirmedDays.contains(cell))
                            dayCell(cell, weekday: index % 7, mark: mark)
                        } else {
                            Color.clear.frame(height: 44)
                        }
                    }
                }
                HStack(spacing: 10) {
                    legend("〇", "点検済", .primary)
                    legend("△", "異常あり", .secondary)
                    legend("✕", "未点検", .destructive)
                    legend("休", "休暇", .secondary)
                    legend("－", "非出勤日", .mutedForeground)
                }
                .appFont(10.4)
            }
            .padding(16)
            .card()
            .monthSwipe($month)
            .onChange(of: month) { _, _ in selected = nil }

            if let selected {
                let dayRecords = records.filter { $0.inspected_on == selected }
                Text("\(selected.month)月\(selected.day)日の点検").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                if dayRecords.isEmpty {
                    EmptyStateBox(text: "この日の点検記録はありません。", verticalPadding: 24)
                } else {
                    ForEach(dayRecords) { InspectionRecordCard(record: $0, pending: isPending($0)) }
                }
            }
        }
        .syncing(overrides)
        .refreshable { await store.refresh() }
        .task { await store.refresh() }
        #if DEBUG
        .onAppear { if DebugShot.sub == "flow" || DebugShot.sub == "step" { inspecting = true } }
        #endif
        .fullScreen(isPresented: $inspecting) {
            InspectionFlowView { record in
                inspecting = false
                if let record { selected = record.inspected_on; month = YearMonth(Date()) }
            }
            .environment(store)
        }
    }

    private func isPending(_ record: InspectionRecord) -> Bool {
        store.pending.contains { $0.record.id == record.id }
    }

    @ViewBuilder private func todayCard(today: LocalDate) -> some View {
        let todays = store.todaysRecords
        let ok = InspectionGate.canDepart(records: todays, today: today)
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: ok ? "checkmark.seal.fill" : (todays.isEmpty ? "exclamationmark.circle.fill" : "xmark.octagon.fill"))
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(ok ? Color.primary : (todays.isEmpty ? Color.secondary : Color.destructive))
                VStack(alignment: .leading, spacing: 2) {
                    Text("今日の日常点検").appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                    Text(ok ? "点検済み・出庫できます" : (todays.isEmpty ? "まだ点検していません" : "出庫できません（再点検が必要）"))
                        .appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                }
                Spacer(minLength: 0)
            }
            Button {
                inspecting = true
            } label: {
                Label(todays.isEmpty ? "日常点検を開始" : "もう一度点検する", systemImage: "checklist")
                    .appFont(16, weight: .black)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(todays.isEmpty ? Color.brandForeground : Color.appForeground)
                    .background(todays.isEmpty ? Color.brand : Color.muted, in: SlantedRectangle(slant: 10))
            }
            .buttonStyle(PressScaleStyle())
            if !store.pending.isEmpty {
                Text("未送信の点検が\(store.pending.count)件あります。電波が戻ると自動で送信します。")
                    .appFont(12).foregroundStyle(Color.secondary)
            }
        }
        .padding(16)
        .card()
    }

    private func dayCell(_ day: LocalDate, weekday: Int, mark: InspectionDayMark?) -> some View {
        let (symbol, color): (String, Color) = switch mark {
        case .done: ("〇", .primary)
        case .issue: ("△", .secondary)
        case .missing: ("✕", .destructive)
        case .off: ("－", .mutedForeground)
        case .leave: ("休", .secondary)
        case nil: ("", .clear)
        }
        return Button { selected = selected == day ? nil : day } label: {
            VStack(spacing: 2) {
                Text("\(day.day)").appFont(12, weight: .medium).foregroundStyle(weekdayColor(weekday))
                Text(symbol.isEmpty ? " " : symbol).appFont(14, weight: .bold).foregroundStyle(color)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(selected == day ? Color.primary.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected == day ? Color.primary : .clear))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(day.month)月\(day.day)日")
    }

    private func legend(_ symbol: String, _ text: String, _ color: Color) -> some View {
        (Text(symbol).foregroundColor(color).bold() + Text(text).foregroundColor(.mutedForeground))
    }

    private func weekdayColor(_ index: Int) -> Color {
        index == 0 ? .destructive : (index == 6 ? .secondary : .appForeground)
    }
}

/// One inspection: vehicles, time, 否 items and the report.
struct InspectionRecordCard: View {
    let record: InspectionRecord
    var pending = false
    @State private var expanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(timeText).appFont(14, weight: .bold).monospacedDigit().foregroundStyle(Color.appForeground)
                Spacer()
                Text(record.has_issue ? "異常あり" : "異常なし")
                    .appFont(12, weight: .bold)
                    .foregroundStyle(record.has_issue ? Color.secondary : Color.primary)
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background((record.has_issue ? Color.secondary : Color.primary).opacity(0.14), in: Capsule())
            }
            Text([record.vehicle_plate, record.chassis_plate].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ／ "))
                .appFont(14, weight: .semibold).monospaced().foregroundStyle(Color.appForeground)
            ForEach(Array(record.issues.enumerated()), id: \.offset) { _, issue in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(issue.section)：\(issue.label)").appFont(12).foregroundStyle(Color.mutedForeground)
                    Text(issue.note).appFont(14, weight: .bold).foregroundStyle(Color.destructive)
                }
            }
            if record.has_issue {
                Text("報告先：\(record.reported_to ?? "")　指示：\(record.instruction?.label ?? "")")
                    .appFont(13, weight: .semibold).foregroundStyle(record.allowsDeparture ? Color.appForeground : Color.destructive)
                if !record.instruction_note.isEmpty {
                    Text(record.instruction_note).appFont(12).foregroundStyle(Color.mutedForeground)
                }
            }
            Button(expanded ? "全項目を閉じる" : "全項目を見る（\(record.results.count)件）") { expanded.toggle() }
                .appFont(13, weight: .semibold).foregroundStyle(Color.primary)
            if expanded {
                ForEach(Array(record.results.enumerated()), id: \.offset) { _, result in
                    HStack(alignment: .top) {
                        Text(result.label).appFont(12).foregroundStyle(Color.appForeground)
                        Spacer(minLength: 8)
                        Text(result.result.label).appFont(12, weight: .bold)
                            .foregroundStyle(result.result == .ng ? Color.destructive : (result.result == .ok ? Color.primary : Color.mutedForeground))
                    }
                }
            }
            if pending {
                Text("未送信（電波が戻ると自動で送信します）").appFont(11).foregroundStyle(Color.secondary)
            }
        }
        .padding(16)
        .card()
    }

    private var timeText: String {
        guard let date = record.completedAt else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "H:mm 完了"
        return formatter.string(from: date)
    }
}
