import KyoeiCore
import SwiftUI

/// 乗務員モードのホーム: clocks, 出庫/帰庫 and the drill-downs into 運行状況 /
/// 休息状況. Port of components/home-view.tsx.
struct DriverHomeView: View {
    let openMenuItem: (MenuItem) -> Void

    @Environment(ShiftStore.self) private var store
    /// 社長賞: asked at 帰庫 while voting is open and not done yet.
    @State private var awardReminder: AwardStatus?
    @State private var voting = false

    var body: some View {
        Group {
            switch (store.driverScreen, store.shift.mode) {
            case (.driving, .departure):
                DrivingStatusView(onBack: { store.driverScreen = .home }, onOpenEmergencyContacts: { openMenuItem(.emergency) })
            case (.rest, .return):
                RestStatusView(onBack: { store.driverScreen = .home })
            default:
                DriverHomeMain(openMenuItem: openMenuItem)
            }
        }
        .onChange(of: store.shift.mode) { old, new in
            guard old == .departure, new == .return else { return }
            Task {
                if let status = try? await AwardRepository.status(), status.needsReminder { awardReminder = status }
            }
        }
        .overlay {
            if let status = awardReminder {
                ConfirmActionDialog(
                    message: "\(status.title)の投票がまだです。\n\(status.closesOn.month)月\(status.closesOn.day)日まで投票できます。",
                    confirmLabel: "投票する",
                    cancelLabel: "あとで",
                    onConfirm: {
                        awardReminder = nil
                        voting = true
                    },
                    onCancel: { awardReminder = nil }
                )
            }
        }
        .fullScreen(isPresented: $voting) {
            AwardVoteView(onClose: { voting = false })
        }
    }
}

private struct DriverHomeMain: View {
    let openMenuItem: (MenuItem) -> Void

    @Environment(ShiftStore.self) private var store
    @Environment(SettingsStore.self) private var settings
    @Environment(SharedData.self) private var data
    @Environment(InspectionStore.self) private var inspections
    @State private var pending: PendingAction?
    @State private var inspecting = false

    private enum PendingAction: Equatable {
        /// 出庫 before today's 日常点検 (or after one that didn't allow it).
        case inspectionRequired
        case departure(DepartureConfirmation)
        case returnToYard
    }

    private var snapshot: ShiftSnapshot { store.shift }

    var body: some View {
        EverySecond { now in
            let status = DriverHomeStatus(snapshot: snapshot, trips: data.trips, now: now)
            FitHomePage {
                VStack(spacing: 6) {
                    LiveClockCard(parts: formatClock(now, hour12: snapshot.hour12, seconds: false), hour12: snapshot.hour12, onToggleFormat: store.toggleHour12)
                    AccidentStreakBadge(onOpen: { openMenuItem(.accidents) })
                    WeeklyGoalCard()
                }
                LinkedTimeCard(
                    label: linkedLabel,
                    parts: linkedParts(now: now),
                    active: snapshot.mode != .idle,
                    hour12: snapshot.hour12,
                    onToggleFormat: store.toggleHour12
                )
                timerCard(now: now)
                actionButtons(status: status)
            }
            .pageTint(tint)
            .overlay { dialog(status: status, now: now) }
        }
        .fullScreen(isPresented: $inspecting) {
            InspectionFlowView { record in
                inspecting = false
                // Straight on to the 出庫 confirmations when the inspection allows it.
                if let record, record.allowsDeparture {
                    let status = DriverHomeStatus(snapshot: snapshot, trips: data.trips, now: Date())
                    pending = .departure(status.firstConfirmation)
                }
            }
            .environment(inspections)
        }
    }

    private var tint: PageTint {
        switch snapshot.mode {
        case .departure: .working
        case .return: .resting
        case .idle: .none
        }
    }

    private var linkedLabel: String {
        switch snapshot.mode {
        case .idle: "連動表示（待機中）"
        case .departure: "出庫時刻"
        case .return: "出庫可能時刻"
        }
    }

    private func linkedParts(now: Date) -> ClockParts {
        let date: Date = switch snapshot.mode {
        case .idle: now
        case .departure: snapshot.startedAt ?? now
        case .return: snapshot.departableAt ?? now
        }
        return formatClock(date, hour12: snapshot.hour12, seconds: false)
    }

    private func timerCard(now: Date) -> some View {
        // Read inside FitHomePage, where the regular/compact choice is set.
        CompactReader { compact in timerCardBody(now: now, compact: compact) }
    }

