import KyoeiCore
import SwiftUI

// 引取不可: the driver's request form (配車表 > 1台詳細), the detail shown to
// the driver / the approver / viewers, the list for permitted accounts
// (マイページ > 引取不可), and the approver's 「許可を求めています」 alert.

struct PickupTarget: Identifiable {
    let sheet: DispatchSheetRow
    let vehicle: DispatchVehicle
    var id: Int { vehicle.id }
}

/// 理由・詳細・写真 → 引取不可 → pick an approver on duty → sent (with a call button).
struct PickupRequestView: View {
    let target: PickupTarget
    let onClose: () -> Void

    @Environment(AuthStore.self) private var auth
    @Environment(PickupStore.self) private var store
    @Environment(\.openURL) private var openURL

    private enum Step { case form, approver, sent(PickupApprover) }

    @State private var step: Step = .form
    @State private var reason: PickupReason?
    @State private var detail = ""
    @State private var photos: [Data] = []
    @State private var error: String?
    @State private var sending = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button(closeLabel) { onClose() }.appFont(15, weight: .semibold)
                Spacer()
                Text("引取不可").appFont(16, weight: .black).italic()
                Spacer()
                Text(closeLabel).appFont(15, weight: .semibold).hidden()
            }
            .foregroundStyle(Color.chromeForeground)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Color.chrome.ignoresSafeArea(edges: .top))

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    PickupVehicleSummary(snapshot: PickupVehicleSnapshot(target.vehicle))
                    if let error {
                        Text(error).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                    }
                    switch step {
                    case .form: form
                    case .approver: approverStep
                    case .sent(let approver): sent(approver)
                    }
                }
                .padding(16)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.appBackground.ignoresSafeArea())
    }

    private var closeLabel: String {
        if case .sent = step { return "閉じる" }
        return "やめる"
    }

    @ViewBuilder private var form: some View {
        FormField(label: "理由（必須）") {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(PickupReason.allCases) { option in
                    Button { reason = option } label: {
                        Text(option.label).appFont(14, weight: .bold)
                            .frame(maxWidth: .infinity, minHeight: 46)
                            .foregroundStyle(reason == option ? Color.destructiveForeground : Color.appForeground)
                            .background(reason == option ? Color.destructive : Color.card, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(reason == option ? Color.destructive : Color.border))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        FormField(label: reason?.needsDetail == true ? "詳細（必須）" : "詳細") {
            TextField("例：オークション会場に車両が見当たらず、係員に確認したが不明", text: $detail, axis: .vertical)
                .lineLimit(3...10)
                .appFont(15)
                .padding(12)
                .card(radius: 12, fill: .card)
        }
        VStack(alignment: .leading, spacing: 8) {
            Text("写真（必須・\(PickupForm.maxPhotos)枚まで）").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            if !photos.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                    ForEach(Array(photos.enumerated()), id: \.offset) { index, data in
                        if let image = Image(imageData: data) {
                            image.resizable().scaledToFill()
                                .frame(height: 100).frame(maxWidth: .infinity)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(alignment: .topTrailing) {
                                    Button { photos.remove(at: index) } label: {
                                        Image(systemName: "xmark.circle.fill").font(.system(size: 22)).foregroundStyle(.white, .black.opacity(0.6))
                                    }
                                    .buttonStyle(.plain).padding(4)
                                    .accessibilityLabel("写真を外す")
                                }
                        }
                    }
                }
            }
            if photos.count < PickupForm.maxPhotos {
                PhotoAddButtons { if photos.count < PickupForm.maxPhotos { photos.append($0) } }
            }
        }
        .padding(14)
        .card()
        Button(action: next) {
            Label("引取不可", systemImage: "xmark.octagon.fill")
                .appFont(17, weight: .black)
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(Color.destructiveForeground)
                .background(Color.destructive, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(PressScaleStyle())
        Text("押すと、出勤中の役職者から承認してもらう人を選びます。承認されるまでは「承認待ち」です。")
            .appFont(12).foregroundStyle(Color.mutedForeground)
    }

    private var approverStep: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("誰に承認してもらいますか？").appFont(17, weight: .black).foregroundStyle(Color.appForeground)
            Text("出勤簿で「出勤中」の、承認できる人だけが表示されます。").appFont(12).foregroundStyle(Color.mutedForeground)
            ApproverPicker(sending: sending) { approver in send(to: approver) }
            Button("入力に戻る") { step = .form; error = nil }
                .buttonStyle(PillButtonStyle(kind: .outline))
                .disabled(sending)
        }
    }

    private func sent(_ approver: PickupApprover) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("\(approver.name)さんに、引取不可の許可を求めました", systemImage: "paperplane.fill")
                .appFont(17, weight: .black).foregroundStyle(Color.appForeground)
            Text("承認されると、この車は「引取不可（承認済み）」になります。電話で話して解決したときは、お互いに「解決」を押すと通常どおり輸送する扱いになります。")
                .appFont(13).foregroundStyle(Color.mutedForeground)
            if let phone = approver.phone, let url = telURL(phone) {
                Button { openURL(url) } label: {
                    Label("\(approver.name)さんに電話する", systemImage: "phone.fill")
                        .appFont(16, weight: .black)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(Color.brandForeground)
                        .background(Color.brand, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(PressScaleStyle())
            } else {
                Text("\(approver.name)さんの電話番号は登録されていません。").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            Button("閉じる", action: onClose).buttonStyle(PillButtonStyle(kind: .outline))
        }
    }

    private func next() {
        error = PickupForm.problem(reason: reason, detail: detail, photoCount: photos.count)
        if error == nil { step = .approver }
    }

    private func send(to approver: PickupApprover) {
        guard let userID = auth.userID, let reason else { return }
        sending = true
        error = nil
        let photos = photos
        Task {
            var uploaded: [String] = []
            do {
                for data in photos {
                    uploaded.append(try await AttachmentStore.shared.upload(data, filename: "pickup.jpg", to: .pickupPhotos, folder: userID))
                }
                try await PickupRepository.submit(.init(
                    p_sheet_id: target.sheet.id, p_sheet_title: target.sheet.title, p_vehicle: PickupVehicleSnapshot(target.vehicle),
                    p_reason: reason.rawValue, p_detail: detail.trimmingCharacters(in: .whitespacesAndNewlines),
                    p_photo_paths: uploaded, p_approver: approver.user_id))
                sending = false
                step = .sent(approver)
                await store.refreshMine()
            } catch {
                await AttachmentStore.shared.remove(uploaded, from: .pickupPhotos)
                sending = false
                self.error = PickupRepository.describe(error)
            }
        }
    }
}

/// Approvers 出勤中 right now; tap one to ask them.
struct ApproverPicker: View {
    var excluding: String?
    let sending: Bool
    let onPick: (PickupApprover) -> Void

    @State private var approvers: [PickupApprover]?
    @State private var failed = false
    @State private var picked: PickupApprover?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let approvers {
                let list = approvers.filter { $0.user_id != excluding }
                if list.isEmpty {
                    EmptyStateBox(text: "いま出勤中の承認できる人がいません。事務所に電話で相談してください。", verticalPadding: 20)
                }
                ForEach(list) { approver in
                    Button { picked = approver } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill").font(.system(size: 30)).foregroundStyle(Color.primary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(approver.name).appFont(17, weight: .bold).foregroundStyle(Color.appForeground)
                                Text(approver.position ?? "役職未設定").appFont(12).foregroundStyle(Color.mutedForeground)
                            }
                            Spacer(minLength: 0)
                            Text("出勤中").appFont(11, weight: .black).foregroundStyle(Color.primary)
                                .padding(.horizontal, 8).padding(.vertical, 3).background(Color.primary.opacity(0.14), in: Capsule())
                        }
                        .padding(14)
                        .card()
                    }
                    .buttonStyle(.plain)
                    .disabled(sending)
                }
            } else if failed {
                EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。", verticalPadding: 20)
            } else {
                ProgressView().frame(maxWidth: .infinity, minHeight: 80)
            }
            Button { Task { await load() } } label: { Label("出勤状況を読み込み直す", systemImage: "arrow.clockwise") }
                .buttonStyle(PillButtonStyle(kind: .outline))
                .disabled(sending)
            if sending { ProgressView("送信中…").frame(maxWidth: .infinity) }
        }
        .task { await load() }
        .overlay {
            if let approver = picked {
                ConfirmActionDialog(
                    message: "\(approver.name)さんに、引取不可の許可を求めますか？",
                    confirmLabel: "許可を求める",
                    onConfirm: { picked = nil; onPick(approver) },
                    onCancel: { picked = nil }
                )
            }
        }
    }

    private func load() async {
        failed = false
        do {
            approvers = try await PickupRepository.approversOnDuty()
        } catch {
            failed = approvers == nil
        }
    }
}

