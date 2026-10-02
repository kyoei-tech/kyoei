import KyoeiCore
import SwiftUI

/// 運行状況: live trip timers and the 荷積/荷卸/待機/休憩/走行再開 buttons.
/// Port of components/driving-status-view.tsx.
struct DrivingStatusView: View {
    let onBack: () -> Void
    let onOpenEmergencyContacts: () -> Void

    @Environment(ShiftStore.self) private var store
    @Environment(SharedData.self) private var data
    @Environment(AuthStore.self) private var auth
    @Environment(SettingsStore.self) private var settings
    @Environment(InspectionStore.self) private var inspections
    @State private var pending: Pending?
    /// The driver's own sheets, for this 運行日's 配車表.
    @State private var sheets = RealtimeTable<DispatchSheetRow>(table: "dispatch_sheets") { try await DispatchSheetRepository.fetchMine() }
    @State private var openedSheet: DispatchSheetRow?
    /// For 「赤枠持ち出し中」.
    @State private var plates = RealtimeTable<RedPlateBoardRow>(table: "red_plate_uses") { try await RedPlateRepository.board() }

    private enum Pending: Equatable {
        case category(BreakCategory)
        case resume
    }

    var body: some View {
        if let trip = store.shift.trip, let departedAt = store.shift.startedAt {
            let myPlates = RedPlateBoard.mine(plates.rows, userID: auth.userID)
            EverySecond { now in
                TabPage {
                    // 「赤枠持ち出し中」 sits level with the 出帰庫 button; the
                    // emergency link moves below it then.
                    BackHeader(label: "出帰庫", onBack: onBack) {
                        HStack {
                            Spacer()
                            if myPlates.isEmpty { emergencyButton } else { RedPlateOutBadge(plates: myPlates) }
                        }
                    }
                    if !myPlates.isEmpty {
                        HStack {
                            Spacer()
                            emergencyButton
                        }
                    }
                    if let sheet = TripDispatchSheet.sheet(departedAt: departedAt, in: sheets.rows) {
                        dispatchSheetButton(sheet)
                    }
                    content(trip: trip, departedAt: departedAt, now: now)
                }
                .pageTint(.working)
                .overlay { dialog(trip: trip, now: now) }
            }
            .syncing(sheets)
            .syncing(plates)
            .fullScreen(item: $openedSheet) { sheet in
                DispatchSheetDetail(sheet: sheet, backLabel: "運行情報へ戻る") { openedSheet = nil }
                    .backButtonHost()
                    .background(Color.appBackground.ignoresSafeArea())
                    .environment(auth)
                    .environment(settings)
                    .environment(inspections)
            }
        }
    }

