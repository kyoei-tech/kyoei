import KyoeiCore
import SwiftUI
#if os(iOS)
import AVFoundation
#endif

/// 車台番号をカメラで照合: hold the camera over the caution plate or stamping
/// and a number that matches the sheet is read without pressing anything.
/// After 30 seconds without a match the shutter appears; a shot that still
/// can't be read (汚れ・サビ) is kept and the number is spoken instead. Exact
/// match against the sheet (外車: after the last letter) → 確認 or 警告.
///
/// Frames and photos are read on the phone and discarded; a number that
/// matches a vehicle goes straight to its result, anything else is shown for
/// the driver to judge. A 記録 (blank 車体番号) keeps its photo, and so does
/// a voice 照合 that followed an unreadable shot.
///
/// When the sheet leaves a vehicle's 車体番号 blank there is nothing to match,
/// so the number read off the real car is recorded for it instead (記録).
struct ChassisScanFlow: View {
    let vehicles: [DispatchVehicle]
    let target: DispatchVehicle?
    let state: SheetChassisState
    /// (vehicle, number read, where it was read). For a 照合 the read number
    /// equals the sheet's; for a 記録 it is the number to store.
    let onConfirm: (DispatchVehicle, String, ChassisCheckMethod, ChassisInput, Data?) -> Void
    let onClose: () -> Void

    private enum Phase: Equatable {
        case scanning
        /// Reading the photo just taken.
        case reading
        /// Read numbers that match no vehicle (or nothing read), for the driver to judge.
        case readResult
        /// Speaking the number.
        case voice
        case matched(DispatchVehicle)
        case mismatch(read: String)
        /// Opened from `target`'s badge, but the number is another vehicle's.
        case wrongVehicle(target: DispatchVehicle, matched: DispatchVehicle, read: String)
        /// Confirm recording `read` for a blank-numbered vehicle.
        case record(DispatchVehicle, read: String)
        /// The number read for a blank vehicle is another vehicle's printed number.
        case belongsTo(DispatchVehicle, read: String, other: DispatchVehicle)
    }

    @State private var phase: Phase = .scanning
    @State private var candidates: [String] = []
    /// The shot being judged; dropped on 撮り直す, kept only by a 記録.
    @State private var photo: Data?
    @State private var input: ChassisInput = .camera
    @State private var voiceDraft = ""
    @State private var speech = ChassisSpeech()
    @State private var torchOn = false
    #if os(iOS)
    @State private var camera = ChassisCamera()
    #endif
    @State private var method: ChassisCheckMethod = .cautionPlate
    /// Vehicles confirmed in this camera session (id → how), so 続けて照合
    /// knows them before the parent's list refreshes.
    @State private var confirmedHere: [Int: ChassisCheckMethod] = [:]
    /// The shutter shows after `shutterDelay` of live reading without a match.
    @State private var shutterShown = false
    private static let shutterDelay: Duration = .seconds(30)

    /// Opened from the top button: after each confirmation the camera comes
    /// back for the next car (続けて照合) instead of closing.
    private var isContinuous: Bool { target == nil }

    private var isRecording: Bool { target?.needsRecording == true }

    /// A 記録 has nothing to match, so it is always shot by hand.
    private var showsShutter: Bool { shutterShown || isRecording }

    /// Blank-numbered vehicles confirmed as blank (原本・伝票) and not yet recorded.
    private var recordable: [DispatchVehicle] {
        vehicles.filter {
            guard confirmedHere[$0.id] == nil else { return false }  // recorded in this session
            if case .blankConfirmed = state.status(of: $0) { return true }
            return false
        }
    }

