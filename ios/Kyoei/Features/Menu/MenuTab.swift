import KyoeiCore
import SwiftUI

/// メニュー tab: the item list plus a NavigationStack for its sub-pages.
/// Port of components/menu-view.tsx. The shell owns `path` so re-tapping the
/// tab (path = []) or deep-linking from home (path = [item]) both work.
struct MenuTab: View {
    @Binding var path: [MenuItem]
    @Environment(SettingsStore.self) private var settings

    var body: some View {
        NavigationStack(path: $path) {
            TabPage {
                VStack(alignment: .leading, spacing: 4) {
                    Text("メニュー")
                        .appFont(20, weight: .bold)
                        .foregroundStyle(Color.appForeground)
                    Text("その他の項目はこちらから確認できます。")
                        .appFont(14)
                        .foregroundStyle(Color.mutedForeground)
                }

                VStack(spacing: 10) {
                    ForEach(regularItems, id: \.self) { item in
                        MenuRow(item: item, style: item == .emergency ? .emergency : .normal)
                    }
                }
            }
            .background(AppBackground())
            .hiddenNavigationBar()
            .navigationDestination(for: MenuItem.self) { item in
                // LoL reached from AA's 会場詳細 opens on the AA entries and
                // steps back to AA rather than to the menu.
                let fromAA = item == .lol && path.dropLast().last == .aa
                MenuDestination(
                    item: item,
                    backLabel: fromAA ? "開催日一覧へ戻る" : "メニューへ戻る",
                    onBack: { path.removeLast() },
                    push: { path.append($0) }
                )
            }
        }
    }

    private var regularItems: [MenuItem] {
        MenuItem.regularItems(partTimeMode: settings.settings.partTimeMode)
    }
}

private struct MenuRow: View {
    enum Style { case normal, emergency }

    let item: MenuItem
    let style: Style

    var body: some View {
        NavigationLink(value: item) {
            HStack(spacing: 12) {
                Image(systemName: item.systemImage)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(tint)
                    .frame(width: 40, height: 40)
                    .background(tint.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label)
                        .appFont(16, weight: .semibold)
                        .foregroundStyle(Color.appForeground)
                    Text(item.summary)
                        .appFont(12)
                        .foregroundStyle(Color.mutedForeground)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Color.mutedForeground)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(background, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(border))
            .multilineTextAlignment(.leading)
        }
        .buttonStyle(.plain)
    }

    private var tint: Color { style == .emergency ? .destructive : .primary }

    private var background: Color {
        switch style {
        case .normal: .card
        case .emergency: Color.destructive.opacity(0.06)
        }
    }

    private var border: Color {
        switch style {
        case .normal: .border
        case .emergency: Color.destructive.opacity(0.3)
        }
    }
}

/// Sub-page router. "メニューへ戻る" floats on the top layer (BackHeader /
/// backButtonHost); a page that shows its own deeper back button (e.g. a
/// detail's 一覧へ戻る) replaces it while open.
private struct MenuDestination: View {
    let item: MenuItem
    let backLabel: String
    let onBack: () -> Void
    let push: (MenuItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            BackHeader(label: backLabel, variant: .subtle, onBack: onBack)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        // Inside the NavigationStack, so preferences from pushed pages are
        // collected here rather than relying on them crossing the stack.
        .backButtonHost()
        .background(AppBackground())
        .hiddenNavigationBar()
    }

    @ViewBuilder private var content: some View {
        switch item {
        case .settings:
            SettingsView()
        case .tripHistory:
            TripHistoryView()
        case .accidents:
            AccidentCalendarView()
        case .lolmap:
            LolMapView()
        case .lol:
            LolView(initialDestinationID: backLabel == "開催日一覧へ戻る" ? "aa" : nil)
        case .aa:
            AuctionView(onOpenVenueDetail: { push(.lol) })
        case .cars:
            HighValueCarsView()
        case .emergency:
            EmergencyContactsView()
        case .notes:
            BeginnerNotesView()
        case .terms:
            DriverTermsView()
        case .qa:
            QAView()
        case .mypage:
            MyPageView()
        }
    }
}

extension MenuItem {
    var systemImage: String {
        switch self {
        case .mypage: "person.text.rectangle"
        case .lolmap: "mappin.and.ellipse"
        case .lol: "mappin"
        case .aa: "calendar"
        case .cars: "car"
        case .accidents: "calendar.badge.checkmark"
        case .tripHistory: "clock.arrow.circlepath"
        case .emergency: "phone"
        case .notes: "book"
        case .terms: "book.closed"
        case .qa: "questionmark.bubble"
        case .settings: "gearshape"
        }
    }
}
