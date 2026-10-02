import KyoeiCore
import PDFKit
import SwiftUI

// 配車表の表示: 回戦まとめ (where to load, where to go, what, how soon) and
// 1台詳細 (one PDF row per card), with the 車台番号 camera check button at
// the top of both. Design: canvas "B1 採用案" — 照合済 is a green
// 「✓ 車台番号 照合済」 label, 未照合 a filled orange 「車台番号 未照合」.

extension Color {
    /// 未照合. Deliberately stronger than the amber 卸日 chips; white text on it is ~5:1.
    static let chassisUnchecked = Color(light: 0xC2410C, dark: 0xC2410C)
    static let chassisUncheckedSoft = Color(light: 0xFFEDD5, dark: 0x3A1A0A)
    static let chassisUncheckedText = Color(light: 0x9A3412, dark: 0xFDBA74)
}

/// One sheet: parse status, the two parsed views, and the original PDF.
struct DispatchSheetDetail: View {
    let sheet: DispatchSheetRow
    var backLabel = "一覧へ戻る"
    let onBack: () -> Void

    /// Left to right: 1台詳細, 回戦まとめ, 原本.
    enum Tab: String, CaseIterable, Identifiable {
        case vehicles = "1台詳細"
        case summary = "回戦まとめ"
        case original = "原本"
        var id: String { rawValue }
    }

    @State private var content: DispatchSheetContent?
    @State private var loadFailed = false
    @State private var checks: RealtimeTable<ChassisCheckRow>
    @State private var acknowledgments: RealtimeTable<BlankAcknowledgmentRow>
    @State private var tab: Tab = .summary
    @State private var scan: ScanRequest?
    @State private var reparsing = false
    @State private var message: String?
    @Environment(SettingsStore.self) private var settings
    @Environment(AuthStore.self) private var auth
    @Environment(PickupStore.self) private var pickupStore
    /// 引取不可: the form for one car, or one request's detail.
    @State private var pickupTarget: PickupTarget?
    @State private var openPickup: PickupFailure?
    /// 荷姿 records of this sheet, by 回戦.
    @State private var packings: [PackingRecord] = []
    @State private var packing: PackingTarget?
    /// 回戦 that just became all 照合済, asked about once the camera closes.
    @State private var packingPrompts: [DispatchRound] = []
    /// 「○○と○○は同じ場所ですか？」 answers (the driver's own, every sheet).
    @State private var placeAnswers = RealtimeTable<PlaceAliasRow>(table: "dispatch_place_aliases") {
        try await DispatchSheetRepository.fetchPlaceAliases()
    }
    /// Pairs answered in this session, hidden before the table refreshes.
    @State private var answeredHere: Set<PlacePair> = []

    init(sheet: DispatchSheetRow, backLabel: String = "一覧へ戻る", onBack: @escaping () -> Void) {
        self.sheet = sheet
        self.backLabel = backLabel
        self.onBack = onBack
        let sheetID = sheet.id
        _checks = State(initialValue: RealtimeTable(table: "dispatch_chassis_checks") {
            try await DispatchSheetRepository.fetchChecks(sheetID: sheetID)
        })
        _acknowledgments = State(initialValue: RealtimeTable(table: "dispatch_blank_acknowledgments") {
            try await DispatchSheetRepository.fetchBlankAcknowledgments(sheetID: sheetID)
        })
    }

    private var checkIndex: ChassisChecks { ChassisChecks(checks.rows) }
    private var chassisState: SheetChassisState {
        SheetChassisState(checks: checkIndex, acknowledgments: acknowledgments.rows, pickups: PickupFailures(pickupStore.mine, sheetID: sheet.id))
    }

    private var placeAliases: PlaceAliases {
        PlaceAliases(placeAnswers.rows, order: content.map(PlaceNames.places(in:)) ?? [])
    }

    /// The next 似た名前の場所 to ask about (after the table has loaded once).
    private var placeQuestion: PlacePair? {
        guard let content, !placeAnswers.isLoading, placeAnswers.error == nil else { return nil }
        return PlaceNames.unansweredPairs(in: content, answers: placeAnswers.rows).first { !answeredHere.contains($0) }
    }

