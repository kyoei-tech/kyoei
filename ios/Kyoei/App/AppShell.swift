import KyoeiCore
import SwiftUI

/// The single app screen: status band, the active tab's content, and the
/// bottom tab bar. Port of components/attendance-app.tsx.
struct AppShell: View {
    // PIN for the メニュー tab's hidden 5-tap gesture that unlocks 試験運転モード.
    private static let testDriveModePasscode = "0525"

    @Environment(SettingsStore.self) private var settings
    @Environment(ShiftStore.self) private var shift
    @Environment(SharedData.self) private var data
    @Environment(PendingNotificationStore.self) private var pendingNotifications

    @State private var tab: AppTab = .home
    @State private var menuPath: [MenuItem] = []
    @State private var testDriveGate = PinGate(code: AppShell.testDriveModePasscode)

    var body: some View {
        VStack(spacing: 0) {
            StatusBand(status: shift.bandStatus(for: settings.settings.appMode))
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .environment(\.fontScale, settings.settings.fontScale(for: tab))
            AppTabBar(
                selection: tab,
                onSelect: select,
                onSecretHomeGesture: {
                    // Locked during part-time mode: switching there only happens
                    // through 設定 (with its PIN), not this hidden gesture.
                    guard !settings.settings.partTimeMode else { return }
                    settings.toggleAppMode()
                },
                onSecretMenuGesture: {
                    testDriveGate.guarded { settings.settings.testDriveMode = true }
                }
            )
        }
        .background(AppBackground())
        .environment(\.followsDeviceFont, settings.settings.deviceFont)
        .overlay { PendingNotificationOverlay() }
        .pinGate(testDriveGate)
        // App-lifetime realtime tables shared by several screens.
        .syncing(data.confirmMessageRows)
        .syncing(data.notificationRuleRows)
        .syncing(data.deviceTrips)
        .syncing(data.accidentDates)
        .task { await runTicker() }
        .task(id: PushSettingsKey(settings.settings)) {
            // Covers launch and any change to 通知 on/off, 乗務員ID or topics.
            shift.notificationsEnabled = settings.settings.pushNotificationsEnabled
            await PushRegistrar.shared.update(settings: settings.settings)
        }
        .onChange(of: data.notificationRules) { _, rules in shift.notificationRules = rules }
        // A tap can also cold-launch the app, before onChange could observe it.
        .onAppear(perform: openRequestedTab)
        .onChange(of: NotificationRouter.shared.requestedTab) { _, _ in openRequestedTab() }
        .onChange(of: data.deviceTrips.isLoading) { _, _ in reconcileTrips() }
        .onChange(of: data.trips) { _, _ in reconcileTrips() }
    }

    @ViewBuilder private var content: some View {
        switch tab {
        case .home:
            switch settings.settings.appMode {
            case .driver: DriverHomeView(openMenuItem: openMenuItem)
            case .timecard: TimecardHomeView(openMenuItem: openMenuItem)
            }
        case .yard:
            TabPage { ComingSoonView(title: AppTab.yard.label, phase: 2) }
        case .staff:
            TabPage { ComingSoonView(title: AppTab.staff.label, phase: 2) }
        case .news:
            TabPage { ComingSoonView(title: AppTab.news.label, phase: 2) }
        case .menu:
            MenuTab(path: $menuPath)
        }
    }

    private func select(_ newTab: AppTab) {
        // Re-tapping (or switching to) a tab always lands on its top screen.
        switch newTab {
        case .menu:
            menuPath = []
        case .home:
            shift.driverScreen = .home
            shift.timecardScreen = .home
        default:
            break
        }
        tab = newTab
    }

    /// Lets other tabs (e.g. the home tab's 無事故 badge) jump straight into a
    /// menu sub-page instead of just switching to the menu tab.
    private func openMenuItem(_ item: MenuItem) {
        menuPath = [item]
        tab = .menu
    }

    /// Once per second: 30-minute break rule and in-app notification events.
    /// After returning from the background this also catches up on anything
    /// that crossed meanwhile, queuing the "了解しました。" modal for it.
    private func runTicker() async {
        while !Task.isCancelled {
            for event in shift.tick() {
                pendingNotifications.enqueue(title: event.title, message: event.message)
            }
            try? await Task.sleep(for: .seconds(1))
        }
    }

    private func openRequestedTab() {
        guard let requested = NotificationRouter.shared.requestedTab else { return }
        NotificationRouter.shared.requestedTab = nil
        select(requested)
    }

    private func reconcileTrips() {
        guard !data.deviceTrips.isLoading else { return }
        shift.reconcileSplitRestReturn(with: data.trips)
    }
}

/// The settings that affect remote push registration.
private struct PushSettingsKey: Equatable {
    let enabled: Bool
    let staffMemberID: String?
    let topics: Set<PushTopic>

    init(_ settings: AppSettings) {
        enabled = settings.pushNotificationsEnabled
        staffMemberID = settings.staffMemberID
        topics = settings.pushTopics
    }
}

/// Scrolling page container matching the web `<main>`'s px-4 / py-6 padding.
struct TabPage<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) { content }
                .padding(.horizontal, 16)
                .padding(.vertical, 24)
                .frame(maxWidth: 448)
                .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}
