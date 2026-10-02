import KyoeiCore
import Supabase
import SwiftUI

enum LeaveRepository {
    struct Submit: Encodable {
        let p_start: String
        let p_end: String
        let p_category: String
        let p_detail: String
        let p_paid: Bool
    }

    struct Update: Encodable {
        let p_id: String
        let p_start: String?
        let p_end: String?
        let p_category: String?
        let p_detail: String?
        let p_paid: Bool?
        let p_withdraw: Bool
    }

    static func submit(_ body: Submit) async throws {
        try await Backend.client.rpc("submit_leave_request", params: body).execute()
    }

    static func update(_ body: Update) async throws {
        try await Backend.client.rpc("update_leave_request", params: body).execute()
    }

    static func dayStatus(from: LocalDate, to: LocalDate) async throws -> [LeaveDayStatus] {
        try await Backend.client.rpc("leave_day_status", params: ["p_from": from.iso, "p_to": to.iso]).execute().value
    }

    static func board(from: LocalDate, to: LocalDate) async throws -> LeaveCheckerBoard {
        try await Backend.client.rpc("leave_checker_board", params: ["p_from": from.iso, "p_to": to.iso]).execute().value
    }

    static func confirm(_ id: String) async throws {
        try await Backend.client.rpc("confirm_leave_request", params: ["p_id": id]).execute()
    }

    struct Exception: Encodable {
        let p_user: String
        let p_start: String
        let p_end: String
        let p_note: String
    }

    static func grantException(_ body: Exception) async throws {
        try await Backend.client.rpc("grant_leave_exception", params: body).execute()
    }

    /// The Japanese message for a failed submit/update.
    static func message(for error: Error, noticeDays: Int) -> String {
        let text = (error as? PostgrestError)?.message ?? "\(error)"
        if let code = LeaveRules.code(fromError: text) { return LeaveRules.message(code, noticeDays: noticeDays) }
        if text.contains("locked") { return "確認済みの申請は直せません。事務所に問い合わせてください。" }
        return LeaveRules.message("", noticeDays: noticeDays)
    }
}

/// マイページ > 休暇申請: 有給の残り, my requests, and (for 担当者) the 確認 board.
struct LeaveView: View {
    @Environment(LeaveStore.self) private var store
    @State private var tab: Tab = .mine
    @State private var editing: LeaveEditorTarget?

    private enum Tab: Hashable { case mine, checker }

    var body: some View {
        TabPage {
            PageHeading(title: "休暇申請", subtitle: "お休みは\(store.leave?.notice_days ?? 7)日前までに申請してください。担当者が確認すると確定します。")
            if store.leave?.is_checker == true {
                Picker("表示", selection: $tab) {
                    Text("自分の申請").tag(Tab.mine)
                    Text("担当者").tag(Tab.checker)
                }
                .pickerStyle(.segmented)
            }
            if tab == .checker {
                LeaveCheckerSection()
            } else if let leave = store.leave {
                balanceCard(leave)
                Button { editing = LeaveEditorTarget(existing: nil) } label: {
                    Label("休暇を申請する", systemImage: "calendar.badge.plus")
                        .appFont(16, weight: .black)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(Color.brandForeground)
                        .background(Color.brand, in: SlantedRectangle(slant: 10))
                }
                .buttonStyle(PressScaleStyle())
                if !leave.exceptions.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Label("担当者が申請を許可した日", systemImage: "checkmark.shield").appFont(13, weight: .bold).foregroundStyle(Color.primary)
                        ForEach(Array(leave.exceptions.enumerated()), id: \.offset) { _, e in
                            Text("\(e.start_on.month)/\(e.start_on.day)\(e.start_on == e.end_on ? "" : "〜\(e.end_on.month)/\(e.end_on.day)")\(e.note.isEmpty ? "" : "（\(e.note)）")")
                                .appFont(13).foregroundStyle(Color.appForeground)
                        }
                    }
                    .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                }
                if leave.requests.isEmpty {
                    EmptyStateBox(text: "休暇申請はまだありません。")
                }
                ForEach(leave.requests) { request in
                    LeaveRow(request: request, unread: store.unread.contains(request.id)) {
                        editing = LeaveEditorTarget(existing: request)
                    }
                }
            } else if store.loaded {
                EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。")
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 160)
            }
        }
        .refreshable { await store.refresh() }
        .task {
            await store.refresh()
            store.markRead()
        }
        .sheet(item: $editing) { target in
            LeaveEditorView(target: target) {
                editing = nil
                Task { await store.refresh() }
            }
        }
    }

    private func balanceCard(_ leave: MyLeave) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text("有給の残り").appFont(13, weight: .semibold).foregroundStyle(Color.mutedForeground)
                Spacer()
                Text("\(leave.balance.free)日").appFont(28, weight: .black).monospacedDigit().foregroundStyle(Color.primary)
            }
            if leave.balance.pending > 0 {
                Text("申請中の有給 \(leave.balance.pending)日を差し引いた日数です。").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            if let next = leave.balance.next_expiry {
                Text("\(next.on.year)年\(next.on.month)月\(next.on.day)日に \(next.days)日分が期限切れになります。").appFont(12).foregroundStyle(Color.secondary)
            }
        }
        .padding(16)
        .card()
    }
}