    var body: some View {
        VStack(spacing: 8) {
            BackHeader(label: backLabel, variant: .subtle, onBack: onBack)
                .padding(.horizontal, 16)
            heading.padding(.horizontal, 16)
            Picker("表示", selection: $tab) {
                ForEach(Tab.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)

            if tab == .original {
                DispatchSheetOriginal(sheet: sheet)
            } else if let content {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        scanButton
                        if let message {
                            Text(message).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                        }
                        if !content.warnings.isEmpty {
                            SheetWarnings(content: content) { tab = .original }
                        }
                        if tab == .summary {
                            DispatchSummaryList(content: content, state: chassisState, aliases: placeAliases, packed: Set(packings.map(\.round)), onPacking: openPacking)
                        } else {
                            DispatchVehicleList(content: content, state: chassisState, actions: cardActions)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                    .frame(maxWidth: 448)
                    .frame(maxWidth: .infinity)
                }
            } else {
                unparsed
            }
        }
        .syncing(checks)
        .syncing(acknowledgments)
        .syncing(placeAnswers)
        // Reload whenever the list row says the parse result changed
        // (Realtime on dispatch_sheets updates `sheet`).
        .task(id: "\(sheet.id)|\(sheet.statusLabel)") { await loadContent() }
        .task(id: sheet.id) { await loadPackings() }
        .task(id: sheet.id) { await pickupStore.refreshMine() }
        .fullScreen(item: $pickupTarget) { target in
            PickupRequestView(target: target) { pickupTarget = nil }
        }
        .sheet(item: $openPickup) { record in
            PickupDetailView(record: record) { openPickup = nil }
        }
        #if DEBUG
        .onAppear {
            switch DebugShot.sub {
            case "vehicles": tab = .vehicles
            case "original": tab = .original
            case "voice", "camera": scan = ScanRequest(target: nil)
            default: break
            }
        }
        #endif
        .fullScreen(item: $packing) { target in
            PackingEditorView(target: target) { _ in
                packing = nil
                Task { await loadPackings() }
            }
        }
        .overlay {
            if scan == nil, packing == nil, packingPrompts.isEmpty, let pair = placeQuestion {
                ConfirmActionDialog(
                    message: "「\(pair.first)」と「\(pair.second)」は同じ場所ですか？",
                    confirmLabel: "同じ場所",
                    cancelLabel: "違う場所",
                    onConfirm: { answerPlace(pair, same: true) },
                    onCancel: { answerPlace(pair, same: false) }
                ) {
                    Text("同じ場所なら、回戦まとめで1つの場所としてまとめて表示します。この答えは次の配車表からも使われます。")
                        .appFont(13).foregroundStyle(Color.mutedForeground)
                        .multilineTextAlignment(.center)
                }
                .id(pair.id)
            }
        }
        .overlay {
            if scan == nil, packing == nil, let round = packingPrompts.first {
                ConfirmActionDialog(
                    message: "\(round.title)の照合が終わりました。\n荷姿を記録しますか？",
                    confirmLabel: "記録する",
                    cancelLabel: "あとで",
                    onConfirm: {
                        packingPrompts.removeFirst()
                        openPacking(round)
                    },
                    onCancel: { packingPrompts.removeFirst() }
                )
                .id(round.id)
            }
        }
        .fullScreen(item: $scan) { request in
            if let content {
                ChassisScanFlow(
                    vehicles: content.vehicles,
                    target: request.target,
                    state: chassisState,
                    onConfirm: { vehicle, read, method, input, photo in record(vehicle, read: read, method: method, input: input, photo: photo) },
                    onClose: { scan = nil }
                )
            }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(sheet.title).appFont(18, weight: .bold).foregroundStyle(Color.appForeground)
            if let content {
                let progress = chassisState.progress(content.vehicles)
                Text([
                    "\(content.vehicles.count)台",
                    content.vehicleNumber.map { "\($0)号車" },
                    content.dispatchNumber.map { "配車番号 \($0)" },
                    "照合 \(progress.checked)/\(progress.total)",
                ].compactMap { $0 }.joined(separator: " ・ "))
                .appFont(12).foregroundStyle(Color.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var scanButton: some View {
        Button { scan = ScanRequest(target: nil) } label: {
            Label("車台番号をカメラで照合", systemImage: "camera.viewfinder")
                .appFont(16, weight: .black)
                .italic()
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(Color.brandForeground)
                .background(Color.brand, in: SlantedRectangle(slant: 10))
        }
        .buttonStyle(PressScaleStyle())
    }

    @ViewBuilder private var unparsed: some View {
        VStack(spacing: 12) {
            switch sheet.parseStatus {
            case .failed:
                EmptyStateBox(text: "この配車表は読み取れませんでした。原本で確認してください。", verticalPadding: 24)
                reparseButton
            case .pending:
                ProgressView("配車表を読み取っています…").appFont(14)
                reparseButton
            case .parsed:
                if loadFailed {
                    EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。", verticalPadding: 24)
                } else {
                    ProgressView()
                }
            }
            Button("原本を見る") { tab = .original }
                .buttonStyle(PillButtonStyle(kind: .outline))
            Spacer()
        }
        .padding(16)
    }

    private var reparseButton: some View {
        Button {
            reparsing = true
            Task {
                defer { reparsing = false }
                do {
                    try await DispatchSheetRepository.parse(sheetID: sheet.id)
                    await loadContent()
                } catch {
                    message = "読み取りに失敗しました。通信状況を確認して、もう一度お試しください。"
                }
            }
        } label: {
            Label(reparsing ? "読み取り中…" : "もう一度読み取る", systemImage: "arrow.clockwise")
        }
        .buttonStyle(PillButtonStyle(kind: .secondary))
        .disabled(reparsing)
    }

    private func loadContent() async {
        guard sheet.isParsed else { return }
        do {
            content = try await DispatchSheetRepository.fetchDetail(id: sheet.id).extracted_data
            loadFailed = content == nil
        } catch is CancellationError {
        } catch {
            loadFailed = true
        }
    }

    private func answerPlace(_ pair: PlacePair, same: Bool) {
        answeredHere.insert(pair)
        Task {
            do {
                try await DispatchSheetRepository.answerPlaceAlias(PlaceAliasInsert(pair, same: same))
            } catch {
                message = "「同じ場所」の答えを保存できませんでした。通信状況を確認してください。"
            }
            await placeAnswers.refresh()
        }
    }

    private func loadPackings() async {
        if let fresh = try? await PackingRepository.fetch(sheetID: sheet.id) { packings = fresh }
    }

    private func openPacking(_ round: DispatchRound) {
        packing = PackingTarget(sheetID: sheet.id, sheetTitle: sheet.title, round: round, existing: packings.first { $0.round == round.round })
    }

    /// 照合 of a printed number, or 記録 of `read` for a blank 車体番号. A 記録
    /// keeps its photo, and so does a voice 照合 that followed an unreadable
    /// shot; a camera 照合's photo is never uploaded.
    private func record(_ vehicle: DispatchVehicle, read: String, method: ChassisCheckMethod, input: ChassisInput, photo: Data?) {
        let before = checkIndex
        let userID = auth.userID
        Task {
            defer { promptPacking(before: before) }
            do {
                var photoPath: String?
                if vehicle.needsRecording || input == .voice, let photo, let userID, let jpeg = ImageEncoding.jpeg(from: photo, maxDimension: 1600) {
                    photoPath = try? await AttachmentStore.shared.upload(jpeg, filename: "chassis.jpg", to: .chassisPhotos, folder: userID)
                }
                try await DispatchSheetRepository.recordCheck(ChassisCheckInsert(sheetID: sheet.id, vehicle: vehicle, read: read, method: method, input: input, photoPath: photoPath))
                message = nil
            } catch {
                message = vehicle.needsRecording
                    ? "車体番号を記録できませんでした。同じ番号を別の車に記録していないか、通信状況を確認してください。"
                    : "照合結果を保存できませんでした。通信状況を確認してください。"
            }
            await checks.refresh()
        }
    }

    /// Queues the 荷姿 question for 回戦 this check completed (設定 can turn it off).
    private func promptPacking(before: ChassisChecks) {
        guard settings.settings.packingPrompt, let content else { return }
        let packed = Set(packings.map(\.round))
        for round in PackingPrompt.newlyCompleted(rounds: content.rounds, before: before, after: checkIndex, excluding: chassisState.pickups.notPickedUp)
        where !packed.contains(round.round) && !packingPrompts.contains(where: { $0.id == round.id }) {
            packingPrompts.append(round)
        }
    }

    private var cardActions: VehicleCardActions {
        VehicleCardActions(
            scan: { scan = ScanRequest(target: $0) },
            uncheck: uncheck,
            acknowledgeBlank: acknowledgeBlank,
            removeAcknowledgment: removeAcknowledgment,
            showOriginal: { tab = .original },
            requestPickup: { pickupTarget = PickupTarget(sheet: sheet, vehicle: $0) },
            openPickup: { openPickup = $0 }
        )
    }

    private func acknowledgeBlank(_ vehicle: DispatchVehicle) {
        Task {
            do {
                try await DispatchSheetRepository.acknowledgeBlank(BlankAcknowledgmentInsert(sheetID: sheet.id, vehicle: vehicle))
                message = nil
            } catch {
                message = "確認を保存できませんでした。通信状況を確認してください。"
            }
            await acknowledgments.refresh()
        }
    }

    private func removeAcknowledgment(_ ack: BlankAcknowledgmentRow) {
        Task {
            do {
                try await DispatchSheetRepository.removeBlankAcknowledgment(id: ack.id)
            } catch {
                message = "取り消せませんでした。もう一度お試しください。"
            }
            await acknowledgments.refresh()
        }
    }

    private func uncheck(_ check: ChassisCheckRow) {
        Task {
            do {
                try await DispatchSheetRepository.removeCheck(id: check.id)
            } catch {
                message = "取り消せませんでした。もう一度お試しください。"
            }
            await checks.refresh()
        }
    }
}

struct ScanRequest: Identifiable {
    let id = UUID()
    /// The vehicle whose 未照合 badge was tapped, if any.
    let target: DispatchVehicle?
}

// MARK: - 回戦まとめ

/// A sheet's 照合/記録 rows and 空欄の確認, looked up per vehicle.
struct SheetChassisState {
    let checks: ChassisChecks
    let acknowledgments: [BlankAcknowledgmentRow]
    /// 引取不可 per car; approved ones are left out of the 照合 counts.
    var pickups = PickupFailures()

    func status(of vehicle: DispatchVehicle) -> ChassisStatus {
        .of(vehicle, checks: checks, acknowledgments: acknowledgments)
    }

    func progress(_ vehicles: [DispatchVehicle]) -> ChassisCheckProgress {
        ChassisCheckProgress(vehicles: vehicles, checks: checks, excluding: pickups.notPickedUp)
    }

    func reviewCount(_ vehicles: [DispatchVehicle]) -> Int {
        vehicles.needingReview(checks: checks, acknowledgments: acknowledgments).count
    }
}

private struct DispatchSummaryList: View {
    let content: DispatchSheetContent
    let state: SheetChassisState
    /// 似た名前の場所 answered as the same place are one route.
    let aliases: PlaceAliases
    /// 回戦 with a 荷姿 record.
    let packed: Set<String>
    let onPacking: (DispatchRound) -> Void

    var body: some View {
        let today = LocalDate(Date())
        ForEach(content.rounds) { round in
            let routes = round.routes(aliases: aliases)
            let earliest = routes.compactMap { $0.earliestDropoff(today: today) }.min()
            let review = state.reviewCount(round.vehicles)
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(round.title) ・ \(round.vehicles.count)台").appFont(17, weight: .black)
                    if review > 0 { ReviewChip(text: "要確認 \(review)台") }
                    Spacer(minLength: 4)
                    if let earliest, earliest.urgency <= .tomorrow {
                        DueChip(prefix: "直近の期限", due: earliest, condition: nil, solid: true)
                    }
                }
                ChassisProgressChips(progress: state.progress(round.vehicles))
                ForEach(routes) { route in
                    RouteBlock(route: route, today: today, state: state)
                }
                let done = packed.contains(round.round)
                Button { onPacking(round) } label: {
                    Label(done ? "荷姿 記録済み（編集）" : "荷姿を記録", systemImage: done ? "checkmark.circle.fill" : "shippingbox")
                        .appFont(14, weight: .bold)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .foregroundStyle(done ? Color.primary : Color.appForeground)
                        .background(done ? Color.primary.opacity(0.12) : Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(done ? Color.primary.opacity(0.5) : Color.border))
                }
                .buttonStyle(.plain)
            }
            .padding(14)
            .card(radius: 18, border: earliest.map { $0.isUrgent } == true ? .destructive : .border)
        }
    }
}

private struct RouteBlock: View {
    let route: DispatchRoute
    let today: LocalDate
    let state: SheetChassisState

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            RouteLine(pickup: route.pickup, dropoff: route.dropoff)
            HStack {
                Text("\(route.vehicles.count)台").appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
                Spacer()
                if let due = route.earliestDropoff(today: today) {
                    DueChip(prefix: "卸", due: due, condition: nil)
                } else {
                    Chip(text: "卸 指定なし", style: .gray)
                }
            }
            Divider()
            ForEach(route.vehicles) { vehicle in
                SummaryVehicleRow(vehicle: vehicle, status: state.status(of: vehicle), pickup: state.pickups.record(for: vehicle))
            }
        }
        .padding(10)
        .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
    }
}

/// Name over the full 車体番号 (never abbreviated), badge on the right. A
/// blank number not yet confirmed is shaded red with 要確認.
private struct SummaryVehicleRow: View {
    let vehicle: DispatchVehicle
    let status: ChassisStatus
    let pickup: PickupFailure?

