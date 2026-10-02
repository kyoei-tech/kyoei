import KyoeiCore
import Supabase
import SwiftUI

enum RedPlateRepository {
    static func board() async throws -> [RedPlateBoardRow] {
        try await Backend.client.rpc("red_plate_board").execute().value
    }

    static func history(plateID: String) async throws -> [RedPlateUse] {
        try await Backend.client.rpc("red_plate_history", params: ["p_plate": plateID]).execute().value
    }

    static func take(plateID: String, destination: String) async throws {
        try await Backend.client.rpc("take_red_plate", params: ["p_plate": plateID, "p_destination": destination]).execute()
    }

    static func giveBack(useID: String) async throws {
        try await Backend.client.rpc("return_red_plate", params: ["p_use": useID, "p_method": "app"]).execute()
    }
}

extension Color {
    /// The red frame of a 回送運行許可番号標.
    static let redPlate = Color(light: 0xD7262E, dark: 0xEF4444)
}

/// マイページ > 赤枠管理: every 赤枠 as a card (空き / 持ち出し中・誰・どこへ),
/// the user's own plates on top with 返却. Tap a card to take it out or see
/// its record (持ち出し日時・使用者・使用予定地・返却日時).
struct RedPlatesView: View {
    @Environment(AuthStore.self) private var auth
    @State private var board = RealtimeTable<RedPlateBoardRow>(table: "red_plate_uses") { try await RedPlateRepository.board() }
    @State private var selected: RedPlateBoardRow?

    var body: some View {
        let rows = board.rows
        let mine = RedPlateBoard.mine(rows, userID: auth.userID)
        let counts = RedPlateBoard.counts(rows)
        EverySecond { now in
            TabPage {
                PageHeading(title: "赤枠管理", subtitle: "回送運行許可番号標（赤枠）の持ち出しと返却の記録です。")
                if !rows.isEmpty {
                    HStack(spacing: 10) {
                        countTile("空き", counts.available, .primary)
                        countTile("持ち出し中", counts.out, .redPlate)
                    }
                }
                if !mine.isEmpty {
                    Text("あなたが持ち出し中").appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
                    ForEach(mine) { row in
                        Button { selected = row } label: { MyPlateCard(row: row, now: now) }.buttonStyle(.plain)
                    }
                }
                if board.isLoading && rows.isEmpty {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                } else if board.error != nil && rows.isEmpty {
                    EmptyStateBox(text: "読み込めませんでした。通信状況を確認してください。")
                } else {
                    Text("すべての赤枠").appFont(15, weight: .bold).foregroundStyle(Color.appForeground).padding(.top, 4)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                        ForEach(rows) { row in
                            Button { selected = row } label: { PlateCard(row: row, mine: row.isHeld(by: auth.userID), now: now) }
                                .buttonStyle(PressScaleStyle())
                        }
                    }
                }
            }
        }
        .syncing(board)
        .sheet(item: $selected) { row in
            RedPlateDetailView(row: row) {
                selected = nil
                Task { await board.refresh() }
            }
        }
    }

    private func countTile(_ title: String, _ value: Int, _ color: Color) -> some View {
        VStack(spacing: 2) {
            Text(title).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
            Text("\(value)枚").appFont(22, weight: .black).monospacedDigit().foregroundStyle(color)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .card()
    }
}

/// The plate itself: white face, red frame, 「相模」 over the number.
struct PlateFace: View {
    let region: String
    let number: String
    var large = false

    var body: some View {
        VStack(spacing: large ? 2 : 0) {
            Text(region).font(.system(size: large ? 18 : 12, weight: .bold))
            Text(number).font(.system(size: large ? 44 : 28, weight: .heavy, design: .rounded)).monospacedDigit()
        }
        .foregroundStyle(Color.black)
        .frame(maxWidth: .infinity)
        .padding(.vertical, large ? 14 : 8)
        .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).inset(by: 2).stroke(Color.redPlate, lineWidth: large ? 5 : 3.5))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("赤枠 \(region) \(number)")
    }
}

private struct PlateCard: View {
    let row: RedPlateBoardRow
    let mine: Bool
    let now: Date

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            PlateFace(region: row.region, number: row.number)
            if row.isOut {
                Text(mine ? "あなたが持ち出し中" : "持ち出し中").appFont(11, weight: .black).foregroundStyle(Color.redPlate)
                Text(row.holder_name ?? "").appFont(14, weight: .bold).foregroundStyle(Color.appForeground).lineLimit(1)
                Text(row.destination ?? "").appFont(12).foregroundStyle(Color.mutedForeground).lineLimit(1)
                if let taken = row.takenAt {
                    Text(RedPlateBoard.elapsed(since: taken, now: now)).appFont(11, weight: .semibold).monospacedDigit().foregroundStyle(Color.mutedForeground)
                }
            } else {
                Label("空き", systemImage: "checkmark.circle.fill").appFont(13, weight: .bold).foregroundStyle(Color.primary)
                Text(" ").appFont(14)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card(border: row.isOut ? Color.redPlate.opacity(mine ? 0.9 : 0.4) : .border)
    }
}

private struct MyPlateCard: View {
    let row: RedPlateBoardRow
    let now: Date

