import KyoeiCore
import PhotosUI
import Supabase
import SwiftUI

enum RepairRepository {
    static func create(_ insert: RepairRequestInsert) async throws {
        try await Backend.client.from("repair_requests").insert(insert).execute()
    }

    struct Update: Encodable {
        let p_id: String
        let p_part: String
        let p_symptom: String
        let p_cause: String
        let p_desired_on: String?
        let p_urgency: String
        let p_photo_paths: [String]
        let p_withdraw: Bool
    }

    static func update(_ update: Update) async throws {
        try await Backend.client.rpc("update_repair_request", params: update).execute()
    }
}

/// マイページ > 修理申請: my requests (status, 予定, 結果) and a new one.
struct RepairListView: View {
    @Environment(RepairStore.self) private var store
    @State private var editing: RepairEditorTarget?
    @State private var open: RepairRequest?

    var body: some View {
        TabPage {
            PageHeading(title: "修理申請", subtitle: "車両の故障を報告します。社長が確認して、修理の予定が決まるとお知らせします。")
            Button { editing = RepairEditorTarget(existing: nil, draft: nil) } label: {
                Label("新しく修理を申請する", systemImage: "wrench.and.screwdriver")
                    .appFont(16, weight: .black)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Color.brandForeground)
                    .background(Color.brand, in: SlantedRectangle(slant: 10))
            }
            .buttonStyle(PressScaleStyle())
            if !store.loaded {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if store.requests.isEmpty {
                EmptyStateBox(text: "修理申請はまだありません。")
            }
            ForEach(store.requests) { request in
                Button {
                    store.markRead(request.id)
                    open = request
                } label: { RepairRow(request: request, unread: store.unread.contains(request.id)) }
                .buttonStyle(.plain)
            }
        }
        .refreshable { await store.refresh() }
        .task { await store.refresh() }
        .sheet(item: $open) { request in
            RepairDetailView(request: request, onEdit: {
                open = nil
                editing = RepairEditorTarget(existing: request, draft: nil)
            }, onClose: { open = nil })
        }
        .fullScreen(item: $editing) { target in
            RepairEditorView(target: target) { _ in
                editing = nil
                Task { await store.refresh() }
            }
        }
    }
}

private struct RepairRow: View {
    let request: RepairRequest
    let unread: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                StatusChip(status: request.status)
                if unread {
                    Text("更新あり").appFont(11, weight: .black).foregroundStyle(Color.destructiveForeground)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(Color.destructive, in: Capsule())
                }
                Spacer()
                Text("\(request.reported_on.month)/\(request.reported_on.day) 申告").appFont(12).monospacedDigit().foregroundStyle(Color.mutedForeground)
            }
            Text("\(request.part.label)：\(request.symptom)").appFont(15, weight: .semibold).foregroundStyle(Color.appForeground).lineLimit(2)
            if let entry = request.entry_on, request.status == .scheduled {
                Text("\(request.destinationLabel ?? "")・入庫予定日 \(entry.month)月\(entry.day)日").appFont(13, weight: .bold).foregroundStyle(Color.primary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(border: unread ? Color.destructive.opacity(0.6) : .cardEdge)
    }
}

private struct StatusChip: View {
    let status: RepairStatus

    var body: some View {
        let color: Color = switch status {
        case .submitted: .secondary
        case .scheduled: .primary
        case .done: .mutedForeground
        case .withdrawn: .mutedForeground
        }
        Text(status.label).appFont(12, weight: .bold).foregroundStyle(color)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(color.opacity(0.14), in: Capsule())
    }
}