    var body: some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 1) {
                Text(vehicle.vehicleName).appFont(13, weight: .bold).foregroundStyle(Color.appForeground)
                switch status {
                case .blankNeedsReview:
                    Text("車体番号 空欄").appFont(12, weight: .heavy).foregroundStyle(Color.destructive)
                case .blankConfirmed:
                    Text("車体番号 空欄・確認済").appFont(12).foregroundStyle(Color.mutedForeground)
                case .done(let check):
                    ChassisNumberText(chassis: check.isRecorded ? check.chassis_number : vehicle.chassisNumber, compact: true)
                case .unmatched:
                    ChassisNumberText(chassis: vehicle.chassisNumber, compact: true)
                }
            }
            Spacer(minLength: 4)
            if let pickup, pickup.status != .resolved {
                PickupChip(status: pickup.status)
            } else {
                switch status {
                case .blankNeedsReview: ReviewChip(text: "要確認")
                case .blankConfirmed: ChassisBadge(kind: .record, isDone: false)
                case .done: ChassisBadge(kind: vehicle.needsRecording ? .record : .match, isDone: true)
                case .unmatched: ChassisBadge(kind: .match, isDone: false)
                }
            }
        }
        .padding(.vertical, status.needsReview ? 6 : 2)
        .padding(.horizontal, status.needsReview ? 6 : 0)
        .background(status.needsReview ? Color.destructive.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, status.needsReview ? -6 : 0)
        .accessibilityElement(children: .combine)
    }
}

