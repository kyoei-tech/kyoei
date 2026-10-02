import SwiftUI

extension View {
    /// Rounded card surface. The default (a `.card` fill) is R01's carbon
    /// card with a lime hairline; callers that pass their own fill or border
    /// (selected options, inputs, tinted boxes) get a flat surface.
    func card(radius: CGFloat = 16, border: Color = .cardEdge, fill: Color = .card) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius)
        return background {
            shape.fill(fill)
                .overlay { if fill == .card { CarbonTexture().clipShape(shape) } }
        }
        .overlay(shape.stroke(border))
    }

    /// Whole-page tint telling at a glance whether the driver/worker is
    /// currently on (green) or off (orange). Port of lib/page-tint.ts.
    func pageTint(_ status: PageTint) -> some View {
        background(status.color.ignoresSafeArea(edges: .horizontal))
    }
}

enum PageTint {
    case working, resting, none

    var color: Color {
        switch self {
        case .working: Color.primary.opacity(0.07)
        case .resting: Color.secondary.opacity(0.07)
        case .none: .clear
        }
    }
}

extension View {
    /// Clocks and timers in the logo's style: heavy, condensed, italic, with
    /// tabular digits so ticking numbers don't jitter. (`weight` is kept for
    /// call sites; the face is always heavy.)
    func timerFont(_ size: CGFloat, weight: Font.Weight = .bold) -> some View {
        modifier(NumberFontModifier(size: size))
    }
}

/// Small filled/outlined pill used for 3/9/33時間 pickers and inline actions.
struct ChipButtonStyle: ButtonStyle {
    var selected: Bool
    var tint: Color = .primary
    var selectedForeground: Color = .primaryForeground

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .appFont(14, weight: .semibold)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .foregroundStyle(selected ? selectedForeground : Color.mutedForeground)
            .background(selected ? tint : Color.muted, in: Capsule())
            .overlay(Capsule().stroke(selected ? Color.clear : Color.border))
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
    }
}

/// Multi-line text field styled like the web textareas.
struct MemoEditor: View {
    let placeholder: String
    @Binding var text: String
    var minLines = 2

    var body: some View {
        TextField(placeholder, text: $text, axis: .vertical)
            .lineLimit(minLines...10)
            .appFont(14)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .card(radius: 12, fill: .appBackground)
    }
}