/// One request: what was reported, the 社長's decision and the 整備 record.
struct RepairDetailView: View {
    let request: RepairRequest
    let onEdit: () -> Void
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    StatusChip(status: request.status)
                    Spacer()
                    Button("閉じる", action: onClose).appFont(15, weight: .semibold).foregroundStyle(Color.primary)
                }
                section("申告内容") {
                    row("申告日", "\(request.reported_on.month)月\(request.reported_on.day)日")
                    row("ヘッド車番", request.head_plate.isEmpty ? "－" : request.head_plate)
                    if let chassis = request.chassis_plate { row("台車車番", chassis) }
                    row("故障個所", request.part.label)
                    row("症状・状況", request.symptom)
                    if !request.cause.isEmpty { row("原因", request.cause) }
                    row("修理希望日", request.desired_on.map { "\($0.month)月\($0.day)日" } ?? "指定なし")
                    row("急ぎ具合", request.urgency.label)
                    photos(request.photo_paths)
                }
                section("社長の確認") {
                    if request.president_stamped_at == nil {
                        Text("まだ確認されていません。").appFont(13).foregroundStyle(Color.mutedForeground)
                    } else {
                        row("修理先", request.destinationLabel ?? "")
                        row("修理依頼日", request.requested_on.map { "\($0.month)月\($0.day)日" } ?? "－")
                        row("入庫予定日", request.entry_on.map { "\($0.month)月\($0.day)日" } ?? "－")
                        if !request.president_note.isEmpty { row("メモ", request.president_note) }
                    }
                }
                section("修理の結果") {
                    if let done = request.completed_on {
                        row("修理完了日", "\(done.month)月\(done.day)日")
                        row("作業内容", request.work_done.isEmpty ? "－" : request.work_done)
                    } else {
                        Text("まだ完了していません。").appFont(13).foregroundStyle(Color.mutedForeground)
                    }
                }
                if request.isEditable {
                    Button("内容を直す・取り下げる", action: onEdit).buttonStyle(PillButtonStyle(kind: .outline))
                    Text("社長が確認するまでは、内容を直したり取り下げたりできます。").appFont(11).foregroundStyle(Color.mutedForeground)
                }
            }
            .padding(20)
        }
        .background(Color.appBackground.ignoresSafeArea())
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
            Text(label).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground).frame(width: 84, alignment: .leading)
            Text(value).appFont(14).foregroundStyle(Color.appForeground)
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder private func photos(_ paths: [String]) -> some View {
        if !paths.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(paths, id: \.self) { path in
                        AttachmentImage(reference: .stored(bucket: .repairPhotos, path: path), contentMode: .fill)
                            .frame(width: 120, height: 90).clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }
}

struct RepairEditorTarget: Identifiable {
    var existing: RepairRequest?
    /// Prefill from an inspection's 否 items.
    var draft: InspectionRecord?
    var id: String { existing?.id ?? draft?.id ?? "new" }
}

/// 修理申請の入力 (new or edit). Plates and 申告日 come from the profile.
struct RepairEditorView: View {
    let target: RepairEditorTarget
    let onClose: (Bool) -> Void

    @Environment(AuthStore.self) private var auth
    @Environment(InspectionStore.self) private var inspections
    @State private var part: RepairPart = .head
    @State private var symptom = ""
    @State private var cause = ""
    @State private var hasDesired = false
    @State private var desired = Date()
    @State private var urgency: RepairUrgency?
    @State private var keptPhotos: [String] = []
    @State private var newPhotos: [Data] = []
    @State private var saving = false
    @State private var error: String?
    @State private var confirmsWithdraw = false