private struct LeaveRow: View {
    let request: LeaveRequest
    let unread: Bool
    let onEdit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                let color: Color = request.status == .confirmed ? .primary : (request.status == .pending ? .secondary : .mutedForeground)
                Text(request.status.label).appFont(12, weight: .bold).foregroundStyle(color)
                    .padding(.horizontal, 10).padding(.vertical, 4).background(color.opacity(0.14), in: Capsule())
                if unread {
                    Text("更新あり").appFont(11, weight: .black).foregroundStyle(Color.destructiveForeground)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(Color.destructive, in: Capsule())
                }
                Spacer()
                if request.paid {
                    Text("有給").appFont(12, weight: .bold).foregroundStyle(Color.primary)
                }
            }
            Text("\(request.periodLabel)（\(request.days)日間）").appFont(17, weight: .bold).foregroundStyle(Color.appForeground)
            Text(request.categoryLabel).appFont(13).foregroundStyle(Color.mutedForeground)
            if let by = request.confirmed_by_name, request.status == .confirmed {
                Text("確認：\(by)").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            if request.isEditable {
                Button("内容を直す・取り下げる", action: onEdit).appFont(13, weight: .semibold).foregroundStyle(Color.primary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(border: unread ? Color.primary.opacity(0.7) : .cardEdge)
    }
}

struct LeaveEditorTarget: Identifiable {
    var existing: LeaveRequest?
    var id: String { existing?.id ?? "new" }
}

/// 休暇届: 期間・区分・有給. Days the app knows are too close or full are
/// flagged before sending; the server checks again.
private struct LeaveEditorView: View {
    let target: LeaveEditorTarget
    let onClose: () -> Void

    @Environment(LeaveStore.self) private var store
    @State private var start = Date()
    @State private var end = Date()
    @State private var category: LeaveCategory = .personal
    @State private var detail = ""
    @State private var paid = false
    @State private var full: Set<LocalDate> = []
    @State private var sending = false
    @State private var error: String?
    @State private var confirmsWithdraw = false

    private var noticeDays: Int { store.leave?.notice_days ?? 7 }
    private var today: LocalDate { LocalDate(Date()) }
    private var startDay: LocalDate { LocalDate(start) }
    private var endDay: LocalDate { LocalDate(end) }
    private var freePaid: Int {
        (store.leave?.balance.free ?? 0) + (target.existing.map { $0.paid ? $0.days : 0 } ?? 0)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Text(target.existing == nil ? "休暇届" : "休暇届を直す").appFont(18, weight: .bold)
                    Spacer()
                    Button("閉じる", action: onClose).appFont(15, weight: .semibold).foregroundStyle(Color.primary)
                }
                FormField(label: "期間") {
                    VStack(alignment: .leading, spacing: 8) {
                        DatePicker("から", selection: $start, displayedComponents: .date)
                        DatePicker("まで", selection: $end, in: start..., displayedComponents: .date)
                        Text("\(max(0, LeaveRules.days(from: startDay, to: endDay)))日間").appFont(15, weight: .bold).foregroundStyle(Color.primary)
                    }
                    .padding(12).card(radius: 12)
                }
                FormField(label: "区分") {
                    Picker("区分", selection: $category) {
                        ForEach(LeaveCategory.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
                if let prompt = category.detailPrompt {
                    FormField(label: "\(prompt)（必須）") { BoxedTextField(placeholder: category == .hospital ? "例：歯科の定期検診" : "理由", text: $detail, fill: .card) }
                }
                Toggle(isOn: $paid) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("有給にする").appFont(15, weight: .semibold)
                        Text("残り \(freePaid)日").appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                }
                .padding(12).card(radius: 12)

                if let problem = currentProblem {
                    Text(problem).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.destructive.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                }
                if let error {
                    Text(error).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                }
                Button(sending ? "送信中…" : (target.existing == nil ? "申請する" : "直して申請する")) { send() }
                    .buttonStyle(PillButtonStyle())
                    .disabled(sending || currentProblem != nil)
                    .opacity(currentProblem == nil ? 1 : 0.5)
                if target.existing != nil {
                    Button("この申請を取り下げる") { confirmsWithdraw = true }
                        .appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(20)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .onAppear(perform: fill)
        .task(id: "\(startDay.iso)|\(endDay.iso)") { await loadFull() }
        .overlay {
            if confirmsWithdraw {
                ConfirmActionDialog(message: "この休暇申請を取り下げますか？", confirmLabel: "取り下げる",
                                    onConfirm: { confirmsWithdraw = false; withdraw() },
                                    onCancel: { confirmsWithdraw = false })
            }
        }
    }

    private var currentProblem: String? {
        LeaveRules.problem(start: startDay, end: endDay, today: today, noticeDays: noticeDays,
                           exceptions: store.leave?.exceptions ?? [], category: category, detail: detail,
                           paid: paid, freePaidDays: freePaid, full: full)
    }

    private func fill() {
        if let existing = target.existing {
            start = existing.start_on.startDate()
            end = existing.end_on.startDate()
            category = existing.category
            detail = existing.detail
            paid = existing.paid
        } else {
            let first = today.adding(days: noticeDays).startDate()
            start = first
            end = first
        }
    }

    private func loadFull() async {
        guard startDay <= endDay, LeaveRules.days(from: startDay, to: endDay) <= 31 else { return }
        let statuses = (try? await LeaveRepository.dayStatus(from: startDay, to: endDay)) ?? []
        // My own request on those days shouldn't count against me when editing.
        let mine = target.existing
        full = Set(statuses.filter { status in
            guard let limit = status.max_people else { return false }
            let own = mine.map { $0.covers(status.day) ? 1 : 0 } ?? 0
            return status.taken - own >= limit
        }.map(\.day))
    }

    private func send() {
        error = nil
        sending = true
        let detailText = category.detailPrompt == nil ? "" : detail
        Task {
            do {
                if let existing = target.existing {
                    try await LeaveRepository.update(.init(p_id: existing.id, p_start: startDay.iso, p_end: endDay.iso, p_category: category.rawValue, p_detail: detailText, p_paid: paid, p_withdraw: false))
                } else {
                    try await LeaveRepository.submit(.init(p_start: startDay.iso, p_end: endDay.iso, p_category: category.rawValue, p_detail: detailText, p_paid: paid))
                }
                sending = false
                onClose()
            } catch {
                sending = false
                self.error = LeaveRepository.message(for: error, noticeDays: noticeDays)
            }
        }
    }

    private func withdraw() {
        guard let existing = target.existing else { return }
        sending = true
        Task {
            do {
                try await LeaveRepository.update(.init(p_id: existing.id, p_start: nil, p_end: nil, p_category: nil, p_detail: nil, p_paid: nil, p_withdraw: true))
                sending = false
                onClose()
            } catch {
                sending = false
                self.error = LeaveRepository.message(for: error, noticeDays: noticeDays)
            }
        }
    }
}

/// 担当者: 確認 pending requests and allow exceptions after talking it over.
private struct LeaveCheckerSection: View {
    @State private var board: LeaveCheckerBoard?
    @State private var failed = false
    @State private var granting = false
    @State private var message: String?

    var body: some View {
        Group {
            if let board {
                let pending = board.requests.filter { $0.status == .pending }
                Text("確認待ち \(pending.count)件").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                if pending.isEmpty {
                    EmptyStateBox(text: "確認待ちの申請はありません。", verticalPadding: 20)
                }
                ForEach(pending) { request in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(request.name ?? "").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                        Text("\(request.periodLabel)（\(request.days)日間）\(request.paid ? "・有給" : "")").appFont(15, weight: .semibold)
                        Text(request.categoryLabel).appFont(13).foregroundStyle(Color.mutedForeground)
                        Button("確認する") { confirm(request) }.buttonStyle(PillButtonStyle())
                    }
                    .padding(14).frame(maxWidth: .infinity, alignment: .leading).card()
                }
                if let message {
                    Text(message).appFont(13, weight: .semibold).foregroundStyle(Color.primary)
                }
                Button { granting = true } label: {
                    Label("相談のうえ、申請を許可する（直近・上限の日）", systemImage: "checkmark.shield")
                        .appFont(14, weight: .bold).frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(PillButtonStyle(kind: .outline))
                let upcoming = board.requests.filter { $0.status == .confirmed }
                if !upcoming.isEmpty {
                    Text("確認済みの予定").appFont(15, weight: .bold).foregroundStyle(Color.appForeground).padding(.top, 8)
                    ForEach(upcoming) { request in
                        HStack {
                            Text(request.name ?? "").appFont(14, weight: .semibold)
                            Spacer()
                            Text("\(request.periodLabel)\(request.paid ? "・有給" : "")").appFont(13).foregroundStyle(Color.mutedForeground)
                        }
                        .padding(10).card(radius: 12)
                    }
                }
            } else if failed {
                EmptyStateBox(text: "読み込めませんでした。")
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            }
        }
        .task { await load() }
        .sheet(isPresented: $granting) {
            if let board {
                LeaveExceptionForm(people: board.people) { granted in
                    granting = false
                    if granted { message = "申請を許可しました。本人に申請してもらってください。" }
                    Task { await load() }
                }
            }
        }
    }

    private func load() async {
        let today = LocalDate(Date())
        do {
            board = try await LeaveRepository.board(from: today, to: today.adding(days: 90))
            failed = false
        } catch {
            failed = true
        }
    }

    private func confirm(_ request: LeaveRequest) {
        Task {
            do {
                try await LeaveRepository.confirm(request.id)
                message = "\(request.name ?? "")さんの休暇を確認しました。"
            } catch {
                message = "確認できませんでした（取り下げられた可能性があります）。"
            }
            await load()
        }
    }
}

private struct LeaveExceptionForm: View {
    let people: [LeaveCheckerBoard.Person]
    let onDone: (Bool) -> Void
    @State private var person: String?
    @State private var start = Date()
    @State private var end = Date()
    @State private var note = ""
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("申請を許可する").appFont(18, weight: .bold)
                    Spacer()
                    Button("やめる") { onDone(false) }.appFont(15, weight: .semibold).foregroundStyle(Color.primary)
                }
                Text("相談して休めると判断した日について、1週間を切っていても、上限に達していても、本人が申請できるようにします。許可したあと、本人がアプリから申請します。")
                    .appFont(12).foregroundStyle(Color.mutedForeground)
                FormField(label: "誰に") {
                    Picker("誰に", selection: $person) {
                        Text("選んでください").tag(String?.none)
                        ForEach(people) { Text($0.name).tag(Optional($0.user_id)) }
                    }
                    .pickerStyle(.menu)
                }
                DatePicker("から", selection: $start, in: Date()..., displayedComponents: .date)
                DatePicker("まで", selection: $end, in: start..., displayedComponents: .date)
                FormField(label: "メモ（任意）") { BoxedTextField(placeholder: "例：家族の通院付き添い。電話で相談済み", text: $note, fill: .card) }
                if let error { Text(error).appFont(13, weight: .semibold).foregroundStyle(Color.destructive) }
                Button(saving ? "保存中…" : "許可する") { save() }
                    .buttonStyle(PillButtonStyle())
                    .disabled(person == nil || saving)
            }
            .padding(20)
        }
        .background(Color.appBackground.ignoresSafeArea())
    }

    private func save() {
        guard let person else { return }
        saving = true
        Task {
            do {
                try await LeaveRepository.grantException(.init(p_user: person, p_start: LocalDate(start).iso, p_end: LocalDate(end).iso, p_note: note))
                onDone(true)
            } catch {
                self.error = "許可できませんでした。日付を確認してください（一度に31日まで）。"
            }
            saving = false
        }
    }
}