/// 「引取不可 申請中」 (orange outline) / 「引取不可」 (filled red).
private struct PickupChip: View {
    let status: PickupStatus

    var body: some View {
        let approved = status == .approved
        Label(approved ? "引取不可" : "引取不可 申請中", systemImage: "xmark.octagon.fill")
            .labelStyle(.titleAndIcon)
            .appFont(12, weight: .black)
            .foregroundStyle(approved ? Color.destructiveForeground : Color.chassisUncheckedText)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(approved ? Color.destructive : Color.chassisUncheckedSoft, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(approved ? .clear : Color.chassisUnchecked, lineWidth: 1.5))
            .fixedSize()
    }
}

/// Red 「⚠ 要確認」.
private struct ReviewChip: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
            .labelStyle(.titleAndIcon)
            .appFont(12, weight: .black)
            .foregroundStyle(Color.destructiveForeground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color.destructive, in: RoundedRectangle(cornerRadius: 6))
            .fixedSize()
    }
}

// MARK: - 1台詳細

private struct DispatchVehicleList: View {
    let content: DispatchSheetContent
    let state: SheetChassisState
    let actions: VehicleCardActions

    var body: some View {
        let today = LocalDate(Date())
        ForEach(content.rounds) { round in
            let review = state.reviewCount(round.vehicles)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("\(round.title) ・ \(round.vehicles.count)台").appFont(15, weight: .black)
                    if review > 0 { ReviewChip(text: "要確認 \(review)台") }
                    Spacer()
                }
                ChassisProgressChips(progress: state.progress(round.vehicles))
                ForEach(round.vehicles) { vehicle in
                    VehicleCard(vehicle: vehicle, status: state.status(of: vehicle), pickup: state.pickups.record(for: vehicle), today: today, actions: actions)
                }
            }
            .padding(.top, 4)
        }
    }
}

