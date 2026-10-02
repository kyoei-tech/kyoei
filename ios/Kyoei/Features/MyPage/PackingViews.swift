import KyoeiCore
import PhotosUI
import Supabase
import SwiftUI
import UniformTypeIdentifiers

enum PackingRepository {
    static func fetch(sheetID: String) async throws -> [PackingRecord] {
        try await Backend.client.from("packing_records").select(PackingRecord.selectColumns)
            .eq("sheet_id", value: sheetID).execute().value
    }

    static func fetchMine(userID: String) async throws -> [PackingRecord] {
        try await Backend.client.from("packing_records").select(PackingRecord.selectColumns)
            .eq("user_id", value: userID)
            .order("loaded_on", ascending: false).order("created_at", ascending: false)
            .limit(300).execute().value
    }

    /// Uploads the new photos, then inserts or updates the record. Removed
    /// photos are deleted after the row no longer points at them.
    static func save(_ record: PackingRecord, isNew: Bool, newPhotos: [Data], removed: [String], userID: String) async throws -> PackingRecord {
        var record = record
        for data in newPhotos {
            let path = try await AttachmentStore.shared.upload(data, filename: "\(record.id).jpg", to: .packingPhotos, folder: userID)
            record.photo_paths.append(path)
        }
        record.updated_at = DBTimestamp.format(Date())
        if isNew {
            try await Backend.client.from("packing_records").insert(record).execute()
        } else {
            try await Backend.client.from("packing_records").update(record).eq("id", value: record.id).execute()
        }
        await AttachmentStore.shared.remove(removed, from: .packingPhotos)
        return record
    }

    static func delete(_ record: PackingRecord) async throws {
        try await Backend.client.from("packing_records").delete().eq("id", value: record.id).execute()
        await AttachmentStore.shared.remove(record.photo_paths, from: .packingPhotos)
    }
}

/// What the editor works on: a 回戦's cars, from a dispatch sheet or (when
/// editing from 荷姿履歴) rebuilt from the record itself.
struct PackingTarget: Identifiable {
    var sheetID: String?
    var sheetTitle: String
    var round: DispatchRound
    var existing: PackingRecord?

    var id: String { "\(sheetID ?? existing?.id ?? "")|\(round.round)" }

    init(sheetID: String, sheetTitle: String, round: DispatchRound, existing: PackingRecord?) {
        self.sheetID = sheetID
        self.sheetTitle = sheetTitle
        self.round = round
        self.existing = existing
    }

    init(record: PackingRecord) {
        sheetID = record.sheet_id
        sheetTitle = record.sheet_title
        existing = record
        round = DispatchRound(round: record.round, vehicles: record.placements.map {
            DispatchVehicle(id: $0.vehicle_index, round: record.round, vehicleName: $0.vehicle_name, chassisNumber: $0.chassis_number, pickup: "", dropoff: "")
        })
    }
}

/// 荷姿の入力: the 回戦's cars (車種・型式・車体番号 in full), placed either by
/// 並び替え (the default: drag the cars into floor order, top to bottom) or
/// by picking each car's 番号, plus photos. ローダー is photo only.
struct PackingEditorView: View {
    enum Mode: String, CaseIterable, Identifiable {
        case reorder = "並び替え"
        case pick = "番号を選ぶ"
        var id: String { rawValue }
    }

    let target: PackingTarget
    let onClose: (PackingRecord?) -> Void

    @Environment(AuthStore.self) private var auth
    @Environment(InspectionStore.self) private var inspections
    @State private var draft = PackingDraft()
    @State private var mode: Mode = .reorder
    /// The 並び替え column; kept in step with `draft`.
    @State private var order: PackingOrder?
    @State private var dragging: PackingOrder.Slot?
    @State private var keptPhotos: [String] = []
    @State private var newPhotos: [Data] = []
    @State private var note = ""
    @State private var saving = false
    @State private var error: String?
    @State private var confirmsDelete = false

