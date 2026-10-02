import SwiftUI

/// Dimmed full-screen backdrop with a centered rounded card — the shared
/// shape of every blocking dialog in the app (PIN入力, 誤タップ防止, 通知).
struct ModalCard<Content: View>: View {
    var maxWidth: CGFloat = 320
    var dimming: Double = 0.5
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            Color.black.opacity(dimming).ignoresSafeArea()
            VStack(spacing: 0) { content }
                .padding(24)
                .frame(maxWidth: maxWidth)
                .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card))
                .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Color.border))
                .padding(.horizontal, 24)
        }
        .transition(.opacity)
    }
}

/// Round tinted icon badge shown at the top of a ModalCard.
struct ModalIcon: View {
    let systemName: String

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(Color.primary)
            .frame(width: 44, height: 44)
            .background(Color.primary.opacity(0.1), in: Circle())
            .padding(.bottom, 12)
    }
}

/// Pill-shaped dialog buttons: filled primary and bordered secondary.
struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, outline, destructive }
    var kind: Kind = .primary

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .appFont(14, weight: .semibold)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .padding(.horizontal, 16)
            .foregroundStyle(foreground)
            .background(background, in: Capsule())
            .overlay(Capsule().stroke(kind == .outline ? Color.border : .clear))
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .contentShape(Capsule())
    }

    private var foreground: Color {
        switch kind {
        case .primary: .primaryForeground
        case .secondary: .secondaryForeground
        case .outline: .appForeground
        case .destructive: .destructiveForeground
        }
    }

    private var background: Color {
        switch kind {
        case .primary: .primary
        case .secondary: .secondary
        case .outline: .clear
        case .destructive: .destructive
        }
    }
}