struct VehicleCardActions {
    let scan: (DispatchVehicle) -> Void
    let uncheck: (ChassisCheckRow) -> Void
    let acknowledgeBlank: (DispatchVehicle) -> Void
    let removeAcknowledgment: (BlankAcknowledgmentRow) -> Void
    let showOriginal: () -> Void
    /// 引取不可: open the form for a car, or an existing request.
    let requestPickup: (DispatchVehicle) -> Void
    let openPickup: (PickupFailure) -> Void
}

private struct VehicleCard: View {
    let vehicle: DispatchVehicle
    let status: ChassisStatus
    let pickup: PickupFailure?
    let today: LocalDate
    let actions: VehicleCardActions

    @Environment(\.openURL) private var openURL

    private var check: ChassisCheckRow? {
        if case .done(let check) = status { return check }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Text(vehicle.vehicleName.isEmpty ? "（品名なし）" : vehicle.vehicleName)
                    .appFont(22, weight: .black).foregroundStyle(Color.appForeground)
                Spacer(minLength: 4)
                badge
            }
            chassisSection
            VStack(alignment: .leading, spacing: 6) {
                PlaceRow(label: "積", place: vehicle.pickup, ref: vehicle.pickupRef)
                PlaceRow(label: "降", place: vehicle.dropoff, ref: vehicle.dropoffRef)
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
            dates
            if !vehicle.alerts.isEmpty || !vehicle.notes.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    if !vehicle.alerts.isEmpty {
                        FlowChips(texts: vehicle.alerts, style: .amber)
                    }
                    if !vehicle.notes.isEmpty {
                        Text(vehicle.notes).appFont(12, weight: .bold).foregroundStyle(Color.appForeground)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.secondary.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            }
            ForEach(vehicle.phones, id: \.self) { phone in
                if let url = telURL(phone) {
                    Button { openURL(url) } label: {
                        Label(phone, systemImage: "phone.fill").appFont(14, weight: .bold)
                    }
                    .buttonStyle(PillButtonStyle(kind: .outline))
                }
            }
            meta
            if !vehicle.warnings.isEmpty {
                Button(action: actions.showOriginal) {
                    HStack(alignment: .top, spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                        Text("要確認：\(vehicle.warnings.joined(separator: "、"))。原本で確認してください。")
                            .multilineTextAlignment(.leading)
                    }
                    .appFont(12, weight: .bold)
                    .foregroundStyle(Color.destructive)
                }
                .buttonStyle(.plain)
            }
            pickupSection
        }
        .padding(14)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 18))
        // 未照合・未記録: an orange bar down the left edge.
        .overlay(alignment: .leading) {
            if check == nil && pickup?.status != .approved {
                UnevenRoundedRectangle(topLeadingRadius: 18, bottomLeadingRadius: 18)
                    .fill(Color.chassisUnchecked)
                    .frame(width: 5)
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(check == nil ? Color.border : Color.primary, lineWidth: check == nil ? 1 : 2)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .contextMenu {
            switch status {
            case .done(let check):
                Button(check.isRecorded ? "記録を取り消す" : "照合を取り消す", systemImage: "arrow.uturn.backward", role: .destructive) { actions.uncheck(check) }
            case .blankConfirmed(let ack):
                Button("空欄の確認を取り消す", systemImage: "arrow.uturn.backward", role: .destructive) { actions.removeAcknowledgment(ack) }
            case .unmatched, .blankNeedsReview:
                EmptyView()
            }
        }
    }

    /// 引取不可: the request's state, or the button to start one.
    @ViewBuilder private var pickupSection: some View {
        if let pickup, pickup.status != .resolved {
            let approved = pickup.status == .approved
            Button { actions.openPickup(pickup) } label: {
                HStack(spacing: 10) {
                    Image(systemName: "xmark.octagon.fill").font(.system(size: 20, weight: .bold))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(approved ? "引取不可（承認済み）" : "引取不可 申請中").appFont(15, weight: .black)
                        Text(approved ? "\(pickup.approved_by_name ?? "")さんが承認 ・ \(pickup.reason.label)" : (pickup.waitingLine ?? ""))
                            .appFont(12, weight: .bold).multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                }
                .foregroundStyle(approved ? Color.destructive : Color.chassisUncheckedText)
                .padding(12)
                .background((approved ? Color.destructive : Color.chassisUnchecked).opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(approved ? Color.destructive : Color.chassisUnchecked, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
        } else {
            if let pickup {
                Button { actions.openPickup(pickup) } label: {
                    Label("引取不可 → 解決済み（通常どおり輸送）", systemImage: "checkmark.circle")
                        .appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
                }
                .buttonStyle(.plain)
            }
            Button { actions.requestPickup(vehicle) } label: {
                Label("引取不可", systemImage: "xmark.octagon")
                    .appFont(14, weight: .bold)
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .foregroundStyle(Color.destructive)
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.destructive.opacity(0.6), lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .accessibilityHint("積地で引き取れなかったことを、理由と写真を付けて役職者に承認してもらいます")
        }
    }

    @ViewBuilder private var badge: some View {
        if pickup?.status == .approved {
            Label("引取不可", systemImage: "xmark.octagon.fill")
                .appFont(12, weight: .black)
                .foregroundStyle(Color.destructiveForeground)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color.destructive, in: RoundedRectangle(cornerRadius: 6))
        } else {
            chassisBadge
        }
    }

    @ViewBuilder private var chassisBadge: some View {
        switch status {
        case .unmatched:
            Button { actions.scan(vehicle) } label: { ChassisBadge(kind: .match, isDone: false) }
                .buttonStyle(PressScaleStyle())
                .accessibilityHint("カメラで車台番号を照合します")
        case .blankNeedsReview:
            ReviewChip(text: "要確認")
        case .blankConfirmed:
            Button { actions.scan(vehicle) } label: { ChassisBadge(kind: .record, isDone: false) }
                .buttonStyle(PressScaleStyle())
                .accessibilityHint("カメラで車体番号を記録します")
        case .done:
            ChassisBadge(kind: vehicle.needsRecording ? .record : .match, isDone: true)
        }
    }

    @ViewBuilder private var chassisSection: some View {
        switch status {
        case .unmatched:
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                ChassisNumberText(chassis: vehicle.chassisNumber)
                Spacer(minLength: 4)
                Text("バッジをタップで照合").appFont(11, weight: .bold).foregroundStyle(Color.chassisUncheckedText)
            }
        case .done(let check):
            ChassisNumberText(chassis: check.isRecorded ? check.chassis_number : vehicle.chassisNumber)
            CheckedBox(check: check)
        case .blankNeedsReview:
            BlankNotice(onShowOriginal: actions.showOriginal, onConfirm: { actions.acknowledgeBlank(vehicle) })
        case .blankConfirmed:
            Label("原本・伝票で空欄を確認済み", systemImage: "checkmark")
                .appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
            Button { actions.scan(vehicle) } label: {
                Label("車体番号を記録", systemImage: "camera.fill")
                    .appFont(16, weight: .bold)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(Color.chassisUncheckedText)
                    .background(Color.chassisUncheckedSoft, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.chassisUnchecked, lineWidth: 2))
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityHint("配車表に車体番号がないため、実車の車体番号をカメラで読み取って記録します")
        }
    }

    private var dates: some View {
        HStack(spacing: 6) {
            Chip(text: ["積", vehicle.pickupDate, vehicle.pickupCondition].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " "), style: .gray)
            if let due = DispatchDue(monthDay: vehicle.dropoffDate, today: today) {
                DueChip(prefix: "卸", due: due, condition: vehicle.dropoffCondition)
            } else {
                Chip(text: "卸 指定なし", style: .gray)
            }
        }
    }

    @ViewBuilder private var meta: some View {
        let rows = [
            ("請求先", vehicle.billTo), ("オークション", vehicle.auctionInfo), ("出荷地", vehicle.shipFrom),
            ("納入地", vehicle.deliverTo), ("緊締", vehicle.lashing),
        ].filter { !$0.1.isEmpty }
        if !rows.isEmpty {
            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 2) {
                ForEach(rows, id: \.0) { label, value in
                    GridRow {
                        Text(label).foregroundStyle(Color.mutedForeground)
                        Text(value).foregroundStyle(Color.appForeground)
                    }
                    .appFont(12)
                }
            }
        }
    }
}