    @ViewBuilder private func timerCardBody(now: Date, compact: Bool) -> some View {
        let (label, text, color, finished): (String, String, Color, Bool) = {
            switch snapshot.mode {
            case .idle:
                return ("タイマー", "00:00:00", .mutedForeground, false)
            case .departure:
                let elapsed = snapshot.startedAt.map { now.timeIntervalSince($0) } ?? 0
                return ("運行時間", DurationFormat.clock(elapsed), .primary, false)
            case .return:
                let remaining = snapshot.departableAt.map { $0.timeIntervalSince(now) } ?? 0
                return ("出庫可能時刻まで残り", DurationFormat.clock(remaining), remaining <= 0 ? .destructive : .orange, remaining <= 0)
            }
        }()
        VStack(spacing: 4) {
            // 運行情報 (the drill-down into 運行状況 / 休息状況) lives on the
            // timer card itself, so it costs no extra row on ホーム.
            HStack(spacing: 8) {
                if snapshot.mode == .idle { Spacer(minLength: 0) }
                Label(label, systemImage: "timer")
                    .appFont(16, weight: .bold)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .foregroundStyle(snapshot.mode == .return ? Color.orange : (snapshot.mode == .idle ? Color.mutedForeground : Color.primary))
                Spacer(minLength: 0)
                if snapshot.mode != .idle {
                    Button {
                        store.driverScreen = snapshot.mode == .departure ? .driving : .rest
                    } label: {
                        Label("運行情報", systemImage: "chevron.right")
                            .labelStyle(TrailingIconLabelStyle())
                            .appFont(13, weight: .heavy)
                            .foregroundStyle(Color.primaryForeground)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.primary, in: Capsule())
                            .fixedSize()
                    }
                    .buttonStyle(PressScaleStyle())
                }
            }
            SplitTimerText(text: text, color: color)
            switch snapshot.mode {
            case .return:
                CountdownPicker(selected: snapshot.countdownHours, onSelect: store.setCountdownHours).padding(.top, compact ? 2 : 8)
            case .idle:
                Text("出庫・帰庫ボタンで開始します").appFont(14).foregroundStyle(Color.mutedForeground).padding(.top, compact ? 4 : 12)
            case .departure:
                EmptyView()
            }
            if finished {
                Text("出庫可能時刻になりました").appFont(16, weight: .semibold).foregroundStyle(Color.destructive).padding(.top, 12)
            }
        }
        .frame(maxWidth: .infinity, minHeight: compact ? nil : 140)
        .padding(.horizontal, 16)
        .padding(.vertical, compact ? 10 : 14)
        .card(radius: Radius.card, border: snapshot.mode == .departure ? Color.primary.opacity(0.4) : .border)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func actionButtons(status: DriverHomeStatus) -> some View {
        let departed = snapshot.mode == .departure
        // While departed, reflect the actual trip's kind so the dimmed color stays accurate.
        let isSplit = departed ? snapshot.trip?.splitRestRemaining != nil : status.isSplitRestEligible
        let departColor: Color = isSplit ? .destructive : .brand
        let departForeground: Color = isSplit ? .destructiveForeground : .brandForeground
        HStack(spacing: 12) {
            BigActionButton(
                title: departed ? "出庫中" : (status.isSplitRestEligible ? "分割休息による出庫" : "出庫"),
                systemImage: "rectangle.portrait.and.arrow.right",
                fill: departColor,
                foreground: departForeground,
                dimmed: departed
            ) {
                pending = inspections.canDepartToday ? .departure(status.firstConfirmation) : .inspectionRequired
            }
            .disabled(departed)

            BigActionButton(
                title: snapshot.mode == .return ? "帰庫済み" : "帰庫",
                systemImage: "rectangle.portrait.and.arrow.forward",
                fill: departed ? .secondary : .muted,
                foreground: departed ? .secondaryForeground : .mutedForeground,
                dimmed: !departed
            ) {
                pending = .returnToYard
            }
            .disabled(!departed)
        }
    }