    private var vehicleClass: VehicleClass? {
        target.existing?.vehicle_class.flatMap(VehicleClass.init(rawValue:)) ?? inspections.profile?.vehicle_class
    }
    private var isTrailer: Bool { vehicleClass?.isTrailer == true }
    private var headPlate: String { target.existing?.head_plate ?? inspections.profile?.vehicle?.plate ?? "" }
    private var chassisPlate: String? { target.existing?.chassis_plate ?? (isTrailer ? inspections.profile?.chassis?.plate : nil) }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("閉じる") { onClose(false) }.appFont(15, weight: .semibold)
                Spacer()
                Text(target.existing == nil ? "修理申請" : "修理申請を直す").appFont(16, weight: .black).italic()
                Spacer()
                Button(saving ? "送信中…" : "申請する") { save(withdraw: false) }.appFont(15, weight: .bold).disabled(saving)
            }
            .foregroundStyle(Color.chromeForeground)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Color.chrome.ignoresSafeArea(edges: .top))

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        info("申告日", target.existing.map { "\($0.reported_on.month)月\($0.reported_on.day)日" } ?? "今日")
                        info("運転者", inspections.profile?.full_name.isEmpty == false ? inspections.profile!.full_name : (auth.loginLabel ?? ""))
                        info(isTrailer ? "ヘッド車番" : "車番", headPlate.isEmpty ? "未設定" : headPlate)
                        if isTrailer { info("台車車番", chassisPlate ?? "未設定") }
                    }
                    .padding(14).card()

                    if let error {
                        Text(error).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                    }

                    if isTrailer {
                        FormField(label: "故障個所") {
                            Picker("故障個所", selection: $part) {
                                ForEach(RepairPart.allCases, id: \.self) { Text($0.label).tag($0) }
                            }
                            .pickerStyle(.segmented)
                        }
                    }
                    FormField(label: "症状・状況（必須）") { multiline("例：ブレーキを踏むと右前から異音がする", text: $symptom, lines: 4...10) }
                    FormField(label: "原因（わかる範囲で）") { multiline("例：縁石に接触した", text: $cause, lines: 2...6) }
                    FormField(label: "修理希望日") {
                        VStack(alignment: .leading) {
                            Toggle("希望日を指定する", isOn: $hasDesired).appFont(14)
                            if hasDesired {
                                DatePicker("修理希望日", selection: $desired, in: Date()..., displayedComponents: .date).labelsHidden()
                            }
                        }
                    }
                    FormField(label: "急ぎ具合（必須）") {
                        HStack(spacing: 8) {
                            ForEach(RepairUrgency.allCases, id: \.self) { option in
                                Button { urgency = option } label: {
                                    Text(option.label).appFont(15, weight: .bold)
                                        .frame(maxWidth: .infinity, minHeight: 44)
                                        .foregroundStyle(urgency == option ? (option == .urgent ? Color.destructiveForeground : Color.brandForeground) : Color.appForeground)
                                        .background(urgency == option ? (option == .urgent ? Color.destructive : Color.brand) : Color.card, in: RoundedRectangle(cornerRadius: 12))
                                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.border))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    photos
                    if target.existing != nil {
                        Button("この申請を取り下げる") { confirmsWithdraw = true }
                            .appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                            .frame(maxWidth: .infinity).padding(.top, 8)
                    }
                }
                .padding(16)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .onAppear(perform: fill)
        .overlay {
            if confirmsWithdraw {
                ConfirmActionDialog(message: "この修理申請を取り下げますか？", confirmLabel: "取り下げる",
                                    onConfirm: { confirmsWithdraw = false; save(withdraw: true) },
                                    onCancel: { confirmsWithdraw = false })
            }
        }
    }

    private func info(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground).frame(width: 84, alignment: .leading)
            Text(value).appFont(15, weight: .semibold).foregroundStyle(Color.appForeground)
            Spacer(minLength: 0)
        }
    }

    private func multiline(_ placeholder: String, text: Binding<String>, lines: ClosedRange<Int>) -> some View {
        TextField(placeholder, text: text, axis: .vertical)
            .lineLimit(lines)
            .appFont(15)
            .padding(12)
            .card(radius: 12, fill: .card)
    }

    private var photos: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("写真（任意）").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                ForEach(keptPhotos, id: \.self) { path in
                    tile(AttachmentImage(reference: .stored(bucket: .repairPhotos, path: path), contentMode: .fill)) { keptPhotos.removeAll { $0 == path } }
                }
                ForEach(Array(newPhotos.enumerated()), id: \.offset) { index, data in
                    if let image = Image(imageData: data) {
                        tile(image.resizable().scaledToFill()) { newPhotos.remove(at: index) }
                    }
                }
            }
            PhotoAddButtons { newPhotos.append($0) }
        }
        .padding(14)
        .card()
    }

    private func tile(_ content: some View, onRemove: @escaping () -> Void) -> some View {
        content
            .frame(height: 100).frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 22)).foregroundStyle(.white, .black.opacity(0.6))
                }
                .buttonStyle(.plain).padding(4)
                .accessibilityLabel("写真を外す")
            }
    }

    private func fill() {
        if let existing = target.existing {
            part = existing.part
            symptom = existing.symptom
            cause = existing.cause
            if let date = existing.desired_on { hasDesired = true; desired = date.startDate() }
            urgency = existing.urgency
            keptPhotos = existing.photo_paths
        } else if let record = target.draft {
            let draft = RepairDraft.symptom(from: record)
            part = draft.part
            symptom = draft.text
        }
    }

    private func save(withdraw: Bool) {
        error = nil
        guard let userID = auth.userID else { return }
        let text = symptom.trimmingCharacters(in: .whitespacesAndNewlines)
        if !withdraw {
            if text.isEmpty { error = "症状・状況を入力してください。"; return }
            if urgency == nil { error = "急ぎ具合を選んでください。"; return }
        }
        saving = true
        let photos = newPhotos
        let existing = target.existing
        let desiredOn = hasDesired ? LocalDate(desired) : nil
        Task {
            do {
                var paths = keptPhotos
                for data in photos {
                    paths.append(try await AttachmentStore.shared.upload(data, filename: "repair.jpg", to: .repairPhotos, folder: userID))
                }
                if let existing {
                    try await RepairRepository.update(.init(
                        p_id: existing.id, p_part: (isTrailer ? part : .head).rawValue, p_symptom: text.isEmpty ? existing.symptom : text,
                        p_cause: cause, p_desired_on: desiredOn?.iso, p_urgency: (urgency ?? existing.urgency).rawValue,
                        p_photo_paths: paths, p_withdraw: withdraw))
                    let removed = existing.photo_paths.filter { !paths.contains($0) }
                    await AttachmentStore.shared.remove(removed, from: .repairPhotos)
                } else {
                    try await RepairRepository.create(RepairRequestInsert(
                        vehicleClass: vehicleClass, headPlate: headPlate, chassisPlate: chassisPlate, part: part,
                        symptom: text, cause: cause, desiredOn: desiredOn, urgency: urgency ?? .asap,
                        photoPaths: paths, inspectionID: target.draft?.id))
                }
                saving = false
                onClose(true)
            } catch {
                saving = false
                self.error = existing == nil
                    ? "申請できませんでした。通信状況を確認してください。"
                    : "保存できませんでした。社長の確認が済んだ申請は直せません。"
            }
        }
    }
}

