import SwiftUI
#if canImport(UIKit)
import UIKit
#else
import AppKit
#endif

// Design tokens converted from app/globals.css (oklch → sRGB). Each color
// resolves per light/dark appearance, and the appearance itself is driven by
// Settings' 背景色 via `.preferredColorScheme` (see KyoeiApp).

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

    /// Logo green used by the tab bar, status band and 出庫/分割休息 button.
    static let brandLime = Color(light: 0x4BC957, dark: 0x40A449)
    static let appBackground = Color(light: 0xFBFCFD, dark: 0x07090D)
    static let appForeground = Color(light: 0x151B24, dark: 0xF3F5F8)
    static let card = Color(light: 0xFEFEFF, dark: 0x10141A)
    static let primary = Color(light: 0x008F17, dark: 0x5AD664)
    static let primaryForeground = Color(light: 0xF8FEF8, dark: 0x031203)
    /// Amber; also the 休息中/帰庫済み "resting" accent.
    static let secondary = Color(light: 0xC37000, dark: 0xFCAA2B)
    static let secondaryForeground = Color(light: 0xFFFBF5, dark: 0x1F1306)
    static let muted = Color(light: 0xEBEFF4, dark: 0x1B1F27)
    static let mutedForeground = Color(light: 0x525864, dark: 0x9199A5)
    static let accent = Color(light: 0xEBEFF4, dark: 0x1B1F27)
    static let destructive = Color(light: 0xCC272E, dark: 0xEA3C3F)
    static let destructiveForeground = Color(light: 0xFFFAFA, dark: 0xFFFAFA)
    static let border = Color(light: 0x000000, dark: 0xFFFFFF, lightAlpha: 0.10, darkAlpha: 0.10)
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

/// Soft brand-green radial wash behind the UI, matching the web body background.
struct AppBackground: View {
    var body: some View {
        ZStack {
            Color.appBackground
            RadialGradient(
                colors: [Color.brandLime.opacity(0.16), .clear],
                center: .top,
                startRadius: 0,
                endRadius: 520
            )
        }
        .ignoresSafeArea()
    }
}
