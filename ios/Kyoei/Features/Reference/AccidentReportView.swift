import KyoeiCore
import Observation
import PhotosUI
import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// Device-only storage for 事故報告. It can hold another party's name,
/// address, license photos and insurance details, so — unlike every shared
/// table — it never leaves the device: JSON + JPEGs in Application Support,
/// with complete file protection (unreadable while the phone is locked) and
/// excluded from iCloud backup.
@MainActor
@Observable
final class AccidentReportStore {
    private(set) var report = AccidentReport()
    private(set) var isSaved = false

    @ObservationIgnored private let folder: URL

    init(folder: URL? = nil) {
        let base = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("AccidentReport", isDirectory: true)
        self.folder = base
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableBase = base
        try? mutableBase.setResourceValues(values)
        if let data = try? Data(contentsOf: reportURL), let stored = try? JSONDecoder().decode(AccidentReport.self, from: data) {
            report = stored
            isSaved = true
        }
    }

    private var reportURL: URL { folder.appendingPathComponent("report.json") }

    func photoURL(_ name: String) -> URL { folder.appendingPathComponent(name) }

    /// Stores a downscaled JPEG and returns its file name.
    func storePhoto(_ data: Data) throws -> String {
        guard let jpeg = ImageEncoding.jpeg(from: data, maxDimension: 1600) else { throw CocoaError(.fileReadCorruptFile) }
        let name = "\(UUID().uuidString).jpg"
        try write(jpeg, to: photoURL(name))
        return name
    }

    func save(_ report: AccidentReport) throws {
        try write(JSONEncoder().encode(report), to: reportURL)
        self.report = report
        isSaved = true
        removeUnreferencedPhotos(keeping: report.photoFiles)
    }

    func reset() {
        try? FileManager.default.removeItem(at: folder)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        report = AccidentReport()
        isSaved = false
    }

    private func write(_ data: Data, to url: URL) throws {
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }

    private func removeUnreferencedPhotos(keeping names: Set<String>) {
        let files = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
        for file in files where file.hasSuffix(".jpg") && !names.contains(file) {
            try? FileManager.default.removeItem(at: photoURL(file))
        }
    }
}

/// 事故報告: what to collect from the other party, saved on this device only,
/// with 報告完了 and 画像として保存 (share sheet). Port of
/// components/accident-report-view.tsx.
struct AccidentReportView: View {
    let onBack: () -> Void

    @Environment(SharedData.self) private var data
    @State private var store = AccidentReportStore()
    @State private var draft = AccidentReport()
    @State private var editing = true
    @State private var pending: Pending?
    @State private var error: String?
    @State private var exportFiles: [URL] = []
    @State private var exporting = false
    @State private var zoomed: URL?

    private enum Pending { case reset, complete }

    private var readOnly: Bool { store.isSaved && !editing }

