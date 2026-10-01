import KyoeiCore
import SwiftUI

/// 運行履歴: this device's past trips (全表示) or a workday calendar
/// (カレンダー). On a trip card: tap shows memos, double-tap edits them, and
/// the 隠しコマンド (5 taps + PIN) edits 出庫/帰庫 times or deletes the trip.
/// Port of components/trip-history-view.tsx.
struct TripHistoryView: View {
    private static let editUnlockCode = "1357951"

    @Environment(SharedData.self) private var data
    @State private var overrides = RealtimeTable<AttendanceOverrideRow>(table: "attendance_day_overrides", fetch: AttendanceOverrideRepository.fetch)
    @State private var notes = RealtimeTable<RestDayNoteRow>(table: "trip_rest_day_notes", fetch: TripHistoryRepository.fetchRestDayNotes)
    @State private var gate = PinGate(code: TripHistoryView.editUnlockCode)
    @State private var mode: Mode = .list

    private enum Mode { case list, calendar }

    var body: some View {
        TabPage {
            PageHeading(title: "運行履歴", subtitle: "過去の出庫・帰庫と休息時間を確認できます。") {
                Picker("表示", selection: $mode) {
                    Label("全表示", systemImage: "list.bullet").tag(Mode.list)
                    Label("カレンダー", systemImage: "calendar").tag(Mode.calendar)
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            switch mode {
            case .calendar:
                AttendanceCalendarView(trips: data.trips, overrides: overrides)
                LegalCheckCard(trips: data.trips, now: Date())
            case .list:
                list
            }
        }
        .syncing(overrides)
        .syncing(notes)
        .pinGate(gate)
    }

    @ViewBuilder private var list: some View {
        if data.deviceTrips.isLoading {
            Text("読み込み中…").appFont(14).foregroundStyle(Color.mutedForeground).frame(maxWidth: .infinity).padding(.vertical, 32)
        } else if data.trips.isEmpty {
            Text("まだ運行履歴がありません。").appFont(14).foregroundStyle(Color.mutedForeground).frame(maxWidth: .infinity).padding(.vertical, 32)
        } else {
            let memoByTrip = Dictionary(notes.rows.map { ($0.trip_id, $0.memo) }, uniquingKeysWith: { first, _ in first })
            ForEach(TripHistoryTimeline.items(data.trips)) { item in
                if case .restDay(let gap, let regular) = item.restBefore {
                    RestDayCard(gap: gap, isRegularHoliday: regular, memo: memoByTrip[item.trip.id] ?? "") { memo in
                        try? await TripHistoryRepository.setRestDayNote(tripID: item.trip.id, memo: memo)
                        await notes.refresh()
                    }
                }
                TripCard(
                    trip: item.trip,
                    restBefore: { if case .rest(let gap) = item.restBefore { return gap } else { return nil } }(),
                    dayShift: AttendanceCalendar.dayShift(for: item.trip, overrides: overrides.rows),
                    gate: gate,
                    onChanged: { await data.deviceTrips.refresh() }
                )
            }
        }
    }
}

private struct RestDayCard: View {
    let gap: TimeInterval
    let isRegularHoliday: Bool
    let memo: String
    let onSave: (String) async -> Void

    @State private var editing = false
    @State private var draft = ""
    @State private var saving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("休日（\(DurationFormat.hoursMinutes(gap))）", systemImage: "moon")
                .appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
            if isRegularHoliday {
                Text("通常休日").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            } else if editing {
                BoxedTextField(placeholder: "例：点検、車検", text: $draft)
                FormActions(canSave: !saving, saveLabel: saving ? "保存中…" : "保存", onCancel: { editing = false }) {
                    saving = true
                    Task {
                        await onSave(draft)
                        saving = false
                        editing = false
                    }
                }
            } else {
                Text(memo.isEmpty ? "タップして理由を入力（点検・車検など）" : memo)
                    .appFont(14).foregroundStyle(memo.isEmpty ? Color.mutedForeground : Color.appForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.muted.opacity(0.4), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
        .contentShape(Rectangle())
        .onTapGesture {
            guard !isRegularHoliday, !editing else { return }
            draft = memo
            editing = true
        }
    }
}

private struct TripCard: View {
    let trip: TripHistoryEntry
    let restBefore: TimeInterval?
    let dayShift: Int
    let gate: PinGate
    let onChanged: () async -> Void

    @State private var unlockTaps = SecretTapCounter()
    @State private var lastTap: Date?
    @State private var showsMemo = false
    @State private var editingMemo = false
    @State private var editingTimes = false
    @State private var confirmingDelete = false
    @State private var process = ""
    @State private var traffic = ""
    @State private var free = ""
    @State private var departed = Date()
    @State private var returned = Date()
    @State private var timesError: String?
    @State private var saving = false

    private static let categories: [(ActiveCategory, String, String)] = [
        (.loading, "荷積", "shippingbox.and.arrow.backward"),
        (.unloading, "荷卸", "shippingbox"),
        (.waiting, "待機", "clock"),
        (.resting, "休憩", "moon"),
    ]

    var body: some View {
        if confirmingDelete {
            ConfirmDeleteInline(message: "この運行履歴を削除しますか？", onConfirm: {
                Task {
                    try? await TripHistoryRepository.delete(id: trip.id)
                    confirmingDelete = false
                    await onChanged()
                }
            }, onCancel: { confirmingDelete = false })
        } else {
            card
        }
    }

    private var card: some View {
        let departure = TripHistoryTimeline.dateAndTime(trip.departedAt, shiftDays: dayShift)
        let arrival = TripHistoryTimeline.dateAndTime(trip.returnedAt, shiftDays: dayShift)
        return VStack(alignment: .leading, spacing: 10) {
            if let restBefore {
                Label("休息時間：\(DurationFormat.hoursMinutes(restBefore))", systemImage: "timer")
                    .appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            }
            if dayShift != 0 {
                Text("カレンダーで出勤日を\(dayShift > 0 ? "翌日" : "前日")に調整済み").appFont(10.4, weight: .medium).foregroundStyle(Color.primary)
            }
            HStack {
                endpoint(departure, label: "出庫", systemImage: "rectangle.portrait.and.arrow.right", tint: .secondary, leading: true)
                Spacer()
                Text("→").appFont(12).foregroundStyle(Color.mutedForeground)
                Spacer()
                endpoint(arrival, label: "帰庫", systemImage: "rectangle.portrait.and.arrow.forward", tint: .primary, leading: false)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 6) {
                Label("走行 \(DurationFormat.hoursMinutes(trip.totals.driving))", systemImage: "scroll")
                    .appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                ForEach(Self.categories, id: \.1) { category, label, icon in
                    if trip.totals[category] > 0 {
                        Label("\(label) \(DurationFormat.hoursMinutes(trip.totals[category]))", systemImage: icon)
                            .appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
                    }
                }
            }
            .padding(10)
            .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
            if let remaining = trip.splitRestRemaining {
                Text("分割休息：残り\(DurationFormat.hoursMinutes(remaining))を出庫時に保持")
                    .appFont(12, weight: .medium).foregroundStyle(Color.destructive)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Color.destructive.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            }
            memoSection
            if editingTimes { timesEditor }
        }
        .padding(16)
        .card()
        .contentShape(Rectangle())
        .onTapGesture(perform: handleTap)
    }

    private func endpoint(_ parts: (date: String, time: String), label: String, systemImage: String, tint: Color, leading: Bool) -> some View {
        HStack(spacing: 8) {
            if leading { icon(systemImage, tint) }
            VStack(alignment: leading ? .leading : .trailing, spacing: 0) {
                Text(parts.date).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                Text("\(parts.time) \(label)").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            if !leading { icon(systemImage, tint) }
        }
    }

    private func icon(_ name: String, _ tint: Color) -> some View {
        Image(systemName: name).foregroundStyle(tint)
            .frame(width: 36, height: 36).background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private var memoSection: some View {
        if editingMemo {
            VStack(alignment: .leading, spacing: 8) {
                Text("メモを編集（ダブルタップで表示）").appFont(10.4, weight: .semibold).foregroundStyle(Color.mutedForeground)
                FormField(label: "工程") { BoxedTextField(placeholder: "例：〇〇センター→△△倉庫", text: $process) }
                FormField(label: "渋滞区間") { BoxedTextField(placeholder: "例：〇〇IC～△△IC", text: $traffic) }
                FormField(label: "自由欄（トラブルなど）") { MemoEditor(placeholder: "気になったことを記録", text: $free) }
                FormActions(canSave: !saving, saveLabel: saving ? "保存中…" : "保存", onCancel: { editingMemo = false }) {
                    saving = true
                    Task {
                        try? await TripHistoryRepository.updateMemo(id: trip.id, process: process, traffic: traffic, free: free)
                        saving = false
                        editingMemo = false
                        await onChanged()
                    }
                }
            }
        } else if trip.hasMemo {
            if showsMemo {
                VStack(alignment: .leading, spacing: 6) {
                    memoLine("工程", trip.processMemo)
                    memoLine("渋滞区間", trip.trafficMemo)
                    memoLine("自由欄", trip.freeMemo)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
            } else {
                Label("メモあり（タップで表示）", systemImage: "note.text").appFont(10.4).foregroundStyle(Color.mutedForeground)
            }
        }
    }

    @ViewBuilder private func memoLine(_ label: String, _ value: String) -> some View {
        if !value.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).appFont(10.4, weight: .semibold).foregroundStyle(Color.mutedForeground)
                Text(value).appFont(14).foregroundStyle(Color.appForeground)
            }
        }
    }

    private var timesEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("出庫・帰庫日時を編集").appFont(10.4, weight: .semibold).foregroundStyle(Color.mutedForeground)
            DatePicker("出庫", selection: $departed).appFont(14)
            DatePicker("帰庫", selection: $returned).appFont(14)
            if let timesError {
                Text(timesError).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
            }
            HStack {
                Button { confirmingDelete = true } label: {
                    Label("削除", systemImage: "trash").appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                }
                .buttonStyle(.plain)
                Spacer()
                Button("キャンセル") { editingTimes = false }.buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                Button(saving ? "保存中…" : "保存", action: saveTimes).buttonStyle(PillButtonStyle()).fixedSize().disabled(saving)
            }
        }
        .padding(12)
        .card(radius: 12, border: Color.primary.opacity(0.5), fill: .appBackground)
    }

    /// Tap toggles the memo preview, double-tap edits memos, and 5 quick taps
    /// (隠しコマンド, PIN-gated) open the date-time editor with delete.
    private func handleTap() {
        guard !editingMemo, !editingTimes else { return }
        if unlockTaps.registerTap() {
            gate.guarded {
                departed = trip.departedAt
                returned = trip.returnedAt
                timesError = nil
                showsMemo = false
                editingTimes = true
            }
            return
        }
        let now = Date()
        if let lastTap, now.timeIntervalSince(lastTap) < 0.35 {
            self.lastTap = nil
            process = trip.processMemo
            traffic = trip.trafficMemo
            free = trip.freeMemo
            editingMemo = true
            showsMemo = true
        } else {
            lastTap = now
            showsMemo.toggle()
        }
    }

    private func saveTimes() {
        if let error = TripHistoryTimeline.validateTimes(departedAt: departed, returnedAt: returned) {
            timesError = error
            return
        }
        saving = true
        Task {
            defer { saving = false }
            do {
                try await TripHistoryRepository.updateTimes(id: trip.id, departedAt: departed, returnedAt: returned)
                editingTimes = false
                await onChanged()
            } catch {
                timesError = error.localizedDescription
            }
        }
    }
}

/// 出勤日 calendar: 〇 marks workdays; double-tap a workday to move it ±1 day
/// (or 元に戻す), a holiday to relabel or delete it. Port of
/// components/attendance-calendar-view.tsx.
struct AttendanceCalendarView: View {
    let trips: [TripHistoryEntry]
    let overrides: RealtimeTable<AttendanceOverrideRow>

