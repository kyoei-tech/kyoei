import SwiftUI

// Per-tab font scaling (設定 > フォントサイズ). The web app rescaled the
// document's rem base whenever the tab changed; here the shell injects the
// active tab's scale into the environment and every text uses `.appFont`.

// Classic EnvironmentKeys rather than @Entry so the sources also typecheck
// with the Command Line Tools, which don't ship the SwiftUI macro plugin.
private struct FontScaleKey: EnvironmentKey {
    static let defaultValue: CGFloat = 1
}

private struct FollowsDeviceFontKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    /// Multiplier from the active tab's font level (1.0–1.5).
    var fontScale: CGFloat {
        get { self[FontScaleKey.self] }
        set { self[FontScaleKey.self] = newValue }
    }

    /// When true, text follows the device's Dynamic Type size instead of `fontScale`.
    var followsDeviceFont: Bool {
        get { self[FollowsDeviceFontKey.self] }
        set { self[FollowsDeviceFontKey.self] = newValue }
    }
}

private struct AppFontModifier: ViewModifier {
    let size: CGFloat
    let weight: Font.Weight
    let design: Font.Design

    @Environment(\.fontScale) private var fontScale
    @Environment(\.followsDeviceFont) private var followsDeviceFont
    @ScaledMetric(relativeTo: .body) private var dynamicTypeFactor: CGFloat = 1

    func body(content: Content) -> some View {
        let factor = followsDeviceFont ? dynamicTypeFactor : fontScale
        content.font(.system(size: size * factor, weight: weight, design: design))
    }
}

extension View {
    /// Point sizes mirror Tailwind's scale at a 16pt base: xs 12, sm 14,
    /// base 16, lg 18, xl 20, 2xl 24, 3xl 30, 4xl 36, 5xl 48.
    func appFont(_ size: CGFloat, weight: Font.Weight = .regular, design: Font.Design = .default) -> some View {
        modifier(AppFontModifier(size: size, weight: weight, design: design))
    }
}
