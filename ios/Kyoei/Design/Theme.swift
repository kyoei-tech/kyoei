import SwiftUI
#if canImport(UIKit)
import UIKit
#else
import AppKit
#endif

// Design tokens for the KYOEI brand (logo lime #42E642, black, charcoal).
// Dark mode is design "R01 カーボン" (charcoal ground, carbon-textured cards
// with a lime hairline); light mode is "L03" (the same charcoal header and
// tab bar around a light content area). Each color resolves per appearance,
// and the appearance itself is Settings' 背景色 via `.preferredColorScheme`
// (default: follow the device; see KyoeiApp).
//
// Lime is never used as text on a light ground (≈1.6:1): `primary` is the
// readable accent ink (dark green in light mode, lime in dark mode), while
// `brand` is the lime fill, always with black (`brandForeground`) on it.

extension Color {
    init(light: UInt32, dark: UInt32, lightAlpha: Double = 1, darkAlpha: Double = 1) {
        #if canImport(UIKit)
        self.init(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(rgb: dark, alpha: darkAlpha)
                : UIColor(rgb: light, alpha: lightAlpha)
        })
        #else
        self.init(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(rgb: dark, alpha: darkAlpha)
                : NSColor(rgb: light, alpha: lightAlpha)
        })
        #endif
    }

    /// The logo's lime, as a fill (出庫, 照合ボタン, badges, the active tab).
    static let brand = Color(light: 0x42E642, dark: 0x42E642)
    /// Text/icons on `brand`.
    static let brandForeground = Color(light: 0x000000, dark: 0x000000)
    static let brandLime = brand
    /// Header and tab bar in both modes (the logo's charcoal).
    static let chrome = Color(light: 0x1F1F1F, dark: 0x1F1F1F)
    static let chromeForeground = Color(light: 0xF5F7F2, dark: 0xF5F7F2)
    static let chromeMuted = Color(light: 0x8E948B, dark: 0x8E948B)
    /// Card hairline (R01: a thin lime edge).
    static let cardEdge = Color(light: 0x42E642, dark: 0x42E642, lightAlpha: 0.9, darkAlpha: 0.55)
    static let appBackground = Color(light: 0xECEEEA, dark: 0x1F1F1F)
    static let appForeground = Color(light: 0x141A12, dark: 0xF5F7F2)
    static let card = Color(light: 0xFFFFFF, dark: 0x2A2A2A)
    /// Accent ink: readable as text on `card`/`appBackground` in both modes.
    static let primary = Color(light: 0x0B7A0B, dark: 0x42E642)
    static let primaryForeground = Color(light: 0xFFFFFF, dark: 0x000000)
    /// Amber; also the 休息中/帰庫済み "resting" accent.
    static let secondary = Color(light: 0xC37000, dark: 0xFCAA2B)
    static let secondaryForeground = Color(light: 0xFFFBF5, dark: 0x1F1306)
    static let muted = Color(light: 0xF0F2EE, dark: 0x333333)
    static let mutedForeground = Color(light: 0x566052, dark: 0xA6ABA3)
    static let accent = Color(light: 0xF0F2EE, dark: 0x333333)
    static let destructive = Color(light: 0xCC272E, dark: 0xEA3C3F)
    static let destructiveForeground = Color(light: 0xFFFAFA, dark: 0xFFFAFA)
    static let border = Color(light: 0x000000, dark: 0xFFFFFF, lightAlpha: 0.09, darkAlpha: 0.08)
    static let input = Color(light: 0x000000, dark: 0xFFFFFF, lightAlpha: 0.12, darkAlpha: 0.14)
    /// Tailwind orange-500, used by the status band while 休息中/退勤済み.
    static let restingBand = Color(red: 0xF9 / 255, green: 0x73 / 255, blue: 0x16 / 255)
}

#if canImport(UIKit)
private extension UIColor {
    convenience init(rgb: UInt32, alpha: Double) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: alpha
        )
    }
}
#else
private extension NSColor {
    convenience init(rgb: UInt32, alpha: Double) {
        self.init(
            srgbRed: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: alpha
        )
    }
}
#endif

enum Radius {
    /// --radius: 0.9rem
    static let base: CGFloat = 14.4
    static let card: CGFloat = 24
}

/// The plain app ground behind every tab.
struct AppBackground: View {
    var body: some View {
        Color.appBackground.ignoresSafeArea()
    }
}

/// R01's carbon weave: two crossing sets of 2pt diagonal stripes, faint
/// enough that text over it reads exactly as on a flat card.
struct CarbonTexture: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let dark = colorScheme == .dark
        let rising = Color(white: dark ? 1 : 0, opacity: dark ? 0.025 : 0.018)
        let falling = Color(white: 0, opacity: dark ? 0.25 : 0.03)
        Canvas { context, size in
            let step: CGFloat = 4
            var up = Path(), down = Path()
            var offset: CGFloat = -size.height
            while offset <= size.width + size.height {
                up.move(to: CGPoint(x: offset, y: size.height))
                up.addLine(to: CGPoint(x: offset + size.height, y: 0))
                down.move(to: CGPoint(x: offset, y: 0))
                down.addLine(to: CGPoint(x: offset + size.height, y: size.height))
                offset += step
            }
            context.stroke(up, with: .color(rising), lineWidth: 2)
            context.stroke(down, with: .color(falling), lineWidth: 2)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The italic, slanted parallelogram of the logo — used for 出庫/帰庫 and
/// other primary actions. `slant` is the horizontal offset of each side.
struct SlantedRectangle: Shape {
    var slant: CGFloat = 12

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX + slant, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - slant, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