// MARK: - Pieces

/// 車体番号が空欄: confirm against 原本 and 伝票 before the record button appears.
private struct BlankNotice: View {
    let onShowOriginal: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("車体番号が空欄です", systemImage: "exclamationmark.triangle.fill")
                .appFont(16, weight: .black).foregroundStyle(Color.chassisUncheckedText)
            Text("念のため配車表原本と伝票を確認してください。")
                .appFont(13, weight: .bold).foregroundStyle(Color.appForeground)
            HStack(spacing: 8) {
                Button(action: onShowOriginal) {
                    Label("原本を見る", systemImage: "doc.text")
                        .appFont(13, weight: .heavy)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .foregroundStyle(Color.chassisUncheckedText)
                        .background(Color.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(Color.chassisUnchecked, lineWidth: 1.5))
                }
                Button(action: onConfirm) {
                    Label("空欄を確認しました", systemImage: "checkmark")
                        .appFont(13, weight: .heavy)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 11)
                        .foregroundStyle(.white)
                        .background(Color.chassisUnchecked, in: Capsule())
                }
                .layoutPriority(1)
            }
            .buttonStyle(PressScaleStyle())
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.chassisUncheckedSoft, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.chassisUnchecked, lineWidth: 2))
    }
}

/// Green box under a matched/recorded number: 「コーションプレートで記録」 and when.
private struct CheckedBox: View {
    let check: ChassisCheckRow

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(Color.primaryForeground)
                .frame(width: 26, height: 26)
                .background(Color.primary, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Label(check.headline, systemImage: check.input == .voice ? "mic.fill" : (check.method == .cautionPlate ? "list.bullet.rectangle" : "seal"))
                    .appFont(15, weight: .black)
                Text(check.detailLine()).appFont(12, weight: .bold)
            }
            Spacer(minLength: 0)
            // 記録 keeps the photo of the plate / stamping it was read from.
            if let path = check.photo_path {
                AttachmentImage(reference: .stored(bucket: .chassisPhotos, path: path), contentMode: .fill)
                    .frame(width: 64, height: 48)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("記録した車体番号の写真")
            }
        }
        .foregroundStyle(Color.primary)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.primary, lineWidth: 1.5))
    }
}

