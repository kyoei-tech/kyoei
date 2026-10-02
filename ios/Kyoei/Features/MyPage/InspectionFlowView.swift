import KyoeiCore
import PhotosUI
import SwiftUI

/// 日常点検: one item per screen (可・否・該当なし). A 否 asks what is wrong
/// (photo optional); any 否 ends with the report to the 運行管理者, whose
/// instruction decides whether 出庫 is allowed. A trailer's head, coupling
/// and chassis are checked in one go.
struct InspectionFlowView: View {
    /// The saved record, or nil when cancelled.
    let onFinish: (InspectionRecord?) -> Void

    @Environment(InspectionStore.self) private var store

    private enum Phase: Equatable { case setup, step(Int), report, done(InspectionRecord) }

    private struct Answer {
        var result: InspectionAnswer
        var note = ""
        var photo: Data?
    }

    @State private var phase: Phase = .setup
    @State private var startedAt = Date()
    @State private var vehiclePlate = ""
    @State private var chassisPlate = ""
    @State private var steps: [(part: InspectionPart, step: InspectionStep)] = []
    @State private var answers: [String: Answer] = [:]
    /// 否 being written for the current step.
    @State private var ngDraft: Answer?
    @State private var reportedTo = ""
    @State private var reportedAt = Date()
    @State private var instruction: InspectionInstruction?
    @State private var reportNote = ""
    @State private var confirmsCancel = false
    @State private var saving = false
    /// 修理申請 prefilled from this inspection's 否 items.
    @State private var repairDraft: RepairEditorTarget?
    @State private var repairSent = false