    private var emergencyButton: some View {
        Button(action: onOpenEmergencyContacts) {
            Label("事故/トラブルの時は", systemImage: "exclamationmark.triangle")
                .appFont(12, weight: .semibold)
                .foregroundStyle(Color.destructive)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.destructive.opacity(0.1), in: Capsule())
                .overlay(Capsule().stroke(Color.destructive.opacity(0.3)))
        }
        .buttonStyle(.plain)
    }

    /// Shown only when this 運行日's sheet has been uploaded (and read):
    /// opens it directly, not the list.
    private func dispatchSheetButton(_ sheet: DispatchSheetRow) -> some View {
        Button { openedSheet = sheet } label: {
            HStack(spacing: 10) {
                Image(systemName: "doc.text.fill").font(.system(size: 18, weight: .bold))
                VStack(alignment: .leading, spacing: 1) {
                    Text("配車表").appFont(16, weight: .black).italic()
                    Text(sheet.title).appFont(12, weight: .semibold).opacity(0.85)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.system(size: 14, weight: .heavy))
            }
            .foregroundStyle(Color.brandForeground)
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
            .background(Color.brand, in: SlantedRectangle(slant: 10))
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityHint("今日の運行の配車表を開きます")
    }

    @ViewBuilder private func content(trip: TripState, departedAt: Date, now: Date) -> some View {
        let driving = now.timeIntervalSince(departedAt)
        let continuous = trip.liveContinuousDriving(at: now)
        let breakTimer = trip.liveBreakTimer(at: now)
        // 拘束時間: 12h超でオレンジ、13h超で赤、15h超で赤背景（改善基準告示の目安）。
        let over15 = driving >= TripLimits.fifteenHours
        let drivingColor: Color = over15 ? .destructiveForeground
            : driving >= TripLimits.thirteenHours ? .destructive
            : driving >= TripLimits.twelveHours ? .orange
            : .primary
        let continuousOver = continuous >= TripLimits.threeHours30
        let departure = formatClock(departedAt, seconds: false)

        HStack(spacing: 10) {
            StatTile(title: "出庫時刻", value: departure.time, caption: "\(departure.date) \(departure.weekday)", color: .primary)
            StatTile(
                title: "運行時間",
                value: DurationFormat.clock(driving),
                caption: trip.splitRestRemaining != nil ? "分割休息による運行中" : nil,
                color: drivingColor,
                captionColor: over15 ? .destructiveForeground : .destructive,
                fill: over15 ? .destructive : .card
            )
        }

        TimerRow(title: "連続走行時間", value: DurationFormat.clock(continuous), color: continuousOver ? .destructive : .primary) {
            if continuousOver {
                let minutes = Int((max(0, TripLimits.fourHours - continuous) / 60).rounded(.up))
                Text("\(minutes)分以内に休憩して下さい")
                    .appFont(14, weight: .bold)
                    .foregroundStyle(Color.destructive)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }

        if trip.activeCategory != .driving {
            TimerRow(
                title: "\(trip.activeCategory.buttonLabel) 経過時間",
                value: DurationFormat.clock(max(0, now.timeIntervalSince(trip.segmentStartedAt))),
                color: .primary
            ) { EmptyView() }
        }

        let breakOrange = breakTimer > 0 && breakTimer < TripLimits.thirtyMinutes
        TimerRow(title: "累計休憩時間", value: DurationFormat.clock(breakTimer), color: breakOrange ? .orange : .primary) { EmptyView() }

        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
            ForEach(ActiveCategory.allCases, id: \.self) { category in
                MiniStat(title: category.totalLabel, value: DurationFormat.hoursMinutes(trip.liveDuration(of: category, at: now)), color: .appForeground)
            }
            if let remaining = trip.splitRestRemaining {
                MiniStat(title: "要休息時間", value: DurationFormat.hoursMinutes(remaining), color: .destructive)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .card(border: Color.primary.opacity(0.4))

        HStack(spacing: 10) {
            ForEach(BreakCategory.allCases, id: \.self) { category in
                let active = trip.activeCategory == ActiveCategory(category)
                let dimmed = !active && trip.activeCategory != .driving
                Button {
                    pending = .category(category)
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: category.systemImage).font(.system(size: 22, weight: .semibold))
                        Text(active ? "\(category.label)中" : category.label).appFont(14, weight: .semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(active ? Color.secondaryForeground : (dimmed ? Color.mutedForeground : Color.appForeground))
                    .card(border: active ? .secondary : Color.border, fill: active ? .secondary : .card)
                    .opacity(dimmed ? 0.6 : 1)
                }
                .buttonStyle(PressScaleStyle())
                .disabled(active)
            }
        }

        let isDriving = trip.activeCategory == .driving
        Button {
            pending = .resume
        } label: {
            Text(isDriving ? "走行中" : "走行再開")
                .appFont(18, weight: .bold)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(isDriving ? Color.mutedForeground : .white)
                .card(border: isDriving ? Color.border : .restingBand, fill: isDriving ? .card : .restingBand)
                .opacity(isDriving ? 0.6 : 1)
        }
        .buttonStyle(PressScaleStyle())
        .disabled(isDriving)
    }

    @ViewBuilder private func dialog(trip: TripState, now: Date) -> some View {
        let messages = data.confirmMessages
        switch pending {
        case nil:
            EmptyView()
        case .category(let category):
            let id = "driving-category-\(category.rawValue)"
            ConfirmActionDialog(
                message: messages.message(id, fallback: "\(category.label)を開始しますか？"),
                confirmLabel: messages.confirmLabel(id),
                cancelLabel: messages.cancelLabel(id),
                onConfirm: {
                    pending = nil
                    store.tapBreak(category)
                },
                onCancel: { pending = nil }
            )
        case .resume:
            let breakTimer = trip.liveBreakTimer(at: now)
            ConfirmActionDialog(
                message: messages.message("driving-resume", fallback: "走行再開を開始しますか？"),
                confirmLabel: messages.confirmLabel("driving-resume"),
                cancelLabel: messages.cancelLabel("driving-resume"),
                onConfirm: {
                    pending = nil
                    store.resumeDriving()
                },
                onCancel: { pending = nil }
            ) {
                if !trip.breakSatisfied && breakTimer < TripLimits.tenMinutes {
                    WarningBox(text: "まだ休憩が10分未満です（現在\(DurationFormat.clock(breakTimer))）。このまま再開すると、この休憩は累計休憩時間にカウントされません。もう少し休憩しますか？")
                }
            }
        }
    }
}

private struct StatTile: View {
    let title: String
    let value: String
    var caption: String?
    let color: Color
    var captionColor: Color = .mutedForeground
    var fill: Color = .card

    var body: some View {
        VStack(spacing: 2) {
            Text(title).appFont(14, weight: .bold).foregroundStyle(color)
            Text(value).timerFont(24).foregroundStyle(color)
            if let caption {
                Text(caption).appFont(12, weight: captionColor == .mutedForeground ? .medium : .bold).foregroundStyle(captionColor)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .card(border: fill == .card ? Color.primary.opacity(0.4) : fill, fill: fill)
    }
}

private struct TimerRow<Footer: View>: View {
    let title: String
    let value: String
    let color: Color
    @ViewBuilder var footer: Footer

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Text(title).appFont(14, weight: .bold)
                Spacer()
                Text(value).timerFont(24)
            }
            .foregroundStyle(color)
            footer
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .card(border: Color.primary.opacity(0.4))
    }
}

private struct MiniStat: View {
    let title: String
    let value: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(title).appFont(12).foregroundStyle(Color.mutedForeground)
            Text(value).timerFont(16, weight: .semibold).foregroundStyle(color)
        }
    }
}

extension BreakCategory {
    var label: String {
        switch self {
        case .loading: "荷積"
        case .unloading: "荷卸"
        case .waiting: "待機"
        case .resting: "休憩"
        }
    }

    var systemImage: String {
        switch self {
        case .loading: "car.side.arrowtriangle.up"
        case .unloading: "car.side.arrowtriangle.down"
        case .waiting: "shippingbox"
        case .resting: "cup.and.saucer"
        }
    }
}

extension ActiveCategory {
    var totalLabel: String {
        switch self {
        case .driving: "走行時間"
        case .loading: "荷積時間"
        case .unloading: "荷降時間"
        case .waiting: "待機時間"
        case .resting: "休憩時間"
        }
    }

    var buttonLabel: String {
        switch self {
        case .driving: "走行"
        case .loading: "荷積"
        case .unloading: "荷卸"
        case .waiting: "待機"
        case .resting: "休憩"
        }
    }
}