    var body: some View {
        TabPage {
            BackHeader(label: "緊急連絡先", onBack: onBack)
            VStack(alignment: .leading, spacing: 4) {
                Text("事故を起こしてしまった/事故にあってしまったら").appFont(18, weight: .bold).foregroundStyle(Color.appForeground)
                Text("この記録はこの端末のみに保存されます（他の端末とは共有されません）。").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            SharedNoteBox(table: "accident_report_memo", editable: true)
            if let completedAt = draft.completedAt {
                Label("報告完了済み（\(Self.completedFormatter.string(from: completedAt))）", systemImage: "checkmark.circle.fill")
                    .appFont(14, weight: .bold).foregroundStyle(Color.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12).background(Color.primary.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
            }
            ForEach($draft.parties) { $party in
                PartyForm(party: $party, index: draft.parties.firstIndex { $0.id == party.id } ?? 0,
                          showsNumber: draft.parties.count > 1, readOnly: readOnly, store: store,
                          onRemove: draft.parties.count > 1 && !readOnly ? { draft.removeParty(id: party.id) } : nil,
                          onZoom: { zoomed = $0 }, onError: { error = $0 })
            }
            if let error {
                Text(error).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
            }
            actions
        }
        .overlay { dialog }
        .overlay { zoomOverlay }
        .sheet(isPresented: $exporting) {
            ShareSheet(items: exportFiles)
        }
        .onAppear {
            draft = store.report
            editing = !store.isSaved
        }
    }

    @ViewBuilder private var actions: some View {
        VStack(spacing: 10) {
            if !readOnly {
                Button { draft.addParty() } label: { Label("もう1人追加", systemImage: "person.badge.plus") }
                    .buttonStyle(PillButtonStyle(kind: .outline))
            }
            HStack(spacing: 8) {
                if readOnly {
                    Button("編集") { editing = true }.buttonStyle(PillButtonStyle(kind: .outline))
                    if !draft.isCompleted {
                        Button("報告完了") { pending = .complete }.buttonStyle(PillButtonStyle())
                    }
                } else {
                    Button("保存", action: save).buttonStyle(PillButtonStyle())
                }
            }
            Button { exportImages() } label: { Label("画像として保存", systemImage: "square.and.arrow.down") }
                .buttonStyle(PillButtonStyle(kind: .secondary))
            if store.isSaved {
                Button("リセット") { pending = .reset }
                    .appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
            }
        }
    }

    @ViewBuilder private var dialog: some View {
        let messages = data.confirmMessages
        switch pending {
        case nil:
            EmptyView()
        case .reset:
            ConfirmActionDialog(
                message: messages.message("accident-report-reset", fallback: "入力内容をリセットしますか？\nこの操作は取り消せません。"),
                confirmLabel: messages.confirmLabel("accident-report-reset"),
                cancelLabel: messages.cancelLabel("accident-report-reset"),
                onConfirm: {
                    pending = nil
                    store.reset()
                    draft = store.report
                    editing = true
                },
                onCancel: { pending = nil }
            )
        case .complete:
            ConfirmActionDialog(
                message: messages.message("accident-report-complete", fallback: "報告完了にしますか？"),
                confirmLabel: messages.confirmLabel("accident-report-complete", fallback: "報告完了にする"),
                cancelLabel: messages.cancelLabel("accident-report-complete"),
                onConfirm: {
                    pending = nil
                    var completed = draft
                    completed.completedAt = Date()
                    persist(completed)
                },
                onCancel: { pending = nil }
            )
        }
    }

    @ViewBuilder private var zoomOverlay: some View {
        if let zoomed {
            ZStack {
                Color.black.opacity(0.85).ignoresSafeArea()
                LocalImage(url: zoomed).padding(16)
            }
            .onTapGesture { self.zoomed = nil }
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel("閉じる")
        }
    }

    private func save() {
        persist(draft)
    }

    private func persist(_ report: AccidentReport) {
        do {
            try store.save(report)
            draft = report
            editing = false
            error = nil
        } catch {
            self.error = "保存に失敗しました。もう一度お試しください。"
        }
    }

    /// Renders each party's info card and gathers license photos into
    /// temporary files for the share sheet (保存 to Photos, AirDrop, etc).
    private func exportImages() {
        error = nil
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("AccidentReportExport", isDirectory: true)
        try? FileManager.default.removeItem(at: tmp)
        try? FileManager.default.createDirectory(at: tmp, withIntermediateDirectories: true)
        var files: [URL] = []
        for item in draft.exportNames() {
            let party = draft.parties[item.partyIndex]
            let target = tmp.appendingPathComponent(item.fileName)
            switch item.kind {
            case .info:
                guard let jpeg = PartyCard.renderJPEG(party: party, index: item.partyIndex) else { continue }
                try? jpeg.write(to: target)
            case .licenseFront, .licenseBack:
                guard let name = item.kind == .licenseFront ? party.licensePhotoFront : party.licensePhotoBack else { continue }
                try? FileManager.default.copyItem(at: store.photoURL(name), to: target)
            }
            if FileManager.default.fileExists(atPath: target.path) { files.append(target) }
        }
        guard !files.isEmpty else {
            error = "保存する内容がありません。"
            return
        }
        exportFiles = files
        exporting = true
    }

    private static let completedFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy/MM/dd HH:mm"
        return formatter
    }()
}

private struct PartyForm: View {
    @Binding var party: AccidentParty
    let index: Int
    let showsNumber: Bool
    let readOnly: Bool
    let store: AccidentReportStore
    let onRemove: (() -> Void)?
    let onZoom: (URL) -> Void
    let onError: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("相手\(showsNumber ? "\(index + 1)" : "")").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                Spacer()
                if let onRemove {
                    Button("削除", action: onRemove).appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                }
            }
            field("氏名", $party.name)
            field("住所", $party.address)
            FormField(label: "免許証") {
                (Text("撮影の許可を貰い、免許証を撮影でも可。免許証は") + Text("「表面」と「裏面」の2枚").bold() + Text("を撮影すること"))
                    .appFont(12).foregroundStyle(Color.mutedForeground)
                HStack(spacing: 8) {
                    PhotoSlot(title: "表面", name: $party.licensePhotoFront, readOnly: readOnly, store: store, onZoom: onZoom, onError: onError)
                    PhotoSlot(title: "裏面", name: $party.licensePhotoBack, readOnly: readOnly, store: store, onZoom: onZoom, onError: onError)
                }
            }
            field("電話番号", $party.phone, note: "※メモした後にその場で一度電話をかけ、相手のスマホが鳴るか確認する")
            field("保険会社名", $party.insuranceCompany)
            field("証券番号または契約番号", $party.policyNumber, note: "すぐに分からなければ省略可")
            field("車種", $party.vehicleType)
            field("車のナンバー", $party.plateNumber)
            FormField(label: "社用車か否か") {
                Picker("社用車か否か", selection: $party.ownership) {
                    ForEach(CarOwnership.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.menu)
                .disabled(readOnly)
                Text("※社用車なら名刺をもらう").appFont(12).foregroundStyle(Color.mutedForeground)
            }
        }
        .padding(20)
        .card(radius: Radius.card)
    }

    private func field(_ label: String, _ text: Binding<String>, note: String? = nil) -> some View {
        FormField(label: label) {
            if readOnly {
                Text(text.wrappedValue.isEmpty ? "—" : text.wrappedValue).appFont(14).foregroundStyle(Color.appForeground)
            } else {
                BoxedTextField(placeholder: "", text: text)
            }
            if let note {
                Text(note).appFont(12).foregroundStyle(Color.mutedForeground)
            }
        }
    }
}

