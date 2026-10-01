import SwiftUI

/// Shared 戻る button for sub-pages. Port of components/back-header.tsx.
///  - primary: bold filled pill to leave a top-level sub-page.
///  - subtle: bordered pill to step back one level within a feature.
///  - icon: small circular button paired with inline `trailing` content.
struct BackHeader<Trailing: View>: View {
    enum Variant { case primary, subtle, icon }

    var label = "戻る"
    var variant: Variant = .primary
    let onBack: () -> Void
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 8) {
            button
            trailing.frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, 4)
        .padding(.bottom, 8)
    }

    @ViewBuilder private var button: some View {
        switch variant {
        case .icon:
            Button(action: onBack) {
                Image(systemName: "arrow.left")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color.appForeground)
                    .frame(width: 36, height: 36)
                    .background(Color.card, in: Circle())
                    .overlay(Circle().stroke(Color.border))
            }
            .accessibilityLabel(label)
        case .subtle:
            Button(action: onBack) {
                Label(label, systemImage: "arrow.left")
                    .appFont(14, weight: .medium)
                    .foregroundStyle(Color.mutedForeground)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.card, in: Capsule())
                    .overlay(Capsule().stroke(Color.border))
            }
        case .primary:
            Button(action: onBack) {
                Label(label, systemImage: "arrow.left")
                    .appFont(14, weight: .bold)
                    .foregroundStyle(Color.primaryForeground)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.primary, in: Capsule())
                    .shadow(color: .black.opacity(0.1), radius: 1, y: 1)
            }
        }
    }
}

extension BackHeader where Trailing == EmptyView {
    init(label: String = "戻る", variant: Variant = .primary, onBack: @escaping () -> Void) {
        self.init(label: label, variant: variant, onBack: onBack) { EmptyView() }
    }
}
