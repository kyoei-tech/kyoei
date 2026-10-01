import KyoeiCore
import SwiftUI

/// Bottom navigation. A custom bar rather than TabView because (a) re-tapping
/// the active tab must reset it to its top screen, (b) the home and menu tabs
/// carry hidden 5-tap gestures, and (c) the bar is the brand's charcoal with
/// a lime active tab in both appearances. Port of components/bottom-tabs.tsx.
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
                    let active = tab == selection
                    VStack(spacing: 4) {
                        Image(systemName: tab.systemImage)
                            .font(.system(size: 20, weight: active ? .bold : .medium))
                        Text(tab.label)
                            .appFont(10.4, weight: active ? .heavy : .bold)
                    }
                    .foregroundStyle(active ? Color.brand : Color.chromeMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .overlay(alignment: .top) {
                        if active {
                            SlantedRectangle(slant: 3).fill(Color.brand).frame(width: 36, height: 3).offset(y: -8)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == selection ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(Color.chrome.ignoresSafeArea(edges: .bottom))
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

/// Charcoal header with the logo, shown on every tab in both appearances
/// (L03 / R01). It also carries the persistent 運行中/休息中 (出勤中/退勤済み)
/// status so the driver never forgets to flip the switch — the former
/// status band. Port of components/status-band.tsx.
struct BrandHeader: View {
    let status: ShiftBandStatus

    var body: some View {
        HStack(spacing: 12) {
            Image("KyoeiLogo")
                .resizable()
                .scaledToFit()
                .frame(height: 22)
                .accessibilityLabel("KYOEI")
            Spacer(minLength: 8)
            switch status {
            case .hidden:
                EmptyView()
            case .working(let label):
                pill(label, fill: .brand, foreground: .brandForeground)
            case .resting(let label):
                pill(label, fill: .restingBand, foreground: .black)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(Color.chrome.ignoresSafeArea(edges: .top))
    }

    private func pill(_ label: String, fill: Color, foreground: Color) -> some View {
        Text(label)
            .appFont(12, weight: .heavy)
            .tracking(0.5)
            .foregroundStyle(foreground)
            .padding(.horizontal, 14)
            .padding(.vertical, 4)
            .background(fill, in: SlantedRectangle(slant: 6))
            .accessibilityAddTraits(.updatesFrequently)
    }
}
