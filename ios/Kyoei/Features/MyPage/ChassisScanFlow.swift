import KyoeiCore
import SwiftUI
#if os(iOS)
import AVFoundation
import VisionKit
#endif

/// 車台番号をカメラで照合: live text recognition on the caution plate or
/// stamping → exact match against the sheet → 確認 (match) or 警告 (mismatch).
///
/// A number that matches a vehicle is taken automatically once it has been
/// read twice in a row; a number that matches nothing is only judged when the
/// driver taps 「この番号で照合」, so a half-read plate never flashes a warning.
///
/// When the sheet leaves a vehicle's 車体番号 blank there is nothing to match,
/// so the number read off the real car is recorded for it instead (記録).
struct ChassisScanFlow: View {
    let vehicles: [DispatchVehicle]
    let target: DispatchVehicle?
    let state: SheetChassisState
    /// (vehicle, number read, where it was read). For a 照合 the read number
    /// equals the sheet's; for a 記録 it is the number to store.
    let onConfirm: (DispatchVehicle, String, ChassisCheckMethod) -> Void
    let onClose: () -> Void

    private enum Phase: Equatable {
        case scanning
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
    @State private var previousMatch: String?
    @State private var method: ChassisCheckMethod = .cautionPlate

    private var isRecording: Bool { target?.needsRecording == true }

    /// Blank-numbered vehicles confirmed as blank (原本・伝票) and not yet recorded.
    private var recordable: [DispatchVehicle] {
        vehicles.filter {
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
            case .scanning:
                scanning
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
            case .scanning: nil
            }
        }
    }

    // MARK: Scanning

    private var scanning: some View {
        ZStack {
            ChassisCameraView { lines in update(with: lines) }
                .ignoresSafeArea()
            VStack(spacing: 12) {
                HStack {
                    Button(action: onClose) {
                        Image(systemName: "xmark").font(.system(size: 17, weight: .bold))
                            .frame(width: 44, height: 44).background(.black.opacity(0.5), in: Circle())
                    }
                    .accessibilityLabel("閉じる")
                    Spacer()
                    TorchButton()
                }
                .foregroundStyle(.white)
                VStack(spacing: 4) {
                    Text(isRecording ? "記録する車の車体番号を写してください" : "コーションプレート、または刻印の車台番号を写してください")
                        .appFont(15, weight: .bold)
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
                Spacer()
                readPanel
            }
            .padding(16)
        }
    }

    private var readPanel: some View {
        VStack(spacing: 10) {
            if let read = candidates.first {
                Text("読み取った番号").appFont(12).foregroundStyle(Color.mutedForeground)
                Text(read).font(.system(size: 24, weight: .heavy, design: .monospaced)).foregroundStyle(Color.appForeground)
                Button { judge() } label: {
                    Text(isRecording ? "この番号を記録" : "この番号で照合").appFont(16, weight: .bold).frame(maxWidth: .infinity)
                }
                .buttonStyle(PillButtonStyle(kind: .primary))
            } else {
                ProgressView()
                Text("車体番号を探しています…").appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
            }
        }
        .padding(16)
        .frame(maxWidth: 448)
        .frame(maxWidth: .infinity)
        .background(Color.card, in: RoundedRectangle(cornerRadius: 20))
    }

    private func update(with lines: [String]) {
        guard phase == .scanning else { return }
        candidates = ChassisNumber.candidates(in: lines)
        // Recording is always confirmed by the driver: there is nothing on
        // the sheet to tell a complete read from a partial one.
        guard !isRecording,
              case .matched(let vehicle, let chassis)? = ChassisMatch.evaluate(candidates: candidates, against: vehicles) else {
            previousMatch = nil
            return
        }
        if previousMatch == chassis {
            // A full, stable read of another vehicle's number is a definite
            // result, so its warning is shown without waiting for a tap.
            phase = phaseFor(match: .matched(vehicle: vehicle, chassis: chassis))
        } else {
            previousMatch = chassis
        }
    }

    private func judge() {
        if isRecording, let target, let read = candidates.first {
            phase = recordingPhase(for: target, read: read)
            return
        }
        if let match = ChassisMatch.evaluate(candidates: candidates, against: vehicles) {
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

    private func rescan() {
        candidates = []
        previousMatch = nil
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
        return ResultCard(tint: Color.primary, icon: "checkmark.circle.fill", title: "車台番号が一致しました") {
            VehicleSummary(vehicle: vehicle)
            if let existing {
                Label("この車は照合済みです（\(existing.caption())）", systemImage: "checkmark.seal.fill")
                    .appFont(13, weight: .bold).foregroundStyle(Color.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button("閉じる", action: onClose).buttonStyle(PillButtonStyle(kind: .primary))
            } else {
                methodPicker
                Button {
                    onConfirm(vehicle, vehicle.chassisNumber, method)
                    onClose()
                } label: {
                    Label("確認済みにする", systemImage: "checkmark").appFont(16, weight: .bold).frame(maxWidth: .infinity)
                }
                .buttonStyle(PillButtonStyle(kind: .primary))
            }
            Button("別の車を照合する", action: rescan).buttonStyle(PillButtonStyle(kind: .outline))
        }
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
            Text("この配車表のどの車の車台番号とも一致しませんでした。積む車を間違えていないか確認してください。読み取りが間違っている場合は、もう一度撮影してください。")
                .appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: rescan) {
                Label("もう一度撮影", systemImage: "camera.fill").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .destructive))
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
            Text("配車表には車体番号がないため、照合はせずにこの番号を記録します。実車の番号と同じか、もう一度確認してください。")
                .appFont(13, weight: .semibold).foregroundStyle(Color.appForeground)
                .frame(maxWidth: .infinity, alignment: .leading)
            methodPicker
            Button {
                onConfirm(vehicle, read, method)
                onClose()
            } label: {
                Label("この番号を記録する", systemImage: "checkmark").appFont(16, weight: .bold).frame(maxWidth: .infinity)
            }
            .buttonStyle(PillButtonStyle(kind: .primary))
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

#if os(iOS)
/// VisionKit live text scanner; reports every recognized line on each update.
private struct ChassisCameraView: View {
    let onLines: ([String]) -> Void

    @State private var access: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)

    var body: some View {
        Group {
            if !DataScannerViewController.isSupported {
                CameraUnavailable(text: "この端末では文字の読み取りに対応していません。")
            } else if access == .authorized {
                LiveTextScanner(onLines: onLines)
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
            }
        }
    }
}

private struct LiveTextScanner: UIViewControllerRepresentable {
    let onLines: ([String]) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.text(languages: ["en-US"])],
            qualityLevel: .accurate,
            recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: false,
            isHighlightingEnabled: true
        )
        context.coordinator.start(scanner)
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        context.coordinator.onLines = onLines
    }

