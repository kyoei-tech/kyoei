import KyoeiCore
import SwiftUI

/// Bottom navigation. A custom bar rather than TabView because (a) re-tapping
/// the active tab must reset it to its top screen, (b) the home and menu tabs
/// carry hidden 5-tap gestures, and (c) the bar is brand-lime. Port of
/// components/bottom-tabs.tsx.
struct AppTabBar: View {
    let selection: AppTab
    let onSelect: (AppTab) -> Void
    /// 5 taps on ホーム: 乗務員モード ⇄ タイムカードモード.
    let onSecretHomeGesture: () -> Void
    /// 5 taps on メニュー: 試験運転モード (PIN-gated by the caller).
    let onSecretMenuGesture: () -> Void

    @State private var homeTaps = SecretTapCounter()
    @State private var menuTaps = SecretTapCounter()

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                Button {
                    handleTap(tab)
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.systemImage)
                            .font(.system(size: 20, weight: tab == selection ? .bold : .medium))
                        Text(tab.label)
                            .appFont(10.4, weight: .bold)
                    }
                    .foregroundStyle(Color.appForeground)
                    .opacity(tab == selection ? 1 : 0.6)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == selection ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(Color.brandLime.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) {
            Rectangle().fill(Color.black.opacity(0.1)).frame(height: 1)
        }
    }

    private func handleTap(_ tab: AppTab) {
        switch tab {
        case .home where homeTaps.registerTap():
            onSecretHomeGesture()
        case .menu where menuTaps.registerTap():
            onSecretMenuGesture()
        default:
            break
        }
        onSelect(tab)
    }
}

extension AppTab {
    var systemImage: String {
        switch self {
        case .home: "house"
        case .yard: "building.2"
        case .staff: "checklist"
        case .news: "bell"
        case .menu: "line.3.horizontal"
        }
    }
}

/// Persistent 運行中/休息中 (出勤中/退勤済み) band, shown on every tab so the
/// driver never forgets to flip the switch. Port of components/status-band.tsx.
struct StatusBand: View {
    let status: ShiftBandStatus

    var body: some View {
        switch status {
        case .hidden:
            EmptyView()
        case .working(let label):
            band(label, color: .brandLime)
        case .resting(let label):
            band(label, color: .restingBand)
        }
    }

    private func band(_ label: String, color: Color) -> some View {
        Text(label)
            .appFont(12, weight: .bold)
            .tracking(0.5)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .background(color)
            .accessibilityAddTraits(.updatesFrequently)
    }
}