    /// The record's own 車格 when editing; otherwise today's profile.
    private var vehicleClass: VehicleClass? {
        target.existing?.vehicle_class.flatMap(VehicleClass.init(rawValue:)) ?? inspections.profile?.vehicle_class
    }
    private var floors: [String] { vehicleClass?.loadingFloors ?? [] }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button("閉じる") { onClose(nil) }.appFont(15, weight: .semibold)
                Spacer()
                Text("\(target.round.title)の荷姿").appFont(16, weight: .black).italic()
                Spacer()
                Button(saving ? "保存中…" : "保存") { save() }
                    .appFont(15, weight: .bold)
                    .disabled(saving)
            }
            .foregroundStyle(Color.chromeForeground)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Color.chrome.ignoresSafeArea(edges: .top))

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    if let error {
                        Text(error).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                    }
                    if vehicleClass == nil {
                        Text("担当車格が未設定のため、写真だけ記録できます。車格は管理者が設定します。")
                            .appFont(13).foregroundStyle(Color.secondary)
                    } else if floors.isEmpty {
                        Text("ローダーは写真のみの記録です。").appFont(13).foregroundStyle(Color.mutedForeground)
                    }
                    if !floors.isEmpty {
                        Picker("入力方法", selection: $mode) {
                            ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }
                    if !floors.isEmpty, mode == .reorder, let order {
                        reorderList(order)
                    } else {
                        ForEach(target.round.vehicles) { vehicle in vehicleRow(vehicle) }
                    }
                    photos
                    FormField(label: "メモ（任意）") {
                        BoxedTextField(placeholder: "例：雨天のため上段は養生", text: $note, fill: .card)
                    }
                    if target.existing != nil {
                        Button("この荷姿の記録を削除") { confirmsDelete = true }
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
        .onAppear {
            draft = PackingDraft(placements: target.existing?.placements ?? [])
            order = PackingOrder(vehicles: target.round.vehicles, floors: floors, draft: draft)
            keptPhotos = target.existing?.photo_paths ?? []
            note = target.existing?.note ?? ""
        }
        // Switching back to 並び替え starts from what was picked.
        .onChange(of: mode) { _, new in
            if new == .reorder { order = PackingOrder(vehicles: target.round.vehicles, floors: floors, draft: draft) }
        }
        .onChange(of: order) { _, new in
            if let new, mode == .reorder { draft = new.draft }
        }
        .overlay {
            if confirmsDelete {
                ConfirmActionDialog(
                    message: "\(target.round.title)の荷姿の記録を削除しますか？\n写真も削除されます。",
                    confirmLabel: "削除する",
                    onConfirm: remove,
                    onCancel: { confirmsDelete = false }
                )
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(target.sheetTitle).appFont(12).foregroundStyle(Color.mutedForeground)
            HStack {
                Text(vehicleClass?.label ?? "車格：未設定").appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
                Spacer()
                Text("\(target.round.vehicles.count)台").appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
            }
            if !floors.isEmpty {
                let placed = target.round.vehicles.filter { draft.floor(of: $0.id) != nil }.count
                Text(mode == .reorder
                     ? "車を長押しして上下に動かし、積んだ順に並べてください（\(placed)/\(target.round.vehicles.count)台 入力済）"
                     : "積んだ場所をタップしてください（\(placed)/\(target.round.vehicles.count)台 入力済）")
                    .appFont(12).foregroundStyle(Color.mutedForeground)
            }
        }
    }

    private func vehicleRow(_ vehicle: DispatchVehicle) -> some View {
        let current = draft.floor(of: vehicle.id)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(vehicle.vehicleName.isEmpty ? "（車名なし）" : vehicle.vehicleName).appFont(17, weight: .bold).foregroundStyle(Color.appForeground)
                if !vehicle.modelCode.isEmpty {
                    Text(vehicle.modelCode).appFont(13, weight: .semibold).monospaced().foregroundStyle(Color.mutedForeground)
                }
                Spacer()
                if let current {
                    Text(current).appFont(15, weight: .black).foregroundStyle(Color.primary)
                }
            }
            if vehicle.chassisNumber.isEmpty {
                Text("車体番号：空欄").appFont(12).foregroundStyle(Color.mutedForeground)
            } else {
                ChassisNumberText(chassis: vehicle.chassisNumber)
            }
            if !floors.isEmpty {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 64), spacing: 6)], spacing: 6) {
                    ForEach(floors, id: \.self) { floor in
                        let selected = current == floor
                        let takenByOther = !selected && target.round.vehicles.contains { $0.id != vehicle.id && draft.floor(of: $0.id) == floor }
                        Button { draft.assign(floor, to: vehicle.id) } label: {
                            Text(floor).appFont(14, weight: .bold)
                                .frame(maxWidth: .infinity, minHeight: 40)
                                .foregroundStyle(selected ? Color.brandForeground : (takenByOther ? Color.mutedForeground : Color.appForeground))
                                .background(selected ? Color.brand : (takenByOther ? Color.muted : Color.appBackground), in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? Color.brand : Color.border))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(vehicle.vehicleName)を\(floor)に積んだ\(takenByOther ? "（他の車が入力済み）" : "")")
                    }
                }
            }
        }
        .padding(14)
        .card()
    }

    // MARK: 並び替え

    /// Floors down the left, cars (and 空き) in the column: a car dropped on
    /// a row takes that floor and pushes the others along.
    private func reorderList(_ order: PackingOrder) -> some View {
        let vehicles = Dictionary(uniqueKeysWithValues: target.round.vehicles.map { ($0.id, $0) })
        return VStack(spacing: 6) {
            ForEach(Array(order.slots.enumerated()), id: \.element) { index, slot in
                if index == order.floors.count {
                    Text("ここから下は積む場所が入っていません").appFont(11, weight: .bold).foregroundStyle(Color.mutedForeground)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                }
                HStack(spacing: 8) {
                    Text(order.floor(at: index) ?? "－")
                        .appFont(14, weight: .black)
                        .foregroundStyle(order.floor(at: index) == nil ? Color.mutedForeground : Color.primary)
                        .frame(width: 56, alignment: .leading)
                    slotCard(slot, vehicles: vehicles, index: index, count: order.slots.count)
                        .onDrag {
                            dragging = slot
                            return NSItemProvider(object: String(describing: slot) as NSString)
                        }
                        .onDrop(of: [.text], delegate: SlotDropDelegate(slot: slot, order: $order, dragging: $dragging))
                }
            }
        }
        .animation(.easeOut(duration: 0.2), value: order.slots)
    }

    private func slotCard(_ slot: PackingOrder.Slot, vehicles: [Int: DispatchVehicle], index: Int, count: Int) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "line.3.horizontal").foregroundStyle(Color.mutedForeground)
            switch slot {
            case .vehicle(let id):
                let vehicle = vehicles[id]
                VStack(alignment: .leading, spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(vehicle.map { $0.vehicleName.isEmpty ? "（車名なし）" : $0.vehicleName } ?? "").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                        if let model = vehicle?.modelCode, !model.isEmpty {
                            Text(model).appFont(12, weight: .semibold).monospaced().foregroundStyle(Color.mutedForeground)
                        }
                    }
                    if let chassis = vehicle?.chassisNumber, !chassis.isEmpty {
                        ChassisNumberText(chassis: chassis, compact: true)
                    } else {
                        Text("車体番号：空欄").appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                }
            case .empty:
                Text("空き").appFont(14, weight: .bold).foregroundStyle(Color.mutedForeground)
            }
            Spacer(minLength: 4)
            VStack(spacing: 2) {
                stepButton("chevron.up", label: "上へ", disabled: index == 0) { order?.step(index, by: -1) }
                stepButton("chevron.down", label: "下へ", disabled: index == count - 1) { order?.step(index, by: 1) }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(slot.isEmpty ? Color.appBackground : Color.card, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.border, style: StrokeStyle(lineWidth: 1, dash: slot.isEmpty ? [5, 4] : [])))
        .contentShape(.dragPreview, RoundedRectangle(cornerRadius: 12))
    }

    private func stepButton(_ icon: String, label: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 12, weight: .bold)).frame(width: 30, height: 20)
        }
        .buttonStyle(.plain)
        .foregroundStyle(disabled ? Color.border : Color.mutedForeground)
        .disabled(disabled)
        .accessibilityLabel(label)
    }

    private var photos: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("写真").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) {
                ForEach(keptPhotos, id: \.self) { path in
                    photoTile(AttachmentImage(reference: .stored(bucket: .packingPhotos, path: path), contentMode: .fill)) {
                        keptPhotos.removeAll { $0 == path }
                    }
                }
                ForEach(Array(newPhotos.enumerated()), id: \.offset) { index, data in
                    if let image = Image(imageData: data) {
                        photoTile(image.resizable().scaledToFill()) { newPhotos.remove(at: index) }
                    }
                }
            }
            PackingPhotoButtons { data in newPhotos.append(data) }
        }
        .padding(14)
        .card()
    }

    private func photoTile(_ content: some View, onRemove: @escaping () -> Void) -> some View {
        content
            .frame(height: 100).frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(alignment: .topTrailing) {
                Button(action: onRemove) {
                    Image(systemName: "xmark.circle.fill").font(.system(size: 22)).foregroundStyle(.white, .black.opacity(0.6))
                }
                .buttonStyle(.plain)
                .padding(4)
                .accessibilityLabel("写真を外す")
            }
    }

    private func save() {
        guard let userID = auth.userID else { return }
        saving = true
        error = nil
        let profile = inspections.profile
        let existing = target.existing
        var record = existing ?? PackingRecord(
            sheetID: target.sheetID, sheetTitle: target.sheetTitle, round: target.round.round,
            loadedOn: LocalDate(Date()), vehicleClass: profile?.vehicle_class,
            vehiclePlate: profile?.vehicle?.plate ?? "",
            chassisPlate: profile?.vehicle_class?.isTrailer == true ? profile?.chassis?.plate : nil,
            placements: []
        )
        record.placements = draft.placements(for: target.round.vehicles)
        record.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let removed = (existing?.photo_paths ?? []).filter { !keptPhotos.contains($0) }
        record.photo_paths = keptPhotos
        let photos = newPhotos
        Task {
            do {
                let saved = try await PackingRepository.save(record, isNew: existing == nil, newPhotos: photos, removed: removed, userID: userID)
                saving = false
                onClose(saved)
            } catch {
                saving = false
                self.error = "保存できませんでした。通信状況を確認して、もう一度「保存」を押してください。"
            }
        }
    }

    private func remove() {
        confirmsDelete = false
        guard let existing = target.existing else { return }
        Task {
            do {
                try await PackingRepository.delete(existing)
                onClose(nil)
            } catch {
                self.error = "削除できませんでした。通信状況を確認してください。"
            }
        }
    }
}