/// B1: 「✓ 車台番号 照合済」 (green) / 「📷 車台番号 未照合」 (filled orange).
/// For a blank 車体番号 on the sheet: 「車体番号 記録済」 / 「車体番号 未記録」.
struct ChassisBadge: View {
    enum Kind { case match, record }

    let kind: Kind
    let isDone: Bool

    var body: some View {
        Label(text, systemImage: isDone ? "checkmark" : "camera.fill")
            .labelStyle(BadgeLabelStyle())
            .appFont(12, weight: isDone ? .bold : .heavy)
            .foregroundStyle(isDone ? Color.brandForeground : .white)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(isDone ? Color.brand : Color.chassisUnchecked, in: Capsule())
            .fixedSize()
    }

    private var text: String {
        switch (kind, isDone) {
        case (.match, true): "車台番号 照合済"
        case (.match, false): "車台番号 未照合"
        case (.record, true): "車体番号 記録済"
        case (.record, false): "車体番号 未記録"
        }
    }

    private struct BadgeLabelStyle: LabelStyle {
        func makeBody(configuration: Configuration) -> some View {
            HStack(spacing: 4) {
                configuration.icon.font(.system(size: 11, weight: .bold))
                configuration.title
            }
        }
    }
}

/// 「車台番号 照合 3/7台」 plus 「未照合 あと4台」 until all are done
/// (記録 of blank-numbered vehicles counts the same as 照合).
private struct ChassisProgressChips: View {
    let progress: ChassisCheckProgress

    var body: some View {
        HStack(spacing: 6) {
            Chip(text: "車台番号 照合 \(progress.checked)/\(progress.total)台", style: progress.isComplete ? .solidGreen : .green)
            if !progress.isComplete {
                Text("未照合 あと\(progress.remaining)台")
                    .appFont(12, weight: .heavy)
                    .foregroundStyle(Color.chassisUncheckedText)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 3)
                    .background(Color.chassisUncheckedSoft, in: Capsule())
                    .overlay(Capsule().stroke(Color.chassisUnchecked, lineWidth: 1.5))
            }
        }
    }
}

/// Mono chassis number with the digits at the end emphasized, plus the
/// letter right before them (not a hyphen).
/// Always the full number — 車体番号 is never abbreviated anywhere.
struct ChassisNumberText: View {
    let chassis: String
    /// Smaller type for 回戦まとめ rows.
    var compact = false

    var body: some View {
        if chassis.isEmpty {
            Text("車体番号 空欄").appFont(14).foregroundStyle(Color.mutedForeground)
        } else {
            let parts = ChassisNumber.emphasis(chassis)
            (Text(parts.head).font(.system(size: compact ? 14 : 17, weight: .bold, design: .monospaced))
                + Text(parts.serial).font(.system(size: compact ? 15 : 22, weight: .heavy, design: .monospaced)).foregroundColor(.primary))
                .foregroundStyle(Color.appForeground)
                .textSelection(.enabled)
        }
    }
}

private struct RouteLine: View {
    let pickup: String
    let dropoff: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(pickup.isEmpty ? "積地不明" : pickup, systemImage: "shippingbox")
            Image(systemName: "arrow.down").font(.system(size: 11, weight: .bold)).foregroundStyle(Color.mutedForeground).padding(.leading, 4)
            Label(dropoff.isEmpty ? "降地不明" : dropoff, systemImage: "mappin.and.ellipse")
        }
        .appFont(14, weight: .bold)
        .foregroundStyle(Color.appForeground)
    }
}

private struct PlaceRow: View {
    let label: String
    let place: String
    let ref: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label).appFont(11, weight: .heavy).foregroundStyle(Color.primaryForeground)
                .frame(width: 20, height: 20).background(Color.primary, in: Circle())
            VStack(alignment: .leading, spacing: 0) {
                Text(place.isEmpty ? "不明" : place).appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
                if !ref.isEmpty {
                    Text(ref).appFont(11).foregroundStyle(Color.mutedForeground)
                }
            }
        }
    }
}

struct Chip: View {
    enum Style { case green, solidGreen, gray, amber, red, solidRed }

    let text: String
    var style: Style = .green

