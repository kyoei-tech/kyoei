import KyoeiCore
import SwiftUI
import UserNotifications
#if canImport(UIKit)
import UIKit
#endif

/// 設定: per-device font sizes, theme, 乗務員ID, part-time mode, 試験運転モード
/// (with テストアカウント管理) and notifications. Tapping the bell 5 times opens
/// the PIN-gated 通知の管理 admin menu. Port of components/settings-view.tsx.
struct SettingsView: View {
    private static let partTimePasscode = "2486"
    private static let adminPasscode = "0525"

    @Environment(SettingsStore.self) private var store
    @State private var partTimeGate = PinGate(code: SettingsView.partTimePasscode)
    @State private var adminGate = PinGate(code: SettingsView.adminPasscode)
    @State private var screen: Screen = .main
    @State private var bellTaps = SecretTapCounter()

    enum Screen: Equatable {
        case main, version, adminMenu, pushEditor, alertEditor, registry
    }

    var body: some View {
        Group {
            switch screen {
            case .main: main
            case .version: VersionView(onBack: { screen = .main })
            case .adminMenu: AdminMenuView(onBack: { screen = .main }, open: { screen = $0 })
            case .pushEditor: PushRuleEditorView(onBack: { screen = .adminMenu })
            case .alertEditor: AlertMessageEditorView(onBack: { screen = .adminMenu })
            case .registry: DestinationRegistryView(onBack: { screen = .adminMenu })
            }
        }
        .pinGate(partTimeGate)
        .pinGate(adminGate)
    }

    private var main: some View {
        @Bindable var store = store
        return TabPage {
            PageHeading(title: "設定", subtitle: "フォントサイズや背景色をこの端末用に変更できます。")
            FontSection(settings: $store.settings)
            ThemeSection(theme: $store.settings.theme)
            StaffIDSection(staffMemberID: $store.settings.staffMemberID)
            SettingsCard(title: "モード", note: store.settings.partTimeMode
                ? "アルバイトモード中は編集操作が制限され、シンプルなタイムカード画面のみ利用できます。"
                : "暗証番号を入力すると、編集操作を制限したシンプルな画面に切り替えられます。") {
                ToggleRow(title: store.settings.partTimeMode ? "社員モードに切り替え" : "アルバイトモード",
                          systemImage: "briefcase", isOn: store.settings.partTimeMode) {
                    partTimeGate.guarded { store.settings.setPartTimeMode(!store.settings.partTimeMode) }
                }
            }
            SettingsCard(title: "荷姿の記録", note: "配車表で1回戦分の車台番号の照合が終わったときに、荷姿（何番に何を積んだか・写真）の入力画面を出します。オフにしても、配車表の「荷姿を記録」からいつでも入力できます。") {
                ToggleRow(title: "照合完了時に入力画面を出す", systemImage: "shippingbox", isOn: store.settings.packingPrompt) {
                    store.settings.packingPrompt.toggle()
                }
            }
            if store.settings.testDriveMode {
                TestDriveSection(onExit: { store.settings.testDriveMode = false })
            }
            NotificationSection(settings: $store.settings, onBellTap: {
                if bellTaps.registerTap() {
                    adminGate.guarded { screen = .adminMenu }
                }
            })
            if !store.settings.partTimeMode {
                VersionRow { screen = .version }
            }
        }
    }
}

// MARK: - Sections

struct SettingsCard<Content: View>: View {
    let title: String
    var note: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
            if let note {
                Text(note).appFont(12).foregroundStyle(Color.mutedForeground)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .card()
    }
}

