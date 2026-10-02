import SwiftUI

/// Shared 戻る button for sub-pages.
///
/// Declaring a `BackHeader` doesn't draw the button in place: it publishes
/// it (a preference) to the nearest `backButtonHost()`, which floats it on
/// the top layer at the top-left of the screen. Page content scrolls
/// underneath it, so the button never scrolls away and never takes a
/// full-width band. When pages nest (a menu page showing a list, then a
/// detail), the innermost declaration wins. The host also enables a guarded
/// swipe-right-from-the-left-edge gesture for the same action
/// (`EdgeSwipeBack`). Only `trailing` content (e.g. a
/// title next to the button) is laid out in place.
/// Port of components/back-header.tsx.
struct BackHeader<Trailing: View>: View {
    enum Variant { case primary, subtle, icon }

    var label = "戻る"
    var variant: Variant = .primary
    let onBack: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        Group {
            if Trailing.self == EmptyView.self {
                Color.clear.frame(height: 0)
            } else {
                trailing
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 4)
            }
        }
        .preference(key: BackButtonKey.self, value: BackButtonSpec(label: label, iconOnly: variant == .icon, action: onBack))
        .preference(key: BackButtonPresenceKey.self, value: true)
    }
}

struct BackButtonSpec {
    let label: String
    let iconOnly: Bool
    let action: () -> Void
}

/// The back button to float; the last (innermost) declaration wins.
struct BackButtonKey: PreferenceKey {
    static var defaultValue: BackButtonSpec? { nil }
    static func reduce(value: inout BackButtonSpec?, nextValue: () -> BackButtonSpec?) {
        value = nextValue() ?? value
    }
}

/// Whether any back button is declared (Equatable, to reserve its space).
struct BackButtonPresenceKey: PreferenceKey {
    static var defaultValue: Bool { false }
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

/// The floating button: charcoal capsule, lime arrow, lime hairline, and a
/// shadow so it reads over content scrolling beneath it.
struct FloatingBackButton: View {
    let spec: BackButtonSpec

    var body: some View {
        Button(action: spec.action) {
            HStack(spacing: 6) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(Color.brand)
                if !spec.iconOnly {
                    Text(spec.label)
                        .appFont(14, weight: .bold)
                        .foregroundStyle(Color.chromeForeground)
                        .lineLimit(1)
                }
            }
            .padding(.leading, spec.iconOnly ? 0 : 12)
            .padding(.trailing, spec.iconOnly ? 0 : 16)
            .frame(minWidth: 40, minHeight: 40)
            .background(Color.chrome, in: Capsule())
            .overlay(Capsule().stroke(Color.cardEdge))
            .contentShape(Capsule())
            .shadow(color: .black.opacity(0.25), radius: 6, y: 2)
        }
        .buttonStyle(PressScaleStyle())
        .fixedSize()
        .accessibilityLabel(spec.label)
    }
}

/// Swipe right from the left edge to go back, guarded against accidents:
/// the drag must start within the leftmost `edge` points, stay mostly
/// horizontal, and travel at least `threshold` points. A lime arrow follows
/// the finger and fills (with a haptic tap) once releasing will go back;
/// letting go before that, or drifting vertically, cancels.
struct EdgeSwipeBack: View {
    let action: () -> Void

    @State private var distance: CGFloat = 0
    @State private var armed = false

    static let edge: CGFloat = 20
    static let threshold: CGFloat = 110

    var body: some View {
        Color.clear
            .frame(width: Self.edge)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 10, coordinateSpace: .local)
                    .onChanged { value in
                        let dx = max(0, value.translation.width)
                        // Mostly vertical: a scroll, not a back swipe.
                        guard abs(value.translation.height) < max(dx, 24) else {
                            distance = 0
                            armed = false
                            return
                        }
                        distance = dx
                        armed = dx >= Self.threshold
                    }
                    .onEnded { value in
                        let goBack = armed && abs(value.translation.height) < 80
                        withAnimation(.easeOut(duration: 0.15)) {
                            distance = 0
                            armed = false
                        }
                        if goBack { action() }
                    }
            )
            .overlay(alignment: .leading) {
                if distance > 0 {
                    indicator
                        .offset(x: min(distance, Self.threshold) * 0.55 - 30)
                        .allowsHitTesting(false)
                }
            }
            .sensoryFeedback(trigger: armed) { _, isArmed in isArmed ? .impact(weight: .medium) : nil }
            .accessibilityHidden(true)
    }

    private var indicator: some View {
        Image(systemName: "chevron.left")
            .font(.system(size: 18, weight: .heavy))
            .foregroundStyle(armed ? Color.brandForeground : Color.brand)
            .frame(width: 44, height: 44)
            .background(armed ? Color.brand : Color.chrome, in: Circle())
            .overlay(Circle().stroke(Color.brand, lineWidth: 2))
            .shadow(color: .black.opacity(0.25), radius: 6, y: 2)
            .scaleEffect(armed ? 1.1 : 0.9)
            .opacity(min(1, distance / 40))
    }
}

/// Draws the back button declared anywhere inside `content` on the top layer
/// and reserves a transparent strip for it: scroll views inside start below
/// the button but scroll under it. Hosts consume the preference, so nested
/// hosts never draw it twice.
private struct BackButtonHost: ViewModifier {
    @State private var hasBack = false

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .top, spacing: 0) {
                if hasBack { Color.clear.frame(height: Self.reserved) }
            }
            .overlayPreferenceValue(BackButtonKey.self, alignment: .topLeading) { spec in
                if let spec {
                    ZStack(alignment: .topLeading) {
                        EdgeSwipeBack(action: spec.action)
                        FloatingBackButton(spec: spec)
                            .padding(.leading, 16)
                            .padding(.top, 6)
                    }
                }
            }
            .onPreferenceChange(BackButtonPresenceKey.self) { present in
                Task { @MainActor in hasBack = present }
            }
            .transformPreference(BackButtonKey.self) { $0 = nil }
            .transformPreference(BackButtonPresenceKey.self) { $0 = false }
    }

    static let reserved: CGFloat = 52
}

extension View {
    func backButtonHost() -> some View {
        modifier(BackButtonHost())
    }
}

extension BackHeader where Trailing == EmptyView {
    init(label: String = "戻る", variant: Variant = .primary, onBack: @escaping () -> Void) {
        self.init(label: label, variant: variant, onBack: onBack) { EmptyView() }
    }
}