    var body: some View {
        Text(text)
            .appFont(12, weight: .bold)
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 3)
            .background(background, in: Capsule())
            .fixedSize()
    }

    private var foreground: Color {
        switch style {
        case .green: .primary
        case .solidGreen: .primaryForeground
        case .gray: .mutedForeground
        case .amber: .secondary
        case .red: .destructive
        case .solidRed: .destructiveForeground
        }
    }

    private var background: Color {
        switch style {
        case .green: .primary.opacity(0.12)
        case .solidGreen: .primary
        case .gray: .muted
        case .amber: .secondary.opacity(0.15)
        case .red: .destructive.opacity(0.12)
        case .solidRed: .destructive
        }
    }
}

/// 卸日: red for today (or past), yellow for tomorrow, gray after that.
private struct DueChip: View {
    let prefix: String
    let due: DispatchDue
    let condition: String?
    var solid = false

    var body: some View {
        let date = "\(due.date.month)/\(due.date.day)"
        let text = [prefix, date, condition, due.label.map { "（\($0)）" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        Chip(text: text, style: style)
    }

    private var style: Chip.Style {
        switch due.urgency {
        case .overdue, .today: solid ? .solidRed : .red
        case .tomorrow: .amber
        case .later: .gray
        }
    }
}

private struct FlowChips: View {
    let texts: [String]
    let style: Chip.Style

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) { ForEach(texts, id: \.self) { Chip(text: $0, style: style) } }
            VStack(alignment: .leading, spacing: 4) { ForEach(texts, id: \.self) { Chip(text: $0, style: style) } }
        }
    }
}

/// The parser's notes on the sheet. Tapping opens what to check — each
/// vehicle with its 要確認 items — with a button to the 原本.
private struct SheetWarnings: View {
    let content: DispatchSheetContent
    let onShowOriginal: () -> Void

    @State private var expanded = false

    private var flagged: [DispatchVehicle] { content.vehicles.filter { !$0.warnings.isEmpty } }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { withAnimation(.easeOut(duration: 0.2)) { expanded.toggle() } } label: {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(content.warnings, id: \.self) { Text($0) }
                        Text(expanded ? "閉じる" : "確認する内容を見る ›").underline()
                    }
                    Spacer(minLength: 0)
                    Image(systemName: expanded ? "chevron.up" : "chevron.down").font(.system(size: 12, weight: .bold))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if expanded {
                if !flagged.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(flagged) { vehicle in
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(vehicle.round == "不明" ? "回戦不明" : "\(vehicle.round)回戦") ・ \(vehicle.vehicleName.isEmpty ? "（品名なし）" : vehicle.vehicleName)")
                                    .appFont(13, weight: .black).foregroundStyle(Color.appForeground)
                                if !vehicle.chassisNumber.isEmpty {
                                    ChassisNumberText(chassis: vehicle.chassisNumber, compact: true)
                                }
                                ForEach(vehicle.warnings, id: \.self) { warning in
                                    Label(warning, systemImage: "exclamationmark.circle")
                                        .appFont(12, weight: .bold).foregroundStyle(Color.destructive)
                                }
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.card, in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
                Text("読み取りが原本と違うことがあります。原本で内容を確かめてください。")
                    .appFont(12).foregroundStyle(Color.appForeground)
                Button(action: onShowOriginal) {
                    Label("原本を確認する", systemImage: "doc.text").appFont(14, weight: .bold).frame(maxWidth: .infinity)
                }
                .buttonStyle(PillButtonStyle(kind: .destructive))
            }
        }
        .appFont(12, weight: .bold)
        .foregroundStyle(Color.destructive)
        .padding(10)
        .background(Color.destructive.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - 原本

struct DispatchSheetOriginal: View {
    let sheet: DispatchSheetRow

    @State private var document: PDFDocument?
    @State private var failed = false
    @State private var sharing = false

    var body: some View {
        VStack(spacing: 4) {
            if document != nil {
                HStack {
                    Spacer()
                    Button { sharing = true } label: { Label("共有", systemImage: "square.and.arrow.up").appFont(13, weight: .semibold) }
                }
                .padding(.horizontal, 16)
            }
            Group {
                if let document {
                    PDFDocumentView(document: document)
                } else if failed {
                    EmptyStateBox(text: "原本を読み込めませんでした。通信状況を確認してください。").padding(16)
                } else {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task(id: sheet.id) {
            do {
                document = PDFDocument(data: try await PDFCache.load(sheet.blob_url))
                failed = document == nil
            } catch {
                failed = true
            }
        }
        .sheet(isPresented: $sharing) {
            ShareSheet(items: [PDFCache.url(for: sheet.blob_url)])
        }
    }
}

/// PDFKit viewer (pinch to zoom; landscape sheets fit the width).
private struct PDFDocumentView {
    let document: PDFDocument

    @MainActor private func configure(_ view: PDFView) {
        view.document = document
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
    }
}

#if canImport(UIKit)
extension PDFDocumentView: UIViewRepresentable {
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        configure(view)
        return view
    }

    func updateUIView(_ view: PDFView, context: Context) {
        if view.document !== document { configure(view) }
    }
}
#else
extension PDFDocumentView: NSViewRepresentable {
    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        configure(view)
        return view
    }

    func updateNSView(_ view: PDFView, context: Context) {
        if view.document !== document { configure(view) }
    }
}
#endif