/// One license photo: shows the stored image (tap to zoom) or capture buttons.
private struct PhotoSlot: View {
    let title: String
    @Binding var name: String?
    let readOnly: Bool
    let store: AccidentReportStore
    let onZoom: (URL) -> Void
    let onError: (String) -> Void

    @State private var pickerItem: PhotosPickerItem?
    @State private var showsCamera = false

    var body: some View {
        VStack(spacing: 6) {
            Text(title).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
            if let name {
                LocalImage(url: store.photoURL(name))
                    .frame(height: 110)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .onTapGesture { onZoom(store.photoURL(name)) }
                    .accessibilityLabel("免許証の\(title)の撮影画像")
                if !readOnly {
                    Button("撮り直す") { self.name = nil }.appFont(12)
                }
            } else if !readOnly {
                #if os(iOS)
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button { showsCamera = true } label: { Label("\(title)を撮影する", systemImage: "camera") }
                        .buttonStyle(PillButtonStyle(kind: .outline))
                }
                #endif
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    PhotoLibraryLabel()
                }
            } else {
                Text("未撮影").appFont(12).foregroundStyle(Color.mutedForeground).frame(height: 110)
            }
        }
        .frame(maxWidth: .infinity)
        .onChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                defer { pickerItem = nil }
                if let data = try? await item.loadTransferable(type: Data.self) { store(data) }
            }
        }
        #if os(iOS)
        .fullScreenCover(isPresented: $showsCamera) {
            CameraCapture { data in store(data) }.ignoresSafeArea()
        }
        #endif
    }

    private func store(_ data: Data) {
        do {
            name = try store.storePhoto(data)
        } catch {
            onError("写真の読み込みに失敗しました。もう一度撮影してください。")
        }
    }
}

/// PhotosPicker's label closure isn't main-actor isolated, so the styled
/// label lives in its own view.
private struct PhotoLibraryLabel: View {
    var body: some View {
        Label("写真から選ぶ", systemImage: "photo").appFont(12)
    }
}

/// Displays a JPEG from local storage.
struct LocalImage: View {
    let url: URL

    var body: some View {
        #if canImport(UIKit)
        if let image = UIImage(contentsOfFile: url.path) {
            Image(uiImage: image).resizable().scaledToFit()
        }
        #else
        if let image = NSImage(contentsOf: url) {
            Image(nsImage: image).resizable().scaledToFit()
        }
        #endif
    }
}

/// The shareable 事故相手情報 card (rendered to JPEG for 画像として保存).
private struct PartyCard: View {
    let party: AccidentParty
    let index: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("事故相手情報（相手\(index + 1)）").font(.system(size: 32, weight: .bold))
            Divider()
            ForEach(Array(party.cardRows.enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 6) {
                    Text(row.label).font(.system(size: 22, weight: .bold)).foregroundStyle(Color(white: 0.4))
                    Text(row.value).font(.system(size: 26))
                }
            }
            Text("作成日時: \(Date().formatted(.dateTime.locale(Locale(identifier: "ja_JP"))))")
                .font(.system(size: 16)).foregroundStyle(Color(white: 0.6))
        }
        .foregroundStyle(Color(white: 0.07))
        .padding(48)
        .frame(width: 960, alignment: .leading)
        .background(Color.white)
        .environment(\.colorScheme, .light)
    }

    @MainActor
    static func renderJPEG(party: AccidentParty, index: Int) -> Data? {
        let renderer = ImageRenderer(content: PartyCard(party: party, index: index))
        renderer.scale = 1
        #if canImport(UIKit)
        return renderer.uiImage?.jpegData(compressionQuality: 0.92)
        #else
        guard let cgImage = renderer.cgImage else { return nil }
        return NSBitmapImageRep(cgImage: cgImage).representation(using: .jpeg, properties: [.compressionFactor: 0.92])
        #endif
    }
}

#if canImport(UIKit)
/// Camera capture (the web form's capture="environment").
private struct CameraCapture: UIViewControllerRepresentable {
    let onCapture: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraCapture

        init(_ parent: CameraCapture) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                parent.onCapture(data)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

/// System share sheet for files.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [URL]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#else
struct ShareSheet: View {
    let items: [URL]
    var body: some View { Text("\(items.count) files") }
}
#endif
