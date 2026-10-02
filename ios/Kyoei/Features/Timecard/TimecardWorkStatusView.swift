import KyoeiCore
import SwiftUI

/// 勤務状況/メモ: work and break timers, the shared memo board, a device-only
/// personal memo and links to 共栄ヤード一覧 / やること. Port of
/// components/timecard-work-status-view.tsx.
struct TimecardWorkStatusView: View {
    let onBack: () -> Void

    private static let yardMapURL = URL(string: "https://www.google.com/maps/d/u/0/edit?mid=18TvmwVsmK7OJCelhGjqScBkIlxpXX34&usp=sharing")!

    @Environment(ShiftStore.self) private var store
    @Environment(SharedData.self) private var data
    @State private var pendingBreak: Bool?
    @State private var showsTodo = false

    var body: some View {
        if showsTodo {
            TodoView(onBack: { showsTodo = false })
        } else {
            EverySecond { now in
                TabPage {
                    BackHeader(label: "出退勤", onBack: onBack)
                    let nowParts = formatClock(now, seconds: false)
                    VStack(spacing: 2) {
                        DateLine(parts: nowParts)
                        Text(nowParts.time).timerFont(30, weight: .semibold).foregroundStyle(Color.appForeground)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .card()

                    workSection(now: now)

                    HStack(spacing: 8) {
                        Link(destination: Self.yardMapURL) {
                            linkLabel("共栄ヤード一覧", systemImage: "map")
                        }
                        Button { showsTodo = true } label: {
                            linkLabel("やること", systemImage: "list.clipboard")
                        }
                        .buttonStyle(.plain)
                    }

                    SharedMemoBoard()
                    PersonalMemoCard()
                }
                .overlay { dialog }
            }
        }
    }

    @ViewBuilder private func workSection(now: Date) -> some View {
        let state = store.timecard
        if let startedAt = state.shiftStartedAt, state.clockedIn {
            let parts = formatClock(startedAt, seconds: false)
            HStack(spacing: 12) {
                tile(title: "出勤時間", value: parts.time, caption: "\(parts.date) \(parts.weekday)")
                tile(title: "勤務時間", value: DurationFormat.clock(state.liveShiftElapsed(at: now)), caption: nil)
            }
            HStack {
                Text("休憩時間").appFont(14, weight: .bold)
                Spacer()
                Text(DurationFormat.clock(state.liveBreakTotal(at: now))).timerFont(24)
            }
            .foregroundStyle(state.onBreak ? Color.primary : Color.appForeground)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .card()

            Button { pendingBreak = !state.onBreak } label: {
                Label(state.onBreak ? "休憩終了" : "休憩開始", systemImage: state.onBreak ? "pause.fill" : "play.fill")
                    .appFont(18, weight: .bold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .foregroundStyle(Color.primaryForeground)
                    .card(border: .primary, fill: .primary)
            }
            .buttonStyle(PressScaleStyle())
        } else {
            Text("現在は退勤中です。出勤するとここに勤務時間と休憩ボタンが表示されます。")
                .appFont(14)
                .foregroundStyle(Color.mutedForeground)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .background(Color.card, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
        }
    }

    private func tile(title: String, value: String, caption: String?) -> some View {
        VStack(spacing: 2) {
            Text(title).appFont(14, weight: .bold)
            Text(value).timerFont(24)
            if let caption {
                Text(caption).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            }
        }
        .foregroundStyle(Color.secondary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .card()
    }

    private func linkLabel(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage).foregroundStyle(Color.primary)
            Text(title).foregroundStyle(Color.appForeground)
        }
        .appFont(16, weight: .bold)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .card()
    }

    @ViewBuilder private var dialog: some View {
        let messages = data.confirmMessages
        if let starting = pendingBreak {
            let id = starting ? "timecard-break-start" : "timecard-break-end"
            ConfirmActionDialog(
                message: messages.message(id, fallback: starting ? "休憩を開始しますか？" : "休憩を終了しますか？"),
                confirmLabel: messages.confirmLabel(id),
                cancelLabel: messages.cancelLabel(id),
                onConfirm: {
                    pendingBreak = nil
                    starting ? store.startBreak() : store.endBreak()
                },
                onCancel: { pendingBreak = nil }
            )
        }
    }
}

/// 共有メモ: anyone can add (triple-tap), edit or delete; synced in real time.
private struct SharedMemoBoard: View {
    @State private var table = RealtimeTable<SharedMemoRow>(table: "timecard_shared_memos", fetch: SharedMemoRepository.fetch)
    @State private var adding = false
    @State private var author = ""
    @State private var content = ""
    @State private var saving = false
    @State private var editingID: String?
    @State private var confirmDeleteID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Label("共有メモ", systemImage: "cup.and.saucer").appFont(14, weight: .bold).foregroundStyle(Color.primary)
                Text("リアルタイムで共有されます").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            }
            if adding {
                MemoForm(author: $author, content: $content, saveLabel: saving ? "保存中…" : "追記する", saving: saving,
                         onCancel: { adding = false }, onSave: add)
            } else if table.rows.isEmpty {
                Text("メモはまだありません。3回連続タップで追記できます。").appFont(12).foregroundStyle(Color.mutedForeground)
            } else {
                ForEach(table.rows) { memo in
                    memoRow(memo)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .card()
        .contentShape(Rectangle())
        .onTapGesture(count: 3) {
            guard !adding, editingID == nil else { return }
            author = ""
            content = ""
            adding = true
        }
        .syncing(table)
    }

    @ViewBuilder private func memoRow(_ memo: SharedMemoRow) -> some View {
        if editingID == memo.id {
            MemoForm(author: $author, content: $content, saveLabel: "保存", saving: saving,
                     onCancel: { editingID = nil }, onSave: { update(memo) })
        } else {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(memo.author_name).appFont(12, weight: .bold).foregroundStyle(Color.appForeground)
                    Spacer()
                    Text(Self.timestamp(memo.created_at)).appFont(10.4).foregroundStyle(Color.mutedForeground)
                }
                Text(memo.content).appFont(12).foregroundStyle(Color.appForeground).lineSpacing(3)
                if confirmDeleteID == memo.id {
                    ConfirmDeleteInline(onConfirm: { delete(memo) }, onCancel: { confirmDeleteID = nil })
                } else {
                    HStack(spacing: 12) {
                        Spacer()
                        Button {
                            confirmDeleteID = nil
                            author = memo.author_name
                            content = memo.content
                            editingID = memo.id
                        } label: { Label("編集", systemImage: "pencil") }
                            .foregroundStyle(Color.mutedForeground)
                        Button { confirmDeleteID = memo.id } label: { Label("削除", systemImage: "trash") }
                            .foregroundStyle(Color.destructive.opacity(0.8))
                    }
                    .appFont(10.4, weight: .medium)
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .card(radius: 12, fill: .appBackground)
        }
    }

    private func add() {
        perform { try await SharedMemoRepository.add(author: $0, content: $1) } then: { adding = false }
    }

    private func update(_ memo: SharedMemoRow) {
        perform { try await SharedMemoRepository.update(id: memo.id, author: $0, content: $1) } then: { editingID = nil }
    }

    private func perform(_ write: @escaping (String, String) async throws -> Void, then done: @escaping () -> Void) {
        let a = author.trimmingCharacters(in: .whitespacesAndNewlines)
        let c = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !a.isEmpty, !c.isEmpty else { return }
        saving = true
        Task {
            defer { saving = false }
            do {
                try await write(a, c)
                await table.refresh()
                done()
            } catch {
                // Leave the form open so the text isn't lost.
            }
        }
    }

    private func delete(_ memo: SharedMemoRow) {
        Task {
            try? await SharedMemoRepository.delete(id: memo.id)
            await table.refresh()
            confirmDeleteID = nil
        }
    }

    private static func timestamp(_ iso: String) -> String {
        guard let date = DBTimestamp.parse(iso) else { return "" }
        let parts = formatClock(date, seconds: false)
        return "\(parts.date) \(parts.time)"
    }
}

private struct MemoForm: View {
    @Binding var author: String
    @Binding var content: String
    let saveLabel: String
    let saving: Bool
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            TextField("入力者の名前", text: $author)
                .appFont(14, weight: .semibold)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .card(radius: 12, fill: .appBackground)
            MemoEditor(placeholder: "メモ内容を入力（改行できます）", text: $content, minLines: 3)
            HStack(spacing: 8) {
                Spacer()
                Button("キャンセル", action: onCancel).buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                Button(saveLabel, action: onSave).buttonStyle(PillButtonStyle()).fixedSize()
                    .disabled(saving || author.trimmingCharacters(in: .whitespaces).isEmpty || content.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }
}

/// 個人メモ（この端末のみ）— double-tap to edit, stored on device only.
private struct PersonalMemoCard: View {
    @AppStorage("kyoei-timecard-personal-memo") private var memo = ""
    @State private var editing = false
    @State private var draft = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("個人メモ（この端末のみ）").appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
            if editing {
                MemoEditor(placeholder: "この端末だけに保存されるメモを入力（改行できます）", text: $draft, minLines: 3)
                HStack(spacing: 8) {
                    Spacer()
                    Button("キャンセル") { editing = false }.buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                    Button("保存") {
                        memo = draft.trimmingCharacters(in: .whitespacesAndNewlines)
                        editing = false
                    }
                    .buttonStyle(PillButtonStyle()).fixedSize()
                }
            } else {
                Text(memo.isEmpty ? "ダブルタップしてメモを入力" : memo).appFont(12).foregroundStyle(Color.appForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .card()
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            guard !editing else { return }
            draft = memo
            editing = true
        }
    }
}