    @State private var month = YearMonth(Date())
    @State private var selected: LocalDate?
    @State private var labelDraft = ""
    @State private var saving = false

    var body: some View {
        let days = AttendanceCalendar.resolve(trips: trips, overrides: overrides.rows)
        VStack(alignment: .leading, spacing: 12) {
            MonthNav(month: $month)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(Array(JapaneseCalendarText.weekdays.enumerated()), id: \.offset) { index, name in
                    Text(name).appFont(12, weight: .semibold).foregroundStyle(weekdayColor(index))
                }
                ForEach(Array(month.cells().enumerated()), id: \.offset) { index, cell in
                    if let cell {
                        dayCell(cell, weekday: index % 7, entry: days[cell])
                    } else {
                        Color.clear.frame(height: 44)
                    }
                }
            }
            if let selected, let entry = days[selected] {
                editor(selected, entry: entry)
            }
            if overrides.isLoading {
                Text("読み込み中…").appFont(12).foregroundStyle(Color.mutedForeground).frame(maxWidth: .infinity)
            }
            HStack(spacing: 12) {
                (Text("〇").foregroundColor(.primary).bold() + Text("出勤日"))
                Text("空白：休日")
            }
            .appFont(10.4).foregroundStyle(Color.mutedForeground)
            Text("出勤日はダブルタップで1日前後に調整、休日はダブルタップで文言編集・削除できます。")
                .appFont(10.4).foregroundStyle(Color.mutedForeground)
        }
        .padding(16)
        .card()
        .monthSwipe($month)
        .onChange(of: month) { _, _ in selected = nil }
    }