    /// Blank-numbered vehicles whose blank has not been confirmed yet (要確認).
    private var needingReview: [DispatchVehicle] {
        vehicles.filter { state.status(of: $0).needsReview }
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            switch phase {
            case .scanning, .reading:
                scanning
            case .readResult:
                readResult
            case .voice:
                voiceEntry
            case .matched(let vehicle):
                matched(vehicle)
            case .mismatch(let read):
                mismatch(read)
            case .wrongVehicle(let target, let matched, let read):
                wrongVehicle(target: target, matched: matched, read: read)
            case .record(let vehicle, let read):
                record(vehicle, read: read)
            case .belongsTo(let vehicle, let read, let other):
                belongsTo(vehicle, read: read, other: other)
            }
        }
        .sensoryFeedback(trigger: phase) { _, new in
            switch new {
            case .matched, .record: .success
            case .mismatch, .wrongVehicle, .belongsTo: .error
            case .scanning, .reading, .readResult, .voice: nil
            }
        }
        #if DEBUG
        .onAppear {
            if DebugShot.sub == "voice" {
                input = .voice
                method = .stamp
                voiceDraft = "ZVW30-1234567"
                phase = .voice
            }
        }
        #endif
        #if os(iOS)
        .onAppear {
            camera.start()
            updateLiveReading()
        }
        .onDisappear {
            camera.stop()
            speech.stop()
        }
        .onChange(of: phase) { _, _ in updateLiveReading() }
        #endif
        .task {
            try? await Task.sleep(for: Self.shutterDelay)
            shutterShown = true
        }
    }

    // MARK: Scanning (shutter)

    private var scanning: some View {
        ZStack {
            CameraArea(camera: cameraHandle, frozen: phase == .reading ? photo : nil)
                .ignoresSafeArea()
            VStack(spacing: 12) {
                HStack {
                    closeButton
                    Spacer()
                    if hasTorch {
                        Button {
                            torchOn.toggle()
                            setTorch(torchOn)
                        } label: {
                            Image(systemName: torchOn ? "flashlight.on.fill" : "flashlight.off.fill")
                                .font(.system(size: 17, weight: .bold))
                                .frame(width: 44, height: 44)
                                .background(torchOn ? Color.brand.opacity(0.9) : .black.opacity(0.5), in: Circle())
                                .foregroundStyle(torchOn ? Color.brandForeground : .white)
                        }
                        .accessibilityLabel(torchOn ? "ライトを消す" : "ライトをつける")
                    }
                }
                .foregroundStyle(.white)
                instructions
                Spacer()
                // Guide: keep the number inside, then press the shutter.
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.brandLime, style: StrokeStyle(lineWidth: 3, dash: [10, 6]))
                    .frame(height: 120)
                    .overlay(alignment: .bottom) {
                        Text(showsShutter ? "この枠に車台番号を入れて撮影" : "この枠に車台番号を入れてください").appFont(12, weight: .bold).foregroundStyle(.white)
                            .padding(.horizontal, 10).padding(.vertical, 4).background(.black.opacity(0.55), in: Capsule())
                            .offset(y: 16)
                    }
                    .allowsHitTesting(false)
                Spacer()
                shutterBar
            }
            .padding(16)
        }
    }

    private var closeButton: some View {
        Button(action: close) {
            Image(systemName: "xmark").font(.system(size: 17, weight: .bold))
                .frame(width: 44, height: 44).background(.black.opacity(0.5), in: Circle())
        }
        .accessibilityLabel("閉じる")
    }

    private var instructions: some View {
        VStack(spacing: 4) {
            Text(isRecording ? "記録する車の車体番号を撮影してください"
                 : showsShutter ? "読み取れないときは、撮影ボタンを押してください"
                 : "コーションプレート、または刻印の車台番号にカメラをかざしてください")
                .appFont(15, weight: .bold)
            if isContinuous && !confirmedHere.isEmpty {
                Label("続けて照合中 ・ 今回 \(confirmedHere.count)台 確認", systemImage: "checkmark.circle.fill")
                    .appFont(13, weight: .bold)
                    .foregroundStyle(Color.brandLime)
            }
            if let target {
                Text(isRecording
                    ? "記録する車：\(target.vehicleName)（配車表は車体番号が空欄）"
                    : "照合する車：\(target.vehicleName)（\(target.chassisNumber)）")
                    .appFont(13)
            }
        }
        .multilineTextAlignment(.center)
        .foregroundStyle(.white)
        .padding(12)
        .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 14))
    }

    private var shutterBar: some View {
        HStack(alignment: .center) {
            Button { startVoice() } label: {
                VStack(spacing: 4) {
                    Image(systemName: "mic.fill").font(.system(size: 22, weight: .bold))
                    Text("音声で入力").appFont(11, weight: .bold)
                }
                .frame(width: 84, height: 64)
                .foregroundStyle(.white)
                .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 14))
            }
            .accessibilityLabel("車台番号を音声で入力")
            Spacer()
            if showsShutter {
                Button { shoot() } label: {
                    ZStack {
                        Circle().fill(.white).frame(width: 74, height: 74)
                        Circle().stroke(.white, lineWidth: 4).frame(width: 88, height: 88)
                        if phase == .reading { ProgressView().tint(.black) }
                    }
                }
                .disabled(phase == .reading)
                .accessibilityLabel("撮影して読み取る")
            } else {
                // Live reading: a match completes on its own.
                VStack(spacing: 6) {
                    ProgressView().tint(.white)
                    Text("自動で読み取り中").appFont(12, weight: .bold)
                }
                .foregroundStyle(.white)
                .frame(width: 120, height: 88)
                .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 14))
                .accessibilityElement(children: .combine)
            }
            Spacer()
            Color.clear.frame(width: 84, height: 64)
        }
        .overlay(alignment: .top) {
            if phase == .reading {
                Text("読み取っています…").appFont(13, weight: .bold).foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 6).background(.black.opacity(0.6), in: Capsule())
                    .offset(y: -40)
            }
        }
    }

    /// Read numbers that matched nothing (or none at all): judge, retake or speak.
    private var readResult: some View {
        ResultCard(tint: candidates.isEmpty ? Color.secondary : Color.appForeground,
                   icon: candidates.isEmpty ? "text.viewfinder" : "number.square",
                   title: candidates.isEmpty ? "車台番号を読み取れませんでした" : "読み取った番号") {
            if let photo, let image = Image(imageData: photo) {
                image.resizable().scaledToFit().frame(maxHeight: 180).clipShape(RoundedRectangle(cornerRadius: 12))
            }
            if candidates.isEmpty {
                // 汚れ・サビ: keep this shot and enter the number by voice.
                Text("汚れやサビで読み取れないときは、この写真を残して車台番号を音声で入力してください。")
                    .appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button { startVoice(keepingPhoto: true) } label: {
                    Label("写真を残して音声で入力", systemImage: "mic.fill").appFont(16, weight: .bold).frame(maxWidth: .infinity)
                }
                .buttonStyle(PillButtonStyle(kind: .primary))
                Text("番号がはっきり写るように、近づいたりライトをつけたりして撮り直すこともできます。")
                    .appFont(12).foregroundStyle(Color.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ForEach(candidates, id: \.self) { read in
                    Button { judge(read) } label: {
                        VStack(spacing: 2) {
                            Text(read).font(.system(size: 22, weight: .heavy, design: .monospaced))
                            Text(isRecording ? "この番号を記録" : "この番号で照合").appFont(13, weight: .bold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PillButtonStyle(kind: .primary))
                }
                Text("写真と違う番号が出ているときは、撮り直してください。").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            Button(action: rescan) {
                Label("撮り直す", systemImage: "camera.fill").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .outline))
            if !candidates.isEmpty {
                Button { startVoice(keepingPhoto: true) } label: {
                    Label("写真を残して音声で入力", systemImage: "mic.fill").appFont(15, weight: .bold).frame(maxWidth: .infinity)
                }
                .buttonStyle(PillButtonStyle(kind: .outline))
            }
            Button("閉じる", action: close).buttonStyle(PillButtonStyle(kind: .outline))
        }
    }

    // MARK: 音声で入力

    private var voiceEntry: some View {
        ResultCard(tint: Color.appForeground, icon: speech.listening ? "waveform.circle.fill" : "mic.circle.fill",
                   title: speech.listening ? "聞き取っています…" : "車台番号を読み上げてください") {
            Text("例：「ゼット・ブイ・ダブリュー・さん・ゼロ、ハイフン、いち・に・さん…」\n1文字ずつ、はっきり読み上げてください。")
                .appFont(13).foregroundStyle(Color.mutedForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let problem = speech.problem {
                Text(problem).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
            }
            if let photo, let image = Image(imageData: photo) {
                HStack(spacing: 10) {
                    image.resizable().scaledToFill().frame(width: 72, height: 54).clipShape(RoundedRectangle(cornerRadius: 8))
                    Text("読み取れなかった写真も一緒に保存します").appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
                    Spacer(minLength: 0)
                }
            }
            if !speech.transcript.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    Text("聞き取った言葉").appFont(11).foregroundStyle(Color.mutedForeground)
                    Text(speech.transcript).appFont(14).foregroundStyle(Color.appForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            FormField(label: "車台番号（違うところは直せます）") {
                TextField("例：ZVW30-1234567", text: $voiceDraft)
                    .font(.system(size: 22, weight: .heavy, design: .monospaced))
                    .asciiKeyboard()
                    .autocorrectionDisabled()
                    .padding(12)
                    .card(radius: 12, fill: .appBackground)
            }
            let number = ChassisNumber.normalize(voiceDraft)
            Button { judgeVoice(number) } label: {
                Text(isRecording ? "この番号を記録" : "この番号で照合").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
            .disabled(number.count < 4 || speech.listening)
            .opacity(number.count < 4 || speech.listening ? 0.5 : 1)
            Button {
                if speech.listening { speech.stop() } else { Task { await speech.start() } }
            } label: {
                Label(speech.listening ? "読み上げを終える" : "もう一度読み上げる", systemImage: speech.listening ? "stop.fill" : "mic.fill")
                    .appFont(15, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .outline))
            Button {
                speech.stop()
                rescan()
            } label: {
                Label("カメラに戻る", systemImage: "camera.fill").appFont(15, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .outline))
        }
        .onChange(of: speech.transcript) { _, _ in voiceDraft = speech.number }
    }

    // MARK: Actions

    #if os(iOS)
    private var cameraHandle: ChassisCamera? { camera }
    private var hasTorch: Bool { camera.hasTorch }
    private func setTorch(_ on: Bool) { camera.setTorch(on) }
    #else
    private var cameraHandle: ChassisCamera? { nil }
    private var hasTorch: Bool { false }
    private func setTorch(_ on: Bool) {}
    #endif

    private func close() {
        speech.stop()
        photo = nil
        onClose()
    }

    private func shoot() {
        #if os(iOS)
        phase = .reading
        input = .camera
        Task {
            guard let shot = await camera.capture() else {
                phase = .scanning
                return
            }
            photo = shot
            let lines = await ChassisTextReader.lines(in: shot)
            candidates = ChassisNumber.candidates(in: lines)
            // A read that matches a vehicle on the sheet goes straight to its
            // result (unless it was just confirmed here during 続けて照合).
            if !isRecording,
               case .matched(let vehicle, let chassis)? = ChassisMatch.evaluate(candidates: candidates, against: vehicles),
               confirmedHere[vehicle.id] == nil {
                phase = phaseFor(match: .matched(vehicle: vehicle, chassis: chassis))
            } else {
                // Show the best reading first; alternatives follow.
                candidates = Array(candidates.prefix(3))
                phase = .readResult
            }
        }
        #endif
    }

    /// `keepingPhoto`: the shot that couldn't be read is saved with the result.
    private func startVoice(keepingPhoto: Bool = false) {
        input = .voice
        if !keepingPhoto { photo = nil }
        voiceDraft = ""
        method = .stamp
        phase = .voice
        Task { await speech.start() }
    }

    // MARK: Live reading

    #if os(iOS)
    /// Frames are read only while the camera is showing and there is
    /// something to match (not for a 記録).
    private func updateLiveReading() {
        guard phase == .scanning, !isRecording else {
            camera.readFrames(nil)
            return
        }
        camera.readFrames { lines in
            let candidates = ChassisNumber.candidates(in: lines)
            guard !candidates.isEmpty else { return }
            Task { @MainActor in liveRead(candidates) }
        }
    }

    /// A frame's numbers: only a match with the sheet completes the read;
    /// partial or wrong readings of a moving picture are ignored.
    private func liveRead(_ read: [String]) {
        guard phase == .scanning, !isRecording,
              case .matched(let vehicle, let chassis)? = ChassisMatch.evaluate(candidates: read, against: vehicles),
              confirmedHere[vehicle.id] == nil,
              // 続けて照合: cars already done don't pop up again while panning.
              target != nil || state.checks.check(for: vehicle) == nil
        else { return }
        camera.readFrames(nil)
        input = .camera
        photo = nil
        candidates = [chassis]
        phase = phaseFor(match: .matched(vehicle: vehicle, chassis: chassis))
    }
    #endif

    private func judgeVoice(_ number: String) {
        speech.stop()
        candidates = [number]
        judge(number)
    }

    private func judge(_ read: String) {
        if isRecording, let target {
            phase = recordingPhase(for: target, read: read)
            return
        }
        if let match = ChassisMatch.evaluate(candidates: [read], against: vehicles) {
            phase = phaseFor(match: match)
        }
    }

    private func phaseFor(match: ChassisMatch) -> Phase {
        switch match {
        case .matched(let vehicle, let chassis):
            if let target, let other = match.wrongVehicle(for: target) {
                return .wrongVehicle(target: target, matched: other, read: chassis)
            }
            return .matched(vehicle)
        case .mismatch(let read):
            return .mismatch(read: read)
        }
    }

    private func recordingPhase(for vehicle: DispatchVehicle, read: String) -> Phase {
        switch ChassisRecording.evaluate(read: read, against: vehicles) {
        case .record(let number): .record(vehicle, read: number)
        case .belongsTo(let other): .belongsTo(vehicle, read: read, other: other)
        }
    }

    /// Back to the camera; the last photo is discarded.
    private func rescan() {
        candidates = []
        photo = nil
        input = .camera
        phase = .scanning
    }

    private var methodPicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("どこで確認しましたか").appFont(12).foregroundStyle(Color.mutedForeground)
            Picker("確認した場所", selection: $method) {
                ForEach(ChassisCheckMethod.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
        }
    }

    // MARK: 一致

    private func matched(_ vehicle: DispatchVehicle) -> some View {
        let existing = state.checks.check(for: vehicle)
        let alreadyDone = existing != nil || confirmedHere[vehicle.id] != nil
        return ResultCard(tint: Color.primary, icon: "checkmark.circle.fill", title: "車台番号が一致しました") {
            VehicleSummary(vehicle: vehicle)
            if alreadyDone {
                Label("この車は照合済みです（\(existing?.caption() ?? "今回照合")）", systemImage: "checkmark.seal.fill")
                    .appFont(13, weight: .bold).foregroundStyle(Color.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isContinuous {
                    continueButton(label: "続けて照合") { rescan() }
                }
                Button("閉じる", action: onClose).buttonStyle(PillButtonStyle(kind: isContinuous ? .outline : .primary))
            } else {
                methodPicker
                confirmButtons(confirmLabel: "確認済みにする") {
                    // A voice 照合 keeps the shot that couldn't be read.
                    onConfirm(vehicle, vehicle.chassisNumber, method, input, input == .voice ? photo : nil)
                    confirmedHere[vehicle.id] = method
                }
                if !isContinuous {
                    Button("撮り直す", action: rescan).buttonStyle(PillButtonStyle(kind: .outline))
                }
            }
        }
    }

    /// One "confirm and close" button, or — from the top button — "confirm
    /// and scan the next car" first, with "confirm and close" below it.
    @ViewBuilder private func confirmButtons(confirmLabel: String, confirm: @escaping () -> Void) -> some View {
        if isContinuous {
            continueButton(label: "\(confirmLabel.replacingOccurrences(of: "する", with: "して"))続けて照合") {
                confirm()
                rescan()
            }
            Button {
                confirm()
                onClose()
            } label: {
                Text("\(confirmLabel.replacingOccurrences(of: "する", with: "して"))閉じる").appFont(15, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .outline))
        } else {
            Button {
                confirm()
                onClose()
            } label: {
                Label(confirmLabel, systemImage: "checkmark").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
        }
    }

    private func continueButton(label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: "camera.viewfinder").appFont(16, weight: .bold).frame(maxWidth: .infinity)
        }
        .buttonStyle(PillButtonStyle(kind: .primary))
    }

    // MARK: 不一致（警告）

    private func mismatch(_ read: String) -> some View {
        ResultCard(tint: Color.destructive, icon: "exclamationmark.triangle.fill", title: "配車表と一致しません") {
            ReadNumber(label: "読み取った車台番号", number: read, tint: Color.destructive)
            if let target {
                VStack(alignment: .leading, spacing: 4) {
                    Text("照合する車（配車表）").appFont(12).foregroundStyle(Color.mutedForeground)
                    Text(target.vehicleName).appFont(15, weight: .bold)
                    ChassisNumberText(chassis: target.chassisNumber)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Text("この配車表のどの車の車台番号とも一致しませんでした。積む車を間違えていないか確認してください。読み取りが間違っている場合は、もう一度撮影するか、写真を残して音声で入力してください。")
                .appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: rescan) {
                Label("もう一度撮影", systemImage: "camera.fill").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .destructive))
            // 読み間違い（汚れ・サビ）: keep the shot and speak the number instead.
            if input == .camera, photo != nil {
                Button { startVoice(keepingPhoto: true) } label: {
                    Label("写真を残して音声で入力", systemImage: "mic.fill").appFont(15, weight: .bold).frame(maxWidth: .infinity)
                }
                .buttonStyle(PillButtonStyle(kind: .outline))
            }
            if target == nil && !needingReview.isEmpty {
                Text("車体番号が空欄の車（\(needingReview.map(\.vehicleName).joined(separator: "・"))）は、1台詳細で「空欄を確認しました」を押すと記録できます。")
                    .appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if target == nil && !recordable.isEmpty {
                // The car may be one the sheet left without a 車体番号.
                VStack(alignment: .leading, spacing: 6) {
                    Text("配車表で車体番号が空欄の車なら、この番号を記録できます")
                        .appFont(12, weight: .bold).foregroundStyle(Color.mutedForeground)
                    ForEach(recordable) { vehicle in
                        Button { phase = recordingPhase(for: vehicle, read: read) } label: {
                            Text("\(vehicle.round == "不明" ? "" : "\(vehicle.round)回戦 ")\(vehicle.vehicleName) に記録")
                                .appFont(14, weight: .bold).frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PillButtonStyle(kind: .secondary))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Button("閉じる", action: onClose).buttonStyle(PillButtonStyle(kind: .outline))
        }
    }

    // MARK: 別の車と一致（警告）

    private func wrongVehicle(target: DispatchVehicle, matched: DispatchVehicle, read: String) -> some View {
        ResultCard(tint: Color.destructive, icon: "exclamationmark.triangle.fill", title: "照合する車と違います") {
            ReadNumber(label: "読み取った車台番号", number: read, tint: Color.destructive)
            VStack(alignment: .leading, spacing: 4) {
                Text("照合しようとした車").appFont(12).foregroundStyle(Color.mutedForeground)
                VehicleSummary(vehicle: target)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("読み取った番号の車（配車表）").appFont(12).foregroundStyle(Color.destructive)
                VehicleSummary(vehicle: matched)
            }
            Text("読み取った番号は、配車表の「\(matched.vehicleName)」の車台番号です。照合しようとした「\(target.vehicleName)」とは別の車です。積む車を間違えていないか確認してください。")
                .appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: rescan) {
                Label("もう一度撮影", systemImage: "camera.fill").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .destructive))
            Button("閉じる", action: onClose).buttonStyle(PillButtonStyle(kind: .outline))
        }
    }

    // MARK: 記録（配車表の車体番号が空欄）

    private func record(_ vehicle: DispatchVehicle, read: String) -> some View {
        ResultCard(tint: Color.primary, icon: "square.and.pencil.circle.fill", title: "車体番号を記録します") {
            VehicleSummary(vehicle: vehicle)
            ReadNumber(label: "読み取った車体番号", number: read, tint: Color.appForeground)
            Text(input == .voice
                 ? "配車表には車体番号がないため、照合はせずに読み上げた番号を記録します。実車の番号と同じか、もう一度確認してください。"
                 : "配車表には車体番号がないため、照合はせずにこの番号を記録します。撮影した写真も一緒に残ります。実車の番号と同じか、もう一度確認してください。")
                .appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            methodPicker
            confirmButtons(confirmLabel: "この番号を記録する") {
                onConfirm(vehicle, read, method, input, photo)
                confirmedHere[vehicle.id] = method
            }
            Button("撮り直す", action: rescan).buttonStyle(PillButtonStyle(kind: .outline))
        }
    }

    /// The number read for a blank vehicle is printed on the sheet for another car.
    private func belongsTo(_ vehicle: DispatchVehicle, read: String, other: DispatchVehicle) -> some View {
        ResultCard(tint: Color.destructive, icon: "exclamationmark.triangle.fill", title: "別の車の車台番号です") {
            ReadNumber(label: "読み取った番号", number: read, tint: Color.destructive)
            Text("この番号は、配車表の「\(other.vehicleName)」の車台番号です。記録しようとしている「\(vehicle.vehicleName)」とは別の車の可能性があります。積む車を間違えていないか確認してください。")
                .appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            VehicleSummary(vehicle: other)
            // Same as the other warnings: nothing can be confirmed from here.
            Button(action: rescan) {
                Label("もう一度撮影", systemImage: "camera.fill").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .destructive))
            Button("閉じる", action: onClose).buttonStyle(PillButtonStyle(kind: .outline))
        }
    }
}

private struct ReadNumber: View {
    let label: String
    let number: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).appFont(12).foregroundStyle(Color.mutedForeground)
            Text(number).font(.system(size: 22, weight: .heavy, design: .monospaced)).foregroundStyle(tint)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ResultCard<Content: View>: View {
    let tint: Color
    let icon: String
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                Image(systemName: icon).font(.system(size: 52, weight: .bold)).foregroundStyle(tint)
                Text(title).appFont(22, weight: .black).foregroundStyle(tint)
                content
            }
            .padding(20)
            .background(Color.card, in: RoundedRectangle(cornerRadius: 24))
            .overlay(RoundedRectangle(cornerRadius: 24).stroke(tint, lineWidth: 3))
            .padding(16)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(Color.appBackground.ignoresSafeArea())
    }
}

private struct VehicleSummary: View {
    let vehicle: DispatchVehicle

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(vehicle.vehicleName).appFont(20, weight: .black)
                Spacer()
                Chip(text: vehicle.round == "不明" ? "回戦不明" : "\(vehicle.round)回戦", style: .gray)
            }
            ChassisNumberText(chassis: vehicle.chassisNumber)
            Text("\(vehicle.pickup) → \(vehicle.dropoff)").appFont(13, weight: .semibold).foregroundStyle(Color.mutedForeground)
        }
        .foregroundStyle(Color.appForeground)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 14))
    }
}