    @ViewBuilder private func dialog(status: DriverHomeStatus, now: Date) -> some View {
        let messages = data.confirmMessages
        switch pending {
        case nil:
            EmptyView()
        case .inspectionRequired:
            ConfirmActionDialog(
                message: inspections.todaysRecords.isEmpty
                    ? "出庫の前に日常点検を行ってください。"
                    : "今日の日常点検で「出庫できない」と記録されています。\n対応のあと、もう一度点検してください。",
                confirmLabel: "日常点検を開始",
                cancelLabel: "閉じる",
                onConfirm: {
                    pending = nil
                    inspecting = true
                },
                onCancel: { pending = nil }
            )
        case .returnToYard:
            ConfirmActionDialog(
                message: messages.message("home-return", fallback: "帰庫を開始しますか？"),
                confirmLabel: messages.confirmLabel("home-return"),
                cancelLabel: messages.cancelLabel("home-return"),
                onConfirm: {
                    pending = nil
                    store.returnToYard(staffMemberID: settings.settings.staffMemberID)
                },
                onCancel: { pending = nil }
            )
        case .departure(let step):
            ConfirmActionDialog(
                message: messages.message(step.messageID, fallback: Self.fallbackMessage(step)),
                confirmLabel: messages.confirmLabel(step.messageID, fallback: Self.fallbackConfirmLabel(step)),
                cancelLabel: messages.cancelLabel(step.messageID),
                onConfirm: { confirm(step, status: status) },
                onCancel: { pending = nil }
            ) {
                if let body = warningBody(step, status: status, messages: messages) {
                    WarningBox(text: body)
                }
            }
            .id(step.messageID)
        }
    }

    private func confirm(_ step: DepartureConfirmation, status: DriverHomeStatus) {
        if let next = status.confirmation(after: step) {
            pending = .departure(next)
            return
        }
        pending = nil
        store.depart(viaSplitRest: step == .splitRestMessage, staffMemberID: settings.settings.staffMemberID)
    }

    private func warningBody(_ step: DepartureConfirmation, status: DriverHomeStatus, messages: ConfirmMessages) -> String? {
        switch step {
        case .departure:
            nil
        case .splitRestOverLimit:
            "今月の分割休息使用回数（\(status.splitRestUsedThisMonth)回）が全運行数（\(status.tripsThisMonth)回）の1/2に達しています。このまま分割休息で出庫すると、上限を超えます。"
        case .splitRestNearFull:
            "あと\(DurationFormat.hoursMinutes(status.remainingToNineHours))で通常の9時間休息が完了します。ここで分割休息として出庫すると、この休息は9時間休息としては扱われません。"
        case .splitRestEscalation:
            "この休息では2分割（合計10時間以上）を満たせません。このまま出庫すると3分割が必要になり、休息の合計が12時間以上になります。"
        case .splitRestMessage:
            messages.message(
                "home-split-rest-body",
                fallback: "分割休息は1回3時間以上とること。\n2分割の場合は合計10時間以上、\n3分割の場合は合計12時間以上になるように休息をとること。"
            )
        }
    }

    private static func fallbackMessage(_ step: DepartureConfirmation) -> String {
        switch step {
        case .departure: "出庫を開始しますか？"
        case .splitRestMessage: "分割休息による出庫"
        default: "本当に分割休息で出庫しますか？"
        }
    }

    private static func fallbackConfirmLabel(_ step: DepartureConfirmation) -> String? {
        switch step {
        case .splitRestOverLimit, .splitRestNearFull, .splitRestEscalation: "分割休息で出庫する"
        default: nil
        }
    }
}

/// The big 出庫/帰庫 (出勤/退勤) buttons.
struct BigActionButton: View {
    let title: String
    let systemImage: String
    let fill: Color
    let foreground: Color
    var dimmed = false
    let action: () -> Void

    @Environment(\.homeCompact) private var compact

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemImage).font(.system(size: 26, weight: .semibold))
                Text(title).appFont(17, weight: .black).italic().multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: compact ? 76 : 92)
            .padding(.horizontal, 14)
            .foregroundStyle(dimmed ? Color.mutedForeground : foreground)
            // The logo's slant (design R01 / L03).
            .background(dimmed ? Color.muted : fill, in: SlantedRectangle(slant: 14))
            .overlay(SlantedRectangle(slant: 14).stroke(dimmed ? Color.border : fill))
        }
        .buttonStyle(PressScaleStyle())
    }
}

struct PressScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.title
            configuration.icon
        }
    }
}

/// Red explanatory box inside a confirmation dialog.
struct WarningBox: View {
    let text: String

    var body: some View {
        StyledTextView(raw: text)
            .appFont(14, weight: .bold)
            .foregroundStyle(Color.destructive)
            .lineSpacing(3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.destructive.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
    }
}