/// The car as copied into the record.
struct PickupVehicleSummary: View {
    let snapshot: PickupVehicleSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(snapshot.vehicle_name.isEmpty ? "（品名なし）" : snapshot.vehicle_name)
                .appFont(20, weight: .black).foregroundStyle(Color.appForeground)
            if !snapshot.chassis_number.isEmpty {
                ChassisNumberText(chassis: snapshot.chassis_number)
            }
            Text("積：\(snapshot.pickup)\(snapshot.pickup_ref.isEmpty ? "" : "（\(snapshot.pickup_ref)）")")
                .appFont(13).foregroundStyle(Color.appForeground)
            Text("降：\(snapshot.dropoff)").appFont(13).foregroundStyle(Color.mutedForeground)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

// MARK: - Detail

/// One record. The driver can press 解決, call the approver or ask someone
/// else; the picked approver can 承認, press 解決 or call the driver; anyone
/// else with the permission only reads it.
struct PickupDetailView: View {
    let onClose: () -> Void

    @Environment(AuthStore.self) private var auth
    @Environment(PickupStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var record: PickupFailure
    @State private var working = false
    @State private var error: String?
    @State private var confirmsApprove = false
    @State private var reassigning = false
    @State private var enlarged: String?

    init(record: PickupFailure, onClose: @escaping () -> Void) {
        _record = State(initialValue: record)
        self.onClose = onClose
    }

    private var me: String { auth.userID?.lowercased() ?? "" }
    private var isDriver: Bool { record.user_id.lowercased() == me }
    private var isApprover: Bool { record.approver_id?.lowercased() == me && auth.account?.canApprovePickup == true }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    PickupStatusChip(status: record.status)
                    Spacer()
                    Button("閉じる", action: onClose).appFont(15, weight: .semibold).foregroundStyle(Color.primary)
                }
                if let line = record.waitingLine {
                    Text(line).appFont(14, weight: .bold).foregroundStyle(Color.chassisUncheckedText)
                }
                if let error {
                    Text(error).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                }
                if record.isOpen && (isDriver || isApprover) { actions }
                PickupVehicleSummary(snapshot: snapshot)
                section("申請内容") {
                    row("ドライバー", record.driver_name)
                    row("申請日時", record.createdLabel())
                    row("配車表", record.sheet_title.isEmpty ? "－" : record.sheet_title)
                    row("理由", record.reason.label)
                    if !record.detail.isEmpty { row("詳細", record.detail) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8)], spacing: 8) {
                        ForEach(record.photo_paths, id: \.self) { path in
                            Button { enlarged = path } label: {
                                AttachmentImage(reference: .stored(bucket: .pickupPhotos, path: path), contentMode: .fill)
                                    .frame(height: 120).frame(maxWidth: .infinity)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("写真を拡大")
                        }
                    }
                }
                section("承認・解決") {
                    row("承認する人", record.approver_name ?? "－")
                    if let at = record.approved_at { row("承認", "\(record.approved_by_name ?? "")（\(Self.time(at))）") }
                    row("ドライバーの解決", record.driver_resolved_at.map(Self.time) ?? "まだ")
                    row("役職者の解決", record.approver_resolved_at.map { "\(record.approver_resolved_by_name ?? "")（\(Self.time($0))）" } ?? "まだ")
                }
            }
            .padding(20)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .overlay {
            if confirmsApprove {
                ConfirmActionDialog(
                    message: "引取不可を承認しますか？",
                    confirmLabel: "承認する",
                    onConfirm: { confirmsApprove = false; run { try await PickupRepository.approve(id: record.id) } },
                    onCancel: { confirmsApprove = false }
                ) {
                    Text("承認すると、この車は引取不可として確定します。").appFont(13).foregroundStyle(Color.mutedForeground).multilineTextAlignment(.center)
                }
            }
        }
        .sheet(isPresented: $reassigning) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("別の人に頼む").appFont(17, weight: .black)
                        Spacer()
                        Button("やめる") { reassigning = false }.appFont(15, weight: .semibold)
                    }
                    ApproverPicker(excluding: record.approver_id, sending: working) { approver in
                        reassigning = false
                        run { try await PickupRepository.reassign(id: record.id, to: approver.user_id) }
                    }
                }
                .padding(20)
            }
            .background(Color.appBackground.ignoresSafeArea())
        }
        .fullScreen(item: Binding(get: { enlarged.map(PhotoID.init) }, set: { enlarged = $0?.id })) { photo in
            ZStack(alignment: .topTrailing) {
                Color.black.ignoresSafeArea()
                AttachmentImage(reference: .stored(bucket: .pickupPhotos, path: photo.id), contentMode: .fit)
                Button { enlarged = nil } label: {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 32)).foregroundStyle(.white, .black.opacity(0.6))
                }
                .padding(20)
                .accessibilityLabel("閉じる")
            }
        }
    }

    private struct PhotoID: Identifiable { let id: String }

    private var snapshot: PickupVehicleSnapshot {
        PickupVehicleSnapshot(DispatchVehicle(
            id: record.vehicle_index, round: record.round, vehicleName: record.vehicle_name, chassisNumber: record.chassis_number,
            pickup: record.pickup, pickupRef: record.pickup_ref, dropoff: record.dropoff, dropoffRef: record.dropoff_ref))
    }

    @ViewBuilder private var actions: some View {
        VStack(spacing: 10) {
            if isApprover {
                Button { confirmsApprove = true } label: {
                    Label("承認する（引取不可）", systemImage: "checkmark.seal.fill")
                        .appFont(17, weight: .black)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(Color.destructiveForeground)
                        .background(Color.destructive, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(PressScaleStyle())
            }
            let pressed = record.hasPressedResolve(userID: me)
            Button {
                run { try await PickupRepository.resolve(id: record.id, pressed: !pressed) }
            } label: {
                Label(pressed ? "解決を取り消す" : "解決（通常どおり輸送）", systemImage: pressed ? "arrow.uturn.backward" : "hand.thumbsup.fill")
                    .appFont(16, weight: .black)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .foregroundStyle(pressed ? Color.appForeground : Color.primaryForeground)
                    .background(pressed ? Color.card : Color.primary, in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(pressed ? Color.border : .clear))
            }
            .buttonStyle(PressScaleStyle())
            Text("電話などで話して解決したときは、ドライバーと役職者の両方が「解決」を押すと、通常どおり輸送する扱いになります。")
                .appFont(11).foregroundStyle(Color.mutedForeground)
            let name = isDriver ? record.approver_name : record.driver_name
            let phone = isDriver ? record.approver_phone : record.driver_phone
            if let phone, let url = telURL(phone) {
                Button { openURL(url) } label: { Label("\(name ?? "")さんに電話する", systemImage: "phone.fill") }
                    .buttonStyle(PillButtonStyle(kind: .secondary))
            }
            if isDriver {
                Button("別の人に頼む") { reassigning = true }.buttonStyle(PillButtonStyle(kind: .outline))
            }
        }
        .disabled(working)
        .padding(14)
        .card()
    }

    private func run(_ action: @escaping () async throws -> Void) {
        working = true
        error = nil
        Task {
            do {
                try await action()
                await reload()
            } catch {
                self.error = PickupRepository.describe(error)
                await reload()
            }
            working = false
            await store.changed()
        }
    }

    /// The driver reads their own; approvers and viewers read the board.
    private func reload() async {
        let list = isDriver ? try? await PickupRepository.mine() : try? await PickupRepository.board()
        if let fresh = list?.first(where: { $0.id == record.id }) { record = fresh }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground).frame(width: 96, alignment: .leading)
            Text(value).appFont(14).foregroundStyle(Color.appForeground)
            Spacer(minLength: 0)
        }
    }

    private static func time(_ raw: String) -> String {
        guard let date = DBTimestamp.parse(raw) else { return "" }
        let c = Calendar.current.dateComponents([.month, .day, .hour, .minute], from: date)
        return "\(c.month ?? 0)/\(c.day ?? 0) \(String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0))"
    }
}