extension PackingOrder.Slot {
    var isEmpty: Bool {
        if case .empty = self { return true }
        return false
    }
}

/// Live reorder: as a dragged car passes over a row it moves into that
/// place, pushing the others along.
private struct SlotDropDelegate: DropDelegate {
    let slot: PackingOrder.Slot
    @Binding var order: PackingOrder?
    @Binding var dragging: PackingOrder.Slot?

    func dropEntered(info: DropInfo) {
        guard let dragging, dragging != slot, let slots = order?.slots,
              let from = slots.firstIndex(of: dragging), let to = slots.firstIndex(of: slot) else { return }
        order?.move(fromOffsets: [from], toOffset: to > from ? to + 1 : to)
    }

    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .move) }

    func performDrop(info: DropInfo) -> Bool {
        dragging = nil
        return true
    }
}

/// Camera (one at a time) or library (several at once), normalized to JPEG.
private struct PackingPhotoButtons: View {
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
                PackingLibraryLabel()
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
private struct PackingLibraryLabel: View {
    var body: some View {
        Label("写真を選ぶ", systemImage: "photo.on.rectangle").appFont(14, weight: .semibold)
            .frame(maxWidth: .infinity).padding(.vertical, 10)
            .foregroundStyle(Color.appForeground)
            .overlay(Capsule().stroke(Color.border))
    }
}

/// マイページ > 荷姿履歴: own records by date, newest first.
struct PackingHistoryView: View {
    @Environment(AuthStore.self) private var auth
    @State private var records: [PackingRecord] = []
    @State private var loading = true
    @State private var failed = false
    @State private var editing: PackingTarget?

