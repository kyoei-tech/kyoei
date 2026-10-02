import KyoeiCore
import SwiftUI

// 赤枠 at 出庫・帰庫: after 出庫 the driver is asked whether to take a 赤枠
// (pick one, then the same screen as 赤枠管理 for 使用予定地); at 帰庫, each
// plate still out is either returned or kept for the next trip.

/// 出庫: 「赤枠を持ち出しますか？」 → choose a free plate → 持ち出す.
struct RedPlateTakePrompt: View {
    /// The chosen plate, to open its 持ち出し screen.
    let onTake: (RedPlateBoardRow) -> Void
    let onSkip: () -> Void

    @State private var asking = true
    @State private var board: [RedPlateBoardRow] = []
    @State private var loading = true
    @State private var failed = false
    @State private var selectedID: String?

    private var available: [RedPlateBoardRow] { board.filter { !$0.isOut } }

    var body: some View {
        if asking {
            ConfirmActionDialog(
                message: "赤枠を持ち出しますか？",
                confirmLabel: "持ち出す",
                cancelLabel: "持ち出さない",
                onConfirm: { asking = false },
                onCancel: onSkip
            )
        } else {
            ModalCard {
                ModalIcon(systemName: "rectangle.dashed")
                Text("持ち出す赤枠を選んでください").appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                    .multilineTextAlignment(.center)
                Group {
                    if loading {
                        ProgressView()
                    } else if failed {
                        Text("赤枠を読み込めませんでした。通信状況を確認してください。")
                            .appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                    } else if available.isEmpty {
                        Text("いま空いている赤枠はありません。").appFont(13).foregroundStyle(Color.mutedForeground)
                    } else {
                        Picker("赤枠", selection: $selectedID) {
                            Text("選んでください").tag(String?.none)
                            ForEach(available) { Text($0.label).tag(String?.some($0.plate_id)) }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.border))
                        if let plate = available.first(where: { $0.plate_id == selectedID }) {
                            PlateFace(region: plate.region, number: plate.number).frame(width: 140)
                        }
                    }
                }
                .padding(.top, 14)
                HStack(spacing: 8) {
                    Button("やめる", action: onSkip).buttonStyle(PillButtonStyle(kind: .outline))
                    let plate = available.first { $0.plate_id == selectedID }
                    Button("持ち出す") { if let plate { onTake(plate) } }
                        .buttonStyle(PillButtonStyle(kind: .destructive))
                        .disabled(plate == nil)
                        .opacity(plate == nil ? 0.5 : 1)
                }
                .padding(.top, 20)
            }
            .task { await load() }
        }
    }

    private func load() async {
        loading = true
        do {
            board = try await RedPlateRepository.board()
            failed = false
        } catch {
            failed = true
        }
        loading = false
    }
}

/// 帰庫 with plates still out: return each one, or keep using it.
struct RedPlateReturnPrompt: View {
    let plates: [RedPlateBoardRow]
    let onDone: () -> Void

    @State private var handled: Set<String> = []
    @State private var busy: String?
    @State private var error: String?

    private var remaining: [RedPlateBoardRow] { plates.filter { !handled.contains($0.plate_id) } }

    var body: some View {
        ModalCard(maxWidth: 360) {
            ModalIcon(systemName: "exclamationmark.triangle.fill")
            Text("赤枠を持ち出し中です").appFont(17, weight: .black).foregroundStyle(Color.redPlate)
            Text("事務所に返却するか、次の運行でも続けて使うかを選んでください。")
                .appFont(13).foregroundStyle(Color.appForeground)
                .multilineTextAlignment(.center)
                .padding(.top, 6)
            if let error {
                Text(error).appFont(12, weight: .semibold).foregroundStyle(Color.destructive).padding(.top, 8)
            }
            VStack(spacing: 14) {
                ForEach(remaining) { plate in
                    VStack(spacing: 8) {
                        PlateFace(region: plate.region, number: plate.number).frame(width: 150)
                        if let destination = plate.destination, !destination.isEmpty {
                            Text("使用予定地：\(destination)").appFont(12).foregroundStyle(Color.mutedForeground)
                        }
                        HStack(spacing: 8) {
                            Button("継続して使う") { handled.insert(plate.plate_id) }
                                .buttonStyle(PillButtonStyle(kind: .outline))
                            Button(busy == plate.plate_id ? "処理中…" : "返却する") { giveBack(plate) }
                                .buttonStyle(PillButtonStyle(kind: .primary))
                        }
                        .disabled(busy != nil)
                    }
                }
            }
            .padding(.top, 16)
        }
        .onChange(of: handled) { _, _ in if remaining.isEmpty { onDone() } }
    }

    private func giveBack(_ plate: RedPlateBoardRow) {
        guard let useID = plate.use_id else { return }
        busy = plate.plate_id
        error = nil
        Task {
            do {
                try await RedPlateRepository.giveBack(useID: useID)
                handled.insert(plate.plate_id)
            } catch {
                self.error = "返却できませんでした。通信状況を確認してください。"
            }
            busy = nil
        }
    }
}

/// 「赤枠持ち出し中」 on 運行情報.
struct RedPlateOutBadge: View {
    let plates: [RedPlateBoardRow]

    var body: some View {
        Label(plates.count == 1 ? "赤枠持ち出し中 \(plates[0].number)" : "赤枠持ち出し中 \(plates.count)枚", systemImage: "rectangle.dashed")
            .appFont(12, weight: .black)
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(Color.redPlate, in: Capsule())
            .fixedSize()
            .accessibilityLabel("赤枠持ち出し中：\(plates.map(\.label).joined(separator: "、"))")
    }
}
