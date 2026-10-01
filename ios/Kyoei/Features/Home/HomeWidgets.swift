import KyoeiCore
import SwiftUI

/// 連続無事故日数 badge; tapping opens 無事故カレンダー. Port of
/// accident-streak-badge.tsx.
struct AccidentStreakBadge: View {
    let onOpen: () -> Void
    @Environment(SharedData.self) private var data

    var body: some View {
        if let streak = data.accidentStreak() {
            Button(action: onOpen) {
                HStack(spacing: 6) {
                    (Text("連続無事故日数 ") + Text("\(streak)").font(.system(size: 30, weight: .bold, design: .monospaced)) + Text(" 日 達成！"))
                        .appFont(14, weight: .semibold)
                    Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(Color.secondary)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(Color.secondary.opacity(0.1), in: Capsule())
                .overlay(Capsule().stroke(Color.secondary.opacity(0.3)))
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity)
        } else {
            Text("まだ事故記録がありません")
                .appFont(12)
                .foregroundStyle(Color.mutedForeground)
                .frame(maxWidth: .infinity)
        }
    }
}

/// 今月の目標. Double-tap (PIN 2486) to edit this and next month's goal; a
/// saved next-month goal is promoted automatically when the month changes.
/// Port of weekly-goal.tsx.
struct WeeklyGoalCard: View {
    var goalID = "current"

    @State private var table: RealtimeTable<WeeklyGoalRow>
    @State private var gate = PinGate(code: "2486")
    @State private var editing = false
    @State private var draft = ""
    @State private var nextDraft = ""
    @State private var saving = false
    @State private var rolledOver: String?

    init(goalID: String = "current") {
        self.goalID = goalID
        _table = State(initialValue: RealtimeTable(table: "weekly_goal") {
            try await WeeklyGoalRepository.fetch(goalID: goalID)
        })
    }

    private var row: WeeklyGoalRow? { table.rows.first }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(row?.title ?? "今月の目標", systemImage: "target")
                .appFont(14, weight: .bold)
                .foregroundStyle(Color.orange)
            if editing {
                editor
            } else {
                Text((row?.content).flatMap { $0.isEmpty ? nil : $0 } ?? "ダブルタップして目標を設定")
                    .appFont(14, weight: .medium)
                    .foregroundStyle(Color.appForeground)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .card()
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            guard !editing else { return }
            gate.guarded {
                draft = row?.content ?? ""
                nextDraft = row?.next_content ?? ""
                editing = true
            }
        }
        .syncing(table)
        .task(id: row?.content_month) { await rolloverIfNeeded() }
        .pinGate(gate)
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("今月の目標").appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                MemoEditor(placeholder: "今月の目標を入力", text: $draft)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("来月の目標").appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                MemoEditor(placeholder: "来月の目標を入力", text: $nextDraft)
            }
            HStack(spacing: 8) {
                Spacer()
                Button("キャンセル") { editing = false }
                    .buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                Button(saving ? "保存中…" : "保存", action: save)
                    .buttonStyle(PillButtonStyle()).fixedSize()
                    .disabled(saving)
            }
        }
        .padding(.top, 8)
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            do {
                try await WeeklyGoalRepository.save(
                    goalID: goalID,
                    content: draft.trimmingCharacters(in: .whitespacesAndNewlines),
                    nextContent: nextDraft.trimmingCharacters(in: .whitespacesAndNewlines),
                    month: YearMonth(Date())
                )
                await table.refresh()
                editing = false
            } catch {
                // Keep the editor open so nothing typed is lost; retry is possible.
            }
        }
    }

    private func rolloverIfNeeded() async {
        guard let row, row.needsRollover(currentMonth: YearMonth(Date())), rolledOver != row.id else { return }
        rolledOver = row.id
        try? await WeeklyGoalRepository.rollover(row, to: YearMonth(Date()))
        await table.refresh()
    }
}