    var body: some View {
        TabPage {
            PageHeading(title: "荷姿履歴", subtitle: "回戦ごとに、何番に何を積んだかと写真の記録です。入力は配車表の各回戦から行います。")
            if loading && records.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 120)
            } else if failed && records.isEmpty {
                EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。")
            } else if records.isEmpty {
                EmptyStateBox(text: "まだ荷姿の記録はありません。\n配車表の回戦まとめにある「荷姿を記録」から入力できます。")
            }
            ForEach(groupedByDay, id: \.day) { group in
                Text("\(group.day.month)月\(group.day.day)日（\(JapaneseCalendarText.weekdays[weekday(group.day)])）・\(group.records.reduce(0) { $0 + $1.placements.count })台")
                    .appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
                    .padding(.top, 4)
                ForEach(group.records) { record in
                    PackingRecordCard(record: record, onEdit: { editing = PackingTarget(record: record) })
                }
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .fullScreen(item: $editing) { target in
            PackingEditorView(target: target) { _ in
                editing = nil
                Task { await load() }
            }
        }
    }

    private var groupedByDay: [(day: LocalDate, records: [PackingRecord])] {
        Dictionary(grouping: records, by: \.loaded_on)
            .map { ($0.key, $0.value.sorted { $0.round < $1.round }) }
            .sorted { $0.0 > $1.0 }
    }