/// Full-width row with a switch, styled like the web toggles.
struct ToggleRow<Leading: View>: View {
    let title: String
    var subtitle: String?
    let isOn: Bool
    let action: () -> Void
    @ViewBuilder var leading: Leading

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                leading
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                    if let subtitle {
                        Text(subtitle).appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                }
                Spacer(minLength: 8)
                Capsule()
                    .fill(isOn ? Color.primary : Color.border)
                    .frame(width: 44, height: 24)
                    .overlay(alignment: isOn ? .trailing : .leading) {
                        Circle().fill(Color.card).frame(width: 20, height: 20).padding(2)
                    }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .card(border: isOn ? .primary : .border, fill: isOn ? Color.primary.opacity(0.15) : .appBackground)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

extension ToggleRow where Leading == AnyView {
    init(title: String, subtitle: String? = nil, systemImage: String, isOn: Bool, action: @escaping () -> Void) {
        self.init(title: title, subtitle: subtitle, isOn: isOn, action: action) {
            AnyView(Image(systemName: systemImage).font(.system(size: 18)).foregroundStyle(isOn ? Color.primary : Color.mutedForeground))
        }
    }
}

private struct FontSection: View {
    @Binding var settings: AppSettings

    var body: some View {
        SettingsCard(title: "フォント") {
            ToggleRow(title: "デバイスに合わせる", subtitle: "ONの場合、デバイスの文字サイズ設定に合わせて表示します。",
                      systemImage: "iphone", isOn: settings.deviceFont) { settings.deviceFont.toggle() }
            Text(settings.deviceFont
                 ? "デバイスに合わせる設定がONのため、下の個別設定は無効になっています。"
                 : "各タブごとに文字の大きさを6段階で調整できます。")
                .appFont(12).foregroundStyle(Color.mutedForeground)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(AppTab.allCases, id: \.self) { tab in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(tab.label).appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                        HStack(spacing: 6) {
                            ForEach(1...AppSettings.fontScales.count, id: \.self) { level in
                                let active = settings.fontLevels[tab] == level
                                Button { settings.fontLevels[tab] = level } label: {
                                    // Preview size follows the real scale ratio.
                                    Text("Aa")
                                        .font(.system(size: 12 * AppSettings.fontScales[level - 1], weight: .semibold))
                                        .frame(maxWidth: .infinity, minHeight: 36)
                                        .foregroundStyle(active ? Color.primaryForeground : Color.mutedForeground)
                                        .card(radius: 10, border: active ? .primary : .border, fill: active ? .primary : .appBackground)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(tab.label)の文字サイズ \(level)")
                                .accessibilityAddTraits(active ? .isSelected : [])
                            }
                        }
                    }
                }
            }
            .disabled(settings.deviceFont)
            .opacity(settings.deviceFont ? 0.4 : 1)
        }
    }
}

private struct ThemeSection: View {
    @Binding var theme: ThemeMode

    var body: some View {
        SettingsCard(title: "背景色", note: "昼間はライト、夜間はダークが見やすくなります。初期設定は「デバイスに合わせる」で、iPhoneのダークモードに合わせて自動で切り替わります。") {
            HStack(spacing: 8) {
                option(.system, "デバイスに合わせる", "iphone")
                option(.light, "ライト", "sun.max")
                option(.dark, "ダーク", "moon")
            }
        }
    }

