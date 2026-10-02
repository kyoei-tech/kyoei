import KyoeiCore
import SwiftUI

/// タイムカードモードのホーム: simple 出勤/退勤 for office staff. Port of
/// components/timecard-home-view.tsx.
struct TimecardHomeView: View {
    let openMenuItem: (MenuItem) -> Void

    @Environment(ShiftStore.self) private var store

    var body: some View {
        switch store.timecardScreen {
        case .status:
            TimecardWorkStatusView(onBack: { store.timecardScreen = .home })
        case .home:
            TimecardHomeMain(openMenuItem: openMenuItem)
        }
    }
}

private struct TimecardHomeMain: View {
    let openMenuItem: (MenuItem) -> Void

    @Environment(ShiftStore.self) private var store
    @Environment(SharedData.self) private var data
    @State private var pending: Pending?

    private enum Pending { case clockIn, clockOut }

    var body: some View {
        let state = store.timecard
        let hour12 = store.shift.hour12
        EverySecond { now in
            FitHomePage {
                VStack(spacing: 6) {
                    LiveClockCard(parts: formatClock(now, hour12: hour12, seconds: false), hour12: hour12, onToggleFormat: store.toggleHour12)
                    AccidentStreakBadge(onOpen: { openMenuItem(.accidents) })
                    WeeklyGoalCard(goalID: "timecard")
                }
                LinkedTimeCard(
                    label: state.clockedIn ? "出勤時刻" : "タイムカード",
                    parts: formatClock(state.shiftStartedAt ?? now, hour12: hour12, seconds: false),
                    active: state.clockedIn,
                    hour12: hour12,
                    onToggleFormat: store.toggleHour12
                )

                VStack(spacing: 4) {
                    Label(state.clockedIn ? "勤務時間" : "タイマー", systemImage: "timer")
                        .appFont(16, weight: .bold)
                    SplitTimerText(
                        text: state.clockedIn ? DurationFormat.clock(state.liveShiftElapsed(at: now)) : "00:00:00",
                        color: state.clockedIn ? .primary : .mutedForeground
                    )
                }
                .foregroundStyle(state.clockedIn ? Color.primary : Color.mutedForeground)
                .frame(maxWidth: .infinity, minHeight: 160)
                .card(radius: Radius.card)

                Button { store.timecardScreen = .status } label: {
                    Label("勤務状況/メモ", systemImage: "chevron.right")
                        .labelStyle(TrailingIconLabelStyle())
                        .appFont(16, weight: .semibold)
                }
                .buttonStyle(PillButtonStyle())

                HStack(spacing: 12) {
                    BigActionButton(
                        title: "出勤", systemImage: "checkmark.seal",
                        fill: state.clockedIn ? .primary : .card,
                        foreground: state.clockedIn ? .primaryForeground : .primary
                    ) { pending = .clockIn }
                    .disabled(state.clockedIn)
                    .opacity(state.clockedIn ? 0.4 : 1)

                    BigActionButton(title: "退勤", systemImage: "checkmark.seal", fill: .card, foreground: .secondary) {
                        pending = .clockOut
                    }
                    .disabled(!state.clockedIn)
                    .opacity(state.clockedIn ? 1 : 0.4)
                }
            }
            .overlay { dialog }
        }
    }

    @ViewBuilder private var dialog: some View {
        let messages = data.confirmMessages
        switch pending {
        case nil:
            EmptyView()
        case .clockIn:
            ConfirmActionDialog(
                message: messages.message("timecard-clock-in", fallback: "タイムカードを押しましたか？"),
                confirmLabel: messages.confirmLabel("timecard-clock-in"),
                cancelLabel: messages.cancelLabel("timecard-clock-in"),
                onConfirm: { pending = nil; store.clockIn() },
                onCancel: { pending = nil }
            )
        case .clockOut:
            ConfirmActionDialog(
                message: messages.message("timecard-clock-out", fallback: "タイムカードを押しましたか？"),
                confirmLabel: messages.confirmLabel("timecard-clock-out"),
                cancelLabel: messages.cancelLabel("timecard-clock-out"),
                onConfirm: { pending = nil; store.clockOut() },
                onCancel: { pending = nil }
            )
        }
    }
}