    private func weekday(_ day: LocalDate) -> Int {
        Calendar.current.component(.weekday, from: day.startDate()) - 1
    }

    private func load() async {
        guard let userID = auth.userID else { return }
        loading = true
        do {
            records = try await PackingRepository.fetchMine(userID: userID)
            failed = false
            #if DEBUG
            if DebugShot.sub == "editor", editing == nil, let first = records.first { editing = PackingTarget(record: first) }
            #endif
        } catch {
            failed = true
        }
        loading = false
    }
}

struct PackingRecordCard: View {
    let record: PackingRecord
    var onEdit: (() -> Void)?

    var body: some View {
        let floors = record.vehicle_class.flatMap(VehicleClass.init(rawValue:))?.loadingFloors ?? []
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(record.roundTitle)・\(record.placements.count)台").appFont(15, weight: .black).foregroundStyle(Color.appForeground)
                Spacer()
                if let onEdit {
                    Button("編集", action: onEdit).appFont(13, weight: .semibold).foregroundStyle(Color.primary)
                }
            }
            if !record.sheet_title.isEmpty {
                Text(record.sheet_title).appFont(12).foregroundStyle(Color.mutedForeground)
            }
            ForEach(Array(record.ordered(floors: floors).enumerated()), id: \.offset) { _, placement in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(placement.floor ?? "－").appFont(14, weight: .black)
                        .foregroundStyle(placement.floor == nil ? Color.mutedForeground : Color.primary)
                        .frame(width: 56, alignment: .leading)
                    VStack(alignment: .leading, spacing: 1) {
                        Text([placement.vehicle_name, placement.model].filter { !$0.isEmpty }.joined(separator: "　"))
                            .appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                        if !placement.chassis_number.isEmpty {
                            Text(placement.chassis_number).appFont(12).monospaced().foregroundStyle(Color.mutedForeground)
                        }
                    }
                }
            }
            if !record.photo_paths.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(record.photo_paths, id: \.self) { path in
                            AttachmentImage(reference: .stored(bucket: .packingPhotos, path: path), contentMode: .fill)
                                .frame(width: 120, height: 90)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
            if !record.note.isEmpty {
                Text(record.note).appFont(12).foregroundStyle(Color.mutedForeground)
            }
        }
        .padding(14)
        .card()
    }
}