    var body: some View {
        HStack(spacing: 12) {
            PlateFace(region: row.region, number: row.number).frame(width: 110)
            VStack(alignment: .leading, spacing: 3) {
                Text(row.destination ?? "").appFont(15, weight: .bold).foregroundStyle(Color.appForeground).lineLimit(2)
                if let taken = row.takenAt {
                    Text("\(taken.formatted(.dateTime.month().day().hour().minute())) から").appFont(12).foregroundStyle(Color.mutedForeground)
                    Text("持ち出し \(RedPlateBoard.elapsed(since: taken, now: now))").appFont(12, weight: .semibold).monospacedDigit().foregroundStyle(Color.redPlate)
                }
                Text("タップして返却").appFont(12, weight: .bold).foregroundStyle(Color.primary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .card(border: Color.redPlate.opacity(0.9))
    }
}

/// One plate: take it out (使用予定地 required), return it (own), and its record.
private struct RedPlateDetailView: View {
    let row: RedPlateBoardRow
    let onDone: () -> Void

    @Environment(AuthStore.self) private var auth
    @Environment(InspectionStore.self) private var inspections
    @State private var destination = ""
    @State private var history: [RedPlateUse] = []
    @State private var busy = false
    @State private var error: String?
    @State private var confirmsReturn = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Spacer()
                    Button("閉じる", action: onDone).appFont(15, weight: .semibold).foregroundStyle(Color.primary)
                }
                PlateFace(region: row.region, number: row.number, large: true)
                if !row.note.isEmpty {
                    Text(row.note).appFont(13).foregroundStyle(Color.mutedForeground)
                }
                if let error {
                    Text(error).appFont(13, weight: .semibold).foregroundStyle(Color.destructive)
                }
                if row.isOut {
                    current
                } else {
                    takeForm
                }
                historySection
            }
            .padding(20)
        }
        .background(Color.appBackground.ignoresSafeArea())
        .task { history = (try? await RedPlateRepository.history(plateID: row.plate_id)) ?? [] }
        .overlay {
            if confirmsReturn {
                ConfirmActionDialog(
                    message: "\(row.label) を事務所に返却しましたか？",
                    confirmLabel: "返却した",
                    cancelLabel: "まだ",
                    onConfirm: giveBack,
                    onCancel: { confirmsReturn = false }
                )
            }
        }
    }

    private var current: some View {
        let mine = row.isHeld(by: auth.userID)
        return VStack(alignment: .leading, spacing: 10) {
            Text(mine ? "あなたが持ち出し中" : "持ち出し中").appFont(14, weight: .black).foregroundStyle(Color.redPlate)
            field("使用者", row.holder_name ?? "")
            field("持ち出し日時", row.takenAt.map(Self.format) ?? "")
            field("使用予定地", row.destination ?? "")
            field("返却日時", "未返却")
            if mine {
                Button(busy ? "処理中…" : "返却する") { confirmsReturn = true }
                    .buttonStyle(PillButtonStyle())
                    .disabled(busy)
                    .padding(.top, 4)
                Text("赤枠を事務所に戻してから返却してください。（事務所のNFCでの返却は、今後対応します）")
                    .appFont(11).foregroundStyle(Color.mutedForeground)
            }
        }
        .padding(16)
        .card(border: Color.redPlate.opacity(0.6))
    }

    private var takeForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("空き", systemImage: "checkmark.circle.fill").appFont(14, weight: .black).foregroundStyle(Color.primary)
            field("使用者", inspections.profile.map(\.full_name).flatMap { $0.isEmpty ? nil : $0 } ?? auth.loginLabel ?? "")
            field("持ち出し日時", "持ち出すボタンを押した時刻")
            FormField(label: "使用予定地（必須）") {
                BoxedTextField(placeholder: "例：USS東京 → 本郷ヤード", text: $destination, fill: .card)
            }
            let ready = !destination.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !busy
            Button(busy ? "処理中…" : "持ち出す") { take() }
                .buttonStyle(PillButtonStyle(kind: .destructive))
                .disabled(!ready)
                .opacity(ready ? 1 : 0.5)
        }
        .padding(16)
        .card()
    }

    private var historySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("持ち出し記録").appFont(15, weight: .bold).foregroundStyle(Color.appForeground)
            if history.isEmpty {
                Text("記録はまだありません。").appFont(13).foregroundStyle(Color.mutedForeground)
            }
            ForEach(history) { use in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(use.user_name).appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
                        Spacer()
                        if use.returnedAt == nil {
                            Text("未返却").appFont(11, weight: .black).foregroundStyle(Color.redPlate)
                        }
                    }
                    Text("使用予定地：\(use.destination)").appFont(12).foregroundStyle(Color.appForeground)
                    Text("持ち出し：\(use.takenAt.map(Self.format) ?? "")").appFont(12).monospacedDigit().foregroundStyle(Color.mutedForeground)
                    if let returned = use.returnedAt {
                        Text("返却：\(Self.format(returned))\(use.returnMethodLabel.map { "（\($0)）" } ?? "")")
                            .appFont(12).monospacedDigit().foregroundStyle(Color.mutedForeground)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .card(radius: 12)
            }
        }
    }

    private func field(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label).appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground).frame(width: 96, alignment: .leading)
            Text(value).appFont(15, weight: .semibold).foregroundStyle(Color.appForeground)
            Spacer(minLength: 0)
        }
    }

    private static func format(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "M月d日(E) H:mm"
        return formatter.string(from: date)
    }

    private func take() {
        busy = true
        let place = destination.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            do {
                try await RedPlateRepository.take(plateID: row.plate_id, destination: place)
                onDone()
            } catch let failure as PostgrestError where failure.code == "23505" {
                error = "この赤枠は、たった今ほかの人が持ち出しました。"
            } catch {
                self.error = "持ち出せませんでした。通信状況を確認してください。"
            }
            busy = false
        }
    }

    private func giveBack() {
        confirmsReturn = false
        guard let useID = row.use_id else { return }
        busy = true
        Task {
            do {
                try await RedPlateRepository.giveBack(useID: useID)
                onDone()
            } catch {
                self.error = "返却できませんでした。通信状況を確認してください。"
            }
            busy = false
        }
    }
}