    private func option(_ mode: ThemeMode, _ label: String, _ systemImage: String) -> some View {
        let active = theme == mode
        return Button { theme = mode } label: {
            VStack(spacing: 6) {
                Image(systemName: systemImage).font(.system(size: 18))
                Text(label).appFont(12, weight: .semibold).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 64)
            .foregroundStyle(active ? Color.primary : Color.mutedForeground)
            .card(radius: 14, border: active ? .primary : .border, fill: active ? Color.primary.opacity(0.15) : .appBackground)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

private struct StaffIDSection: View {
    @Binding var staffMemberID: String?
    @State private var table = RealtimeTable<StaffMemberRow>(table: "staff_members", fetch: StaffRepository.fetch)
    @State private var open = false

    var body: some View {
        SettingsCard(title: "乗務員ID", note: "出勤簿の自分の名前を選ぶと、ホームの出庫・帰庫がそのまま出勤簿の状態に反映されます。") {
            Button { open.toggle() } label: {
                HStack {
                    Label(currentName, systemImage: "person.crop.circle").appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
                    Spacer()
                    Image(systemName: "chevron.down").rotationEffect(.degrees(open ? 180 : 0)).foregroundStyle(Color.mutedForeground)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .card(fill: .appBackground)
            }
            .buttonStyle(.plain)
            if open {
                FlowLayout(spacing: 8) {
                    chip("未設定", id: nil)
                    ForEach(table.rows.sorted { $0.sort_order < $1.sort_order }) { chip($0.name, id: $0.id) }
                }
            }
        }
        .syncing(table)
    }

    private var currentName: String {
        staffMemberID.flatMap { id in table.rows.first { $0.id == id }?.name } ?? "未設定"
    }

    private func chip(_ name: String, id: String?) -> some View {
        let active = staffMemberID == id
        return Button {
            staffMemberID = id
            open = false
        } label: {
            Text(name)
                .appFont(14, weight: .semibold)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .foregroundStyle(active ? Color.primary : Color.mutedForeground)
                .background(active ? Color.primary.opacity(0.15) : Color.appBackground, in: Capsule())
                .overlay(Capsule().stroke(active ? Color.primary : Color.border))
        }
        .buttonStyle(.plain)
    }
}

/// 試験運転モード: exit switch and テストアカウント管理. The account list is
/// fetched through the PIN-checked admin RPCs, so the PIN is verified by the
/// database rather than the app.
private struct TestDriveSection: View {
    let onExit: () -> Void

    @State private var pin = ""
    @State private var verifiedPIN: String?
    @State private var accounts: [TestAccountAdmin.Account] = []
    @State private var loading = false
    @State private var error: String?
    @State private var confirmDeleteID: UUID?

    var body: some View {
        SettingsCard(title: "試験運転モード", note: "メニュー上部に試験運転メニュー（マイページ・配車表など）を表示しています。不要になったらここから終了できます。") {
            ToggleRow(title: "試験運転モードを終了", systemImage: "testtube.2", isOn: true, action: onExit)
            Divider()
            Text("登録済みアカウント").appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
            Text("マイページ・配車表で登録されたアカウントです。テストで作成したアカウントはここから削除できます。")
                .appFont(12).foregroundStyle(Color.mutedForeground)
            if verifiedPIN == nil {
                HStack(spacing: 8) {
                    SecureField("暗証番号", text: $pin)
                        .numericKeyboard()
                        .appFont(14)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .card(radius: 12, fill: .appBackground)
                    Button("表示") { Task { await load(pin: pin) } }
                        .buttonStyle(PillButtonStyle()).fixedSize()
                        .disabled(pin.isEmpty || loading)
                }
            }
            if loading {
                Text("読み込み中...").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            if let error {
                Text(error).appFont(12).foregroundStyle(Color.destructive)
            }
            if verifiedPIN != nil && !loading && accounts.isEmpty {
                Text("登録済みアカウントはありません。").appFont(12).foregroundStyle(Color.mutedForeground)
            }
            ForEach(accounts) { account in
                accountRow(account)
            }
        }
    }

    @ViewBuilder private func accountRow(_ account: TestAccountAdmin.Account) -> some View {
        Group {
            if confirmDeleteID == account.id {
                ConfirmDeleteInline(message: "\(account.staffName)のアカウントを削除しますか？",
                                    onConfirm: { Task { await delete(account) } },
                                    onCancel: { confirmDeleteID = nil })
            } else {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(account.staffName).appFont(14, weight: .medium).foregroundStyle(Color.appForeground)
                        if let email = account.email {
                            Label(email, systemImage: "envelope").appFont(12).foregroundStyle(Color.mutedForeground).lineLimit(1)
                        }
                    }
                    Spacer()
                    Button { confirmDeleteID = account.id } label: {
                        Label("削除", systemImage: "trash").appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .card(radius: 12, fill: .appBackground)
    }

    private func load(pin: String) async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            accounts = try await TestAccountAdmin.list(pin: pin)
            verifiedPIN = pin
            self.pin = ""
        } catch let failure as TestAccountAdmin.Failure {
            error = failure.errorDescription
        } catch {
            self.error = "アカウント一覧を読み込めませんでした。"
        }
    }

    private func delete(_ account: TestAccountAdmin.Account) async {
        guard let verifiedPIN else { return }
        do {
            try await TestAccountAdmin.delete(account, pin: verifiedPIN)
            accounts.removeAll { $0.id == account.id }
        } catch {
            self.error = "削除に失敗しました。もう一度お試しください。"
        }
        confirmDeleteID = nil
    }
}

/// プッシュ通知: the master switch (OS permission + APNs registration), which
/// remote events to receive, and the hidden 5-tap bell.
private struct NotificationSection: View {
    @Binding var settings: AppSettings
    let onBellTap: () -> Void

    @State private var authorization: UNAuthorizationStatus?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL

    var body: some View {
        SettingsCard(title: "プッシュ通知", note: "運行状況の連続走行時間・累計休息時間・運行時間が一定の時間を超えたときや、おしらせの投稿・出勤簿の変更を通知でお知らせします。") {
            ToggleRow(title: "プッシュ通知", isOn: settings.pushNotificationsEnabled, action: toggle) {
                Image(systemName: "bell")
                    .font(.system(size: 18))
                    .foregroundStyle(settings.pushNotificationsEnabled ? Color.primary : Color.mutedForeground)
                    // The bell itself is the hidden 5-tap entry to 通知の管理.
                    .onTapGesture(perform: onBellTap)
            }
            status
            if settings.pushNotificationsEnabled {
                Text("受け取る通知").appFont(12, weight: .semibold).foregroundStyle(Color.mutedForeground)
                ForEach(PushTopic.allCases, id: \.self) { topic in
                    let on = settings.pushTopics.contains(topic)
                    ToggleRow(title: topic.label, systemImage: topic == .news ? "megaphone" : "checklist", isOn: on) {
                        if on { settings.pushTopics.remove(topic) } else { settings.pushTopics.insert(topic) }
                    }
                }
            }
        }
        .task(id: scenePhase) { await refreshAuthorization() }
    }

    @ViewBuilder private var status: some View {
        if authorization == .denied {
            VStack(alignment: .leading, spacing: 6) {
                Text("通知がブロックされています。iPhoneの設定アプリから通知を許可してください。")
                    .appFont(12).foregroundStyle(Color.destructive)
                #if canImport(UIKit)
                Button("設定を開く") {
                    if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
                }
                .appFont(12, weight: .semibold)
                #endif
            }
        } else if let error = PushRegistrar.shared.lastError, settings.pushNotificationsEnabled {
            Text("通知の登録に失敗しました：\(error)").appFont(12).foregroundStyle(Color.destructive)
        } else if settings.pushNotificationsEnabled && PushRegistrar.shared.deviceToken != nil {
            Text("この端末はプッシュ通知の登録済みです。アプリを閉じていても届きます。")
                .appFont(12).foregroundStyle(Color.mutedForeground)
        }
    }

    private func toggle() {
        if settings.pushNotificationsEnabled {
            settings.pushNotificationsEnabled = false
            return
        }
        Task {
            let granted = await NotificationScheduler.requestAuthorization()
            await refreshAuthorization()
            if granted { settings.pushNotificationsEnabled = true }
        }
    }

    private func refreshAuthorization() async {
        authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }
}

private struct VersionRow: View {
    let action: () -> Void
    @State private var table = RealtimeTable<ChangelogRow>(table: "changelog_entries", fetch: ChangelogRepository.fetch)

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: "tag")
                    .foregroundStyle(Color.primary)
                    .frame(width: 40, height: 40)
                    .background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Version").appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                    Text("現在のバージョン：\(Changelog.currentVersion(table.rows))").appFont(12).foregroundStyle(Color.mutedForeground)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .card()
        }
        .buttonStyle(.plain)
        .syncing(table)
    }
}

/// Wrapping row layout for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? rows.map(\.width).max() ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [(indices: [Int], width: CGFloat, height: CGFloat)] {
        var rows: [(indices: [Int], width: CGFloat, height: CGFloat)] = []
        var current: (indices: [Int], width: CGFloat, height: CGFloat) = ([], 0, 0)
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if needed > width && !current.indices.isEmpty {
                rows.append(current)
                current = ([index], size.width, size.height)
            } else {
                current = (current.indices + [index], needed, max(current.height, size.height))
            }
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}
