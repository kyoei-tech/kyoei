import KyoeiCore
import SwiftUI

/// 休息状況: rest timer, 出庫可能時刻 and the legal check card. Port of
/// components/rest-status-view.tsx.
struct RestStatusView: View {
    let onBack: () -> Void

    @Environment(ShiftStore.self) private var store
    @Environment(SharedData.self) private var data

    var body: some View {
        let snapshot = store.shift
        if let returnedAt = snapshot.startedAt, let departableAt = snapshot.departableAt {
            // The 分割休息満了時刻 label only applies while completing the split
            // (3h); picking 9h/33h means taking a full rest instead.
            let completingSplit = snapshot.isSplitRestReturn && snapshot.countdownHours == 3
            let accent: Color = completingSplit ? .destructive : .primary
            EverySecond { now in
                let nowParts = formatClock(now, seconds: false)
                let returnParts = formatClock(returnedAt, seconds: false)
                let departableParts = formatClock(departableAt, seconds: false)
                TabPage {
                    BackHeader(label: "出帰庫", onBack: onBack)

                    VStack(spacing: 2) {
                        DateLine(parts: nowParts)
                        Text(nowParts.time).timerFont(30, weight: .semibold).foregroundStyle(Color.appForeground)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .card()

                    HStack(spacing: 12) {
                        TimeTile(title: "帰庫時刻", parts: returnParts, color: .primary, highlighted: false)
                        TimeTile(title: completingSplit ? "分割休息満了時刻" : "出庫可能時刻", parts: departableParts, color: accent, highlighted: completingSplit)
                    }

                    CountdownPicker(selected: snapshot.countdownHours, onSelect: store.setCountdownHours)
                        .frame(maxWidth: .infinity)

                    VStack(spacing: 4) {
                        if completingSplit {
                            Text("分割休息中").appFont(14, weight: .bold).foregroundStyle(Color.destructive)
                        }
                        Text("休息時間").appFont(16, weight: .bold)
                        Text(DurationFormat.clock(snapshot.restElapsed(at: now))).timerFont(60)
                    }
                    .foregroundStyle(accent)
                    .frame(maxWidth: .infinity, minHeight: 160)
                    .card(radius: Radius.card, border: accent.opacity(0.4))

                    SplitRestRules()

                    LegalCheckCard(trips: data.trips, now: now)
                }
                .pageTint(.resting)
            }
        }
    }
}

private struct TimeTile: View {
    let title: String
    let parts: ClockParts
    let color: Color
    let highlighted: Bool

    var body: some View {
        VStack(spacing: 2) {
            Text(title).appFont(14, weight: .bold)
            Text(parts.time).timerFont(24)
            Text("\(parts.date) \(parts.weekday)").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
        }
        .foregroundStyle(color)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .card(border: highlighted ? color : Color.primary.opacity(0.4), fill: highlighted ? color.opacity(0.1) : .card)
    }
}

private struct SplitRestRules: View {
    var body: some View {
        StyledTextView(raw: "分割休息は1回;;**3時間**;;以上とること。\n2分割の場合は休息期間が合計;;**10時間**;;以上、\n3分割の場合は合計;;**12時間**;;以上になるように休息をとること。")
            .appFont(14)
            .foregroundStyle(Color.appForeground)
            .lineSpacing(4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .card(fill: Color.muted.opacity(0.4))
    }
}

/// 改善基準告示の法定チェック. Port of components/legal-check-card.tsx.
struct LegalCheckCard: View {
    let trips: [TripHistoryEntry]
    let now: Date

    var body: some View {
        let remainingOver14h = LegalLimits.remainingOver14hCount(trips: trips, now: now)
        let usage = LegalLimits.splitRestUsageThisMonth(trips: trips, now: now)
        // 基準は「分割休息の回数 < 当該月の総勤務回数の半分」（月途中は目安）。
        let overHalf = usage.total > 0 && usage.used * 2 >= usage.total
        let holidayAvailable = LegalLimits.canTakeHolidayShift(trips: trips, now: now)

        VStack(alignment: .leading, spacing: 10) {
            Label("法定チェック", systemImage: "checkmark.shield")
                .appFont(14, weight: .bold)
                .foregroundStyle(Color.primary)
            VStack(alignment: .trailing, spacing: 2) {
                row("今月の分割休息使用回数") {
                    (Text("\(usage.used)") + Text(" (分割休息) ").font(.system(size: 12)).foregroundColor(.mutedForeground)
                        + Text("/\(usage.total)") + Text(" (運行数)").font(.system(size: 12)).foregroundColor(.mutedForeground))
                        .timerFont(16)
                        .foregroundStyle(overHalf ? Color.destructive : Color.appForeground)
                }
                Text("（上限：全運行の1/2）")
                    .appFont(12, weight: overHalf ? .bold : .regular)
                    .foregroundStyle(overHalf ? Color.destructive : Color.mutedForeground)
            }
            row("今週あと何回14時間超え運行ができるか") {
                Text("\(remainingOver14h)回").timerFont(16)
            }
            row("今週は休日出勤が可能か") {
                Text(holidayAvailable ? "可能" : "不可")
                    .appFont(14, weight: .bold)
                    .foregroundStyle(holidayAvailable ? Color.secondary : Color.mutedForeground)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .card()
    }

    private func row<Value: View>(_ label: String, @ViewBuilder value: () -> Value) -> some View {
        HStack(spacing: 8) {
            Text(label).appFont(14).foregroundStyle(Color.mutedForeground)
            Spacer(minLength: 4)
            value()
        }
    }
}