    static func dismantleUIViewController(_ scanner: DataScannerViewController, coordinator: Coordinator) {
        coordinator.stop(scanner)
    }

    func makeCoordinator() -> Coordinator { Coordinator(onLines: onLines) }

    @MainActor final class Coordinator {
        var onLines: ([String]) -> Void
        private var task: Task<Void, Never>?

        init(onLines: @escaping ([String]) -> Void) {
            self.onLines = onLines
        }

        func start(_ scanner: DataScannerViewController) {
            try? scanner.startScanning()
            task = Task { [weak self] in
                for await items in scanner.recognizedItems {
                    let lines = items.compactMap { item -> String? in
                        if case .text(let text) = item { return text.transcript }
                        return nil
                    }
                    self?.onLines(lines)
                }
            }
        }

        func stop(_ scanner: DataScannerViewController) {
            task?.cancel()
            scanner.stopScanning()
        }
    }
}

/// ライト: dim engine bays and trailer decks make plates hard to read.
private struct TorchButton: View {
    @State private var isOn = false

    var body: some View {
        if let device = AVCaptureDevice.default(for: .video), device.hasTorch {
            Button {
                do {
                    try device.lockForConfiguration()
                    device.torchMode = isOn ? .off : .on
                    device.unlockForConfiguration()
                    isOn.toggle()
                } catch {}
            } label: {
                Image(systemName: isOn ? "flashlight.on.fill" : "flashlight.off.fill")
                    .font(.system(size: 17, weight: .bold))
                    .frame(width: 44, height: 44).background(.black.opacity(0.5), in: Circle())
            }
            .accessibilityLabel(isOn ? "ライトを消す" : "ライトをつける")
        }
    }
}
#else
private struct ChassisCameraView: View {
    let onLines: ([String]) -> Void
    var body: some View { CameraUnavailable(text: "カメラ照合は iPhone でのみ使えます。") }
}

private struct TorchButton: View {
    var body: some View { EmptyView() }
}
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