// MARK: - Camera

/// The preview (or the frozen shot while it's being read), with the
/// permission states.
private struct CameraArea: View {
    let camera: ChassisCamera?
    let frozen: Data?

    #if os(iOS)
    @State private var access: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    #endif

    var body: some View {
        #if os(iOS)
        Group {
            if let frozen, let image = Image(imageData: frozen) {
                image.resizable().scaledToFill()
            } else if access == .authorized, let camera {
                ChassisCameraPreview(camera: camera)
            } else if access == .notDetermined {
                Color.black
            } else {
                CameraUnavailable(text: "カメラの使用が許可されていません。設定アプリの「KYOEI」でカメラを許可してください。")
            }
        }
        .task {
            if access == .notDetermined {
                _ = await AVCaptureDevice.requestAccess(for: .video)
                access = AVCaptureDevice.authorizationStatus(for: .video)
                if access == .authorized { camera?.start() }
            }
        }
        #else
        CameraUnavailable(text: "カメラ照合は iPhone でのみ使えます。")
        #endif
    }
}

#if !os(iOS)
final class ChassisCamera {}
#endif

private struct CameraUnavailable: View {
    let text: String

    var body: some View {
        VStack {
            Spacer()
            Text(text).appFont(15, weight: .bold).foregroundStyle(.white).multilineTextAlignment(.center).padding(24)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black)
    }
}