    private func dayCell(_ day: LocalDate, weekday: Int, entry: ResolvedAttendanceDay?) -> some View {
        VStack(spacing: 2) {
            Text("\(day.day)").appFont(12, weight: .medium).foregroundStyle(weekdayColor(weekday))
            Text("〇").appFont(14, weight: .bold).foregroundStyle(entry?.showsMark == true ? Color.primary : .clear)
                .accessibilityHidden(entry?.showsMark != true)
        }
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(selected == day ? Color.primary.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected == day ? Color.primary : .clear))
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            guard let entry else { return }
            if case .holiday(let label) = entry { labelDraft = label ?? AttendanceCalendar.defaultHolidayLabel }
            selected = day
        }
        .accessibilityLabel("\(day.month)月\(day.day)日\(entry?.showsMark == true ? " 出勤日" : "")")
    }

    @ViewBuilder private func editor(_ day: LocalDate, entry: ResolvedAttendanceDay) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            switch entry {
            case .workday(let origin, _), .workdayOrigin(let origin, _):
                Text("\(day.month)/\(day.day) 出勤日を1日ずらす").appFont(12, weight: .semibold).foregroundStyle(Color.appForeground)
                HStack(spacing: 8) {
                    Button { shift(origin, -1) } label: { Image(systemName: "chevron.left") }.accessibilityLabel("前日にずらす")
                    Button("元に戻す") { shift(origin, 0) }
                    Button { shift(origin, 1) } label: { Image(systemName: "chevron.right") }.accessibilityLabel("翌日にずらす")
                    Spacer()
                    Button("閉じる") { selected = nil }
                }
                .buttonStyle(PillButtonStyle(kind: .outline))
                .disabled(saving)
            case .holiday:
                FormField(label: "休日の表示文言") { BoxedTextField(placeholder: AttendanceCalendar.defaultHolidayLabel, text: $labelDraft) }
                FormActions(canSave: !saving, saveLabel: saving ? "保存中…" : "保存",
                            onDelete: { write { try await AttendanceOverrideRepository.removeHoliday(day: day) } },
                            onCancel: { selected = nil }) {
                    let label = labelDraft
                    write { try await AttendanceOverrideRepository.setHolidayLabel(day: day, label: label) }
                }
            }
        }
        .padding(12)
        .card(radius: 12, fill: .appBackground)
    }

    private func shift(_ origin: LocalDate, _ days: Int) {
        write { try await AttendanceOverrideRepository.setWorkdayShift(day: origin, shiftDays: days) }
    }

    private func write(_ operation: @escaping () async throws -> Void) {
        saving = true
        Task {
            try? await operation()
            await overrides.refresh()
            saving = false
            selected = nil
        }
    }

    private func weekdayColor(_ index: Int) -> Color {
        index == 0 ? .destructive : (index == 6 ? .secondary : .appForeground)
    }
}