/// Camera or library (several), normalized to JPEG.
struct PhotoAddButtons: View {
    let onAdd: (Data) -> Void
    @State private var items: [PhotosPickerItem] = []
    @State private var showsCamera = false

    var body: some View {
        HStack(spacing: 8) {
            #if os(iOS)
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button { showsCamera = true } label: { Label("撮影する", systemImage: "camera") }
                    .buttonStyle(PillButtonStyle(kind: .outline))
            }
            #endif
            PhotosPicker(selection: $items, maxSelectionCount: 10, matching: .images) {
                RepairLibraryLabel()
            }
        }
        .onChange(of: items) { _, picked in
            guard !picked.isEmpty else { return }
            Task {
                for item in picked {
                    if let raw = try? await item.loadTransferable(type: Data.self), let jpeg = ImageEncoding.jpeg(from: raw, maxDimension: 1600) {
                        onAdd(jpeg)
                    }
                }
                items = []
            }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $showsCamera) {
            CameraCapture { raw in if let jpeg = ImageEncoding.jpeg(from: raw, maxDimension: 1600) { onAdd(jpeg) } }.ignoresSafeArea()
        }
        #endif
    }
}

/// PhotosPicker's label closure isn't main-actor isolated.
private struct RepairLibraryLabel: View {
    var body: some View {
        Label("写真を選ぶ", systemImage: "photo.on.rectangle").appFont(14, weight: .semibold)
            .frame(maxWidth: .infinity).padding(.vertical, 10)
            .foregroundStyle(Color.appForeground)
            .overlay(Capsule().stroke(Color.border))
    }
}