struct PickupStatusChip: View {
    let status: PickupStatus

    var body: some View {
        let color: Color = switch status {
        case .pending: .chassisUnchecked
        case .approved: .destructive
        case .resolved: .primary
        }
        Text(status.label).appFont(12, weight: .bold).foregroundStyle(color)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(color.opacity(0.14), in: Capsule())
    }
}

// MARK: - List (マイページ > 引取不可)

struct PickupBoardView: View {
    @Environment(PickupStore.self) private var store
    @Environment(AuthStore.self) private var auth
    @State private var records: [PickupFailure] = []
    @State private var loaded = false
    @State private var failed = false
    @State private var openOnly = true
    @State private var open: PickupFailure?

    var body: some View {
        TabPage {
            PageHeading(title: "引取不可", subtitle: "積地で引き取れなかった車の申請です。承認待ちのものと、承認・解決したものを確認できます。")
            Picker("表示", selection: $openOnly) {
                Text("承認待ち").tag(true)
                Text("すべて").tag(false)
            }
            .pickerStyle(.segmented)
            let shown = openOnly ? records.filter(\.isOpen) : records
            if !loaded {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if failed && records.isEmpty {
                EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。")
            } else if shown.isEmpty {
                EmptyStateBox(text: openOnly ? "承認待ちの引取不可はありません。" : "引取不可の記録はまだありません。")
            }
            ForEach(shown) { record in
                Button { open = record } label: { PickupRow(record: record, forMe: record.isOpen && record.approver_id?.lowercased() == auth.userID?.lowercased()) }
                    .buttonStyle(.plain)
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .onChange(of: store.forMe) { _, _ in Task { await load() } }
        .sheet(item: $open) { record in
            PickupDetailView(record: record) {
                open = nil
                Task { await load() }
            }
        }
    }

    private func load() async {
        do {
            records = try await PickupRepository.board()
            failed = false
        } catch {
            failed = true
        }
        loaded = true
    }
}

private struct PickupRow: View {
    let record: PickupFailure
    let forMe: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                PickupStatusChip(status: record.status)
                if forMe {
                    Text("あなた宛て").appFont(11, weight: .black).foregroundStyle(Color.destructiveForeground)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(Color.destructive, in: Capsule())
                }
                Spacer()
                Text(record.createdLabel()).appFont(12).monospacedDigit().foregroundStyle(Color.mutedForeground)
            }
            Text(record.vehicle_name.isEmpty ? "（品名なし）" : record.vehicle_name).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
            if !record.chassis_number.isEmpty { ChassisNumberText(chassis: record.chassis_number, compact: true) }
            Text("\(record.driver_name) ・ \(record.reason.label) ・ 積：\(record.pickup)").appFont(12).foregroundStyle(Color.mutedForeground).lineLimit(2)
            if let line = record.waitingLine {
                Text(line).appFont(12, weight: .bold).foregroundStyle(Color.chassisUncheckedText)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(border: forMe ? Color.destructive.opacity(0.6) : .cardEdge)
    }
}

// MARK: - Approver alert

/// 「引取不可の許可を求めています」 over everything, for the picked approver.
struct PickupRequestAlert: View {
    @Environment(PickupStore.self) private var store
    @State private var opened: PickupFailure?

    var body: some View {
        ZStack {
            if let request = store.alert, opened == nil {
                ModalCard(maxWidth: 360, dimming: 0.6) {
                    ModalIcon(systemName: "exclamationmark.octagon.fill")
                    Text("引取不可の許可を求めています").appFont(18, weight: .black).foregroundStyle(Color.appForeground)
                        .multilineTextAlignment(.center)
                    Text("\(request.driver_name)さん ・ \(request.vehicle_name.isEmpty ? "車両" : request.vehicle_name)")
                        .appFont(14, weight: .bold).foregroundStyle(Color.appForeground).padding(.top, 8)
                    Text("理由：\(request.reason.label)").appFont(13).foregroundStyle(Color.mutedForeground).padding(.top, 2)
                    HStack(spacing: 8) {
                        Button("あとで") { store.alert = nil }.buttonStyle(PillButtonStyle(kind: .outline))
                        Button("確認") { opened = request }.buttonStyle(PillButtonStyle(kind: .primary))
                    }
                    .padding(.top, 16)
                    Text("あとで確認するときは マイページ > 引取不可 から開けます。").appFont(11).foregroundStyle(Color.mutedForeground).padding(.top, 8)
                }
            }
        }
        .sheet(item: $opened) { record in
            PickupDetailView(record: record) {
                opened = nil
                store.alert = nil
            }
        }
    }
}