    private var vehicleClass: VehicleClass? { store.profile?.vehicle_class }
    private var isTrailer: Bool { vehicleClass?.isTrailer == true }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    switch phase {
                    case .setup: setup
                    case .step(let index): stepView(index)
                    case .report: report
                    case .done(let record): done(record)
                    }
                }
                .padding(16)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .fullScreen(item: $repairDraft) { target in
            RepairEditorView(target: target) { saved in
                repairDraft = nil
                if saved { repairSent = true }
            }
        }
        .onAppear {
            vehiclePlate = store.profile?.vehicle?.plate ?? ""
            chassisPlate = store.profile?.chassis?.plate ?? ""
            reportedTo = store.lastReportedTo
        }
        .overlay {
            if confirmsCancel {
                ConfirmActionDialog(
                    message: "日常点検を中止しますか？\nここまでの入力は保存されません。",
                    confirmLabel: "中止する",
                    cancelLabel: "続ける",
                    onConfirm: { onFinish(nil) },
                    onCancel: { confirmsCancel = false }
                )
            }
        }
    }

    // MARK: Top bar

    private var topBar: some View {
        HStack(spacing: 12) {
            if case .done = phase {
                Spacer().frame(width: 36)
            } else {
                Button { confirmsCancel = true } label: {
                    Image(systemName: "xmark").font(.system(size: 16, weight: .bold))
                        .frame(width: 36, height: 36)
                        .background(Color.muted, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("点検を中止")
            }
            Spacer(minLength: 0)
            Text("日常点検").appFont(16, weight: .black).italic().foregroundStyle(Color.chromeForeground)
            Spacer(minLength: 0)
            Spacer().frame(width: 36)
        }
        .foregroundStyle(Color.chromeForeground)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.chrome.ignoresSafeArea(edges: .top))
    }

    // MARK: Setup

    private var setup: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text("点検する車両").appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                Text(vehicleClass?.label ?? "車格：未設定").appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
                plateField(isTrailer ? "ヘッド" : "車両", assigned: store.profile?.vehicle?.plate, text: $vehiclePlate)
                if isTrailer {
                    plateField("台車", assigned: store.profile?.chassis?.plate, text: $chassisPlate)
                }
            }
            .padding(16)
            .card()

            if store.items.isEmpty {
                Text("点検項目を読み込めませんでした。電波のある場所で、もう一度開いてください。")
                    .appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
            } else {
                let parts = plan()
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(parts) { part in
                        HStack {
                            Text(part.title).appFont(14, weight: .semibold)
                            Spacer()
                            Text("\(part.steps.count)項目").appFont(14, weight: .bold).monospacedDigit()
                        }
                        .foregroundStyle(Color.appForeground)
                    }
                    Text("「週1」「月1」の項目は、前回の点検から期間が空いたときだけ出ます。前回「否」だった項目は必ず出ます。")
                        .appFont(12).foregroundStyle(Color.mutedForeground).padding(.top, 4)
                }
                .padding(16)
                .card()

                Button {
                    begin(parts)
                } label: {
                    Text("点検を始める").appFont(18, weight: .black).italic()
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .foregroundStyle(Color.brandForeground)
                        .background(Color.brand, in: SlantedRectangle(slant: 12))
                }
                .buttonStyle(PressScaleStyle())
                .disabled(trimmed(vehiclePlate).isEmpty || (isTrailer && trimmed(chassisPlate).isEmpty))
                .opacity(trimmed(vehiclePlate).isEmpty || (isTrailer && trimmed(chassisPlate).isEmpty) ? 0.4 : 1)
            }
        }
    }

    @ViewBuilder private func plateField(_ title: String, assigned: String?, text: Binding<String>) -> some View {
        if let assigned, !assigned.isEmpty {
            HStack {
                Text(title).appFont(13).foregroundStyle(Color.mutedForeground)
                Spacer()
                Text(assigned).appFont(16, weight: .bold).monospaced().foregroundStyle(Color.appForeground)
            }
        } else {
            FormField(label: "\(title)のナンバー（担当車両が未定のため入力）") {
                BoxedTextField(placeholder: "例：相模 100 あ 1234", text: text, fill: .card)
            }
        }
    }

    private func plan() -> [InspectionPart] {
        InspectionPlan.parts(
            items: store.items,
            vehicleClass: vehicleClass,
            vehiclePlate: trimmed(vehiclePlate),
            chassisPlate: isTrailer ? trimmed(chassisPlate) : nil,
            history: store.records,
            today: LocalDate(Date())
        )
    }

    private func begin(_ parts: [InspectionPart]) {
        steps = parts.flatMap { part in part.steps.map { (part, $0) } }
        answers = [:]
        startedAt = Date()
        phase = steps.isEmpty ? .report : .step(0)
        if steps.isEmpty { finishSteps() }
    }

    // MARK: Steps

    @ViewBuilder private func stepView(_ index: Int) -> some View {
        let (part, step) = steps[index]
        let answer = answers[step.id]
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("\(part.title)　\(part.plate)").appFont(13, weight: .semibold).foregroundStyle(Color.mutedForeground).lineLimit(1)
                Spacer()
                Text("\(index + 1) / \(steps.count)").appFont(13, weight: .bold).monospacedDigit().foregroundStyle(Color.appForeground)
            }
            ProgressView(value: Double(index), total: Double(steps.count)).tint(Color.brand)
        }

        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(step.item.section).appFont(13, weight: .bold).foregroundStyle(Color.primary)
                if step.followUp {
                    badge("前回「否」", color: .destructive)
                }
                if step.item.frequency != .every {
                    badge(step.item.frequency.label + (step.lastChecked.map { "・前回 \($0.month)/\($0.day)" } ?? ""), color: .secondary)
                }
            }
            Text(step.item.label).appFont(20, weight: .bold).foregroundStyle(Color.appForeground)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
        .padding(18)
        .card()

        if let draft = ngDraft {
            ngEditor(draft, index: index)
        } else {
            HStack(spacing: 10) {
                answerButton(.ok, selected: answer?.result == .ok, fill: .brand, foreground: .brandForeground) {
                    answers[step.id] = Answer(result: .ok)
                    advance(from: index)
                }
                answerButton(.ng, selected: answer?.result == .ng, fill: .destructive, foreground: .destructiveForeground) {
                    ngDraft = answer?.result == .ng ? answer : Answer(result: .ng)
                }
            }
            answerButton(.na, selected: answer?.result == .na, fill: .muted, foreground: .appForeground, height: 52) {
                answers[step.id] = Answer(result: .na)
                advance(from: index)
            }
            if index > 0 {
                Button { phase = .step(index - 1) } label: {
                    Label("前の項目に戻る", systemImage: "chevron.left").appFont(14, weight: .semibold)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.mutedForeground)
                .padding(.top, 4)
            }
        }
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text).appFont(11, weight: .bold).foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.14), in: Capsule())
    }

    private func answerButton(_ value: InspectionAnswer, selected: Bool, fill: Color, foreground: Color, height: CGFloat = 88, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if selected { Image(systemName: "checkmark.circle.fill") }
                Text(value.label).appFont(value == .na ? 17 : 26, weight: .black)
            }
            .frame(maxWidth: .infinity, minHeight: height)
            .foregroundStyle(foreground)
            .background(fill, in: SlantedRectangle(slant: 12))
            .overlay(SlantedRectangle(slant: 12).stroke(selected ? Color.appForeground : .clear, lineWidth: 3))
        }
        .buttonStyle(PressScaleStyle())
    }

    @ViewBuilder private func ngEditor(_ draft: Answer, index: Int) -> some View {
        let step = steps[index].step
        VStack(alignment: .leading, spacing: 12) {
            Label("否：異常の内容を記録してください", systemImage: "exclamationmark.triangle.fill")
                .appFont(14, weight: .bold).foregroundStyle(Color.destructive)
            FormField(label: "異常の内容（必須）") {
                TextField("例：右前タイヤの側面に亀裂", text: Binding(
                    get: { ngDraft?.note ?? "" },
                    set: { ngDraft?.note = $0 }
                ), axis: .vertical)
                .lineLimit(2...5)
                .appFont(15)
                .padding(12)
                .card(radius: 14, fill: .appBackground)
            }
            InspectionPhotoPicker(data: Binding(get: { ngDraft?.photo }, set: { ngDraft?.photo = $0 }))
            HStack(spacing: 8) {
                Button("やめる") { ngDraft = nil }
                    .buttonStyle(PillButtonStyle(kind: .outline))
                Button("否で記録して次へ") {
                    answers[step.id] = ngDraft
                    ngDraft = nil
                    advance(from: index)
                }
                .buttonStyle(PillButtonStyle(kind: .destructive))
                .disabled(trimmed(draft.note).isEmpty)
                .opacity(trimmed(draft.note).isEmpty ? 0.5 : 1)
            }
        }
        .padding(16)
        .card(border: Color.destructive.opacity(0.6))
    }

    private func advance(from index: Int) {
        if index + 1 < steps.count {
            phase = .step(index + 1)
        } else {
            finishSteps()
        }
    }

    private var issues: [(part: InspectionPart, step: InspectionStep, answer: Answer)] {
        steps.compactMap { entry in
            guard let answer = answers[entry.step.id], answer.result == .ng else { return nil }
            return (entry.part, entry.step, answer)
        }
    }

    private func finishSteps() {
        if issues.isEmpty {
            save(report: nil)
        } else {
            reportedAt = Date()
            phase = .report
        }
    }

    // MARK: Report

    @ViewBuilder private var report: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("異常があります。運行管理者に報告してください。", systemImage: "exclamationmark.triangle.fill")
                .appFont(16, weight: .bold).foregroundStyle(Color.destructive)
            ForEach(issues, id: \.step.id) { issue in
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(issue.part.title)・\(issue.step.item.section)").appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                    Text(issue.step.item.label).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                    Text(issue.answer.note).appFont(14, weight: .bold).foregroundStyle(Color.destructive)
                    if issue.answer.photo != nil {
                        Label("写真あり", systemImage: "photo").appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Color.destructive.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(16)
        .card()

        VStack(alignment: .leading, spacing: 14) {
            Text("運行管理者への報告").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
            FormField(label: "報告先（運行管理者の名前）") {
                BoxedTextField(placeholder: "例：運輸課長 山田", text: $reportedTo)
            }
            FormField(label: "報告日時") {
                DatePicker("報告日時", selection: $reportedAt, in: ...Date()).labelsHidden()
            }
            FormField(label: "受けた指示") {
                VStack(spacing: 8) {
                    ForEach(InspectionInstruction.allCases, id: \.self) { option in
                        Button { instruction = option } label: {
                            HStack {
                                Image(systemName: instruction == option ? "largecircle.fill.circle" : "circle")
                                Text(option.label).appFont(15, weight: .bold)
                                Spacer()
                                Text(option == .ok ? "出庫できます" : "出庫できません").appFont(12)
                                    .foregroundStyle(option == .ok ? Color.primary : Color.destructive)
                            }
                            .padding(12)
                            .foregroundStyle(Color.appForeground)
                            .background(instruction == option ? Color.primary.opacity(0.12) : Color.appBackground, in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(instruction == option ? Color.primary : Color.border))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            FormField(label: "メモ（任意）") {
                BoxedTextField(placeholder: "例：帰庫後に修理工場へ", text: $reportNote)
            }
            let ready = !trimmed(reportedTo).isEmpty && instruction != nil && !saving
            Button(saving ? "記録中…" : "点検を記録する") {
                guard let instruction else { return }
                store.lastReportedTo = trimmed(reportedTo)
                save(report: InspectionReport(reportedTo: trimmed(reportedTo), reportedAt: reportedAt, instruction: instruction, note: trimmed(reportNote)))
            }
            .buttonStyle(PillButtonStyle())
            .disabled(!ready)
            .opacity(ready ? 1 : 0.5)
            if let last = steps.indices.last {
                Button { phase = .step(last) } label: {
                    Label("点検に戻る", systemImage: "chevron.left").appFont(14, weight: .semibold)
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.mutedForeground)
            }
        }
        .padding(16)
        .card()
    }

    private func save(report: InspectionReport?) {
        saving = true
        var photos: [Int: Data] = [:]
        var results: [InspectionResult] = []
        for entry in steps {
            guard let answer = answers[entry.step.id] else { continue }
            if let photo = answer.photo { photos[results.count] = photo }
            results.append(InspectionResult(
                item_id: entry.step.item.id, unit: entry.step.unit, plate: entry.step.plate,
                section: entry.step.item.section, label: entry.step.item.label,
                result: answer.result, note: answer.result == .ng ? trimmed(answer.note) : "",
                follow_up: entry.step.followUp
            ))
        }
        let now = Date()
        let record = InspectionRecord(
            inspectedOn: LocalDate(now), startedAt: startedAt, completedAt: now,
            vehicleClass: vehicleClass, vehiclePlate: trimmed(vehiclePlate),
            chassisPlate: isTrailer ? trimmed(chassisPlate) : nil,
            results: results, report: report
        )
        Task {
            await store.finish(record, photos: photos)
            saving = false
            phase = .done(record)
        }
    }

    // MARK: Done

    @ViewBuilder private func done(_ record: InspectionRecord) -> some View {
        let allowed = record.allowsDeparture
        VStack(spacing: 14) {
            Image(systemName: allowed ? "checkmark.seal.fill" : "xmark.octagon.fill")
                .font(.system(size: 64, weight: .bold))
                .foregroundStyle(allowed ? Color.primary : Color.destructive)
            Text("日常点検を記録しました").appFont(20, weight: .bold).foregroundStyle(Color.appForeground)
            Text(allowed ? (record.has_issue ? "運行管理者の指示により、出庫できます。" : "異常はありません。出庫できます。")
                 : "出庫できません。修理などの対応のあと、もう一度日常点検を行ってください。")
                .appFont(15, weight: .semibold)
                .foregroundStyle(allowed ? Color.appForeground : Color.destructive)
                .multilineTextAlignment(.center)
            Text("可 \(record.results.filter { $0.result == .ok }.count)　否 \(record.issues.count)　該当なし \(record.results.filter { $0.result == .na }.count)")
                .appFont(13).monospacedDigit().foregroundStyle(Color.mutedForeground)
            if store.pending.contains(where: { $0.record.id == record.id }) {
                Text("電波が戻ったら自動で送信します（この端末には保存済みです）。")
                    .appFont(12).foregroundStyle(Color.secondary).multilineTextAlignment(.center)
            }
            if record.has_issue {
                if repairSent {
                    Label("修理申請を送りました", systemImage: "checkmark.circle.fill").appFont(14, weight: .bold).foregroundStyle(Color.primary)
                } else {
                    Button("この内容で修理申請を作成") { repairDraft = RepairEditorTarget(existing: nil, draft: record) }
                        .buttonStyle(PillButtonStyle(kind: .outline))
                        .padding(.top, 4)
                }
            }
            Button(allowed ? "出庫へ進む" : "閉じる") { onFinish(record) }
                .buttonStyle(PillButtonStyle(kind: allowed ? .primary : .outline))
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .card()
    }

    private func trimmed(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// 否の写真: camera or library, one photo, optional.
private struct InspectionPhotoPicker: View {
    @Binding var data: Data?
    @State private var pickerItem: PhotosPickerItem?
    @State private var showsCamera = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("写真（任意）").appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            if let data, let image = Image(imageData: data) {
                image.resizable().scaledToFill()
                    .frame(height: 160).frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Button("写真を削除") { self.data = nil }.appFont(13).foregroundStyle(Color.destructive)
            } else {
                HStack(spacing: 8) {
                    #if os(iOS)
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button { showsCamera = true } label: { Label("撮影する", systemImage: "camera") }
                            .buttonStyle(PillButtonStyle(kind: .outline))
                    }
                    #endif
                    PhotosPicker(selection: $pickerItem, matching: .images) {
                        PickPhotoLabel()
                    }
                }
            }
        }
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                defer { pickerItem = nil }
                if let raw = try? await item.loadTransferable(type: Data.self) { data = ImageEncoding.jpeg(from: raw, maxDimension: 1600) }
            }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $showsCamera) {
            CameraCapture { raw in data = ImageEncoding.jpeg(from: raw, maxDimension: 1600) }.ignoresSafeArea()
        }
        #endif
    }
}

/// PhotosPicker's label closure isn't main-actor isolated, so the styled
/// label lives in its own view.
private struct PickPhotoLabel: View {
    var body: some View {
        Label("写真を選ぶ", systemImage: "photo.on.rectangle").appFont(14, weight: .semibold)
            .frame(maxWidth: .infinity).padding(.vertical, 10)
            .foregroundStyle(Color.appForeground)
            .overlay(Capsule().stroke(Color.border))
    }
}
