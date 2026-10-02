import SwiftUI

/// Stand-in for screens not yet ported, labelled with the migration phase
/// that will replace it (see ios/README.md).
struct ComingSoonView: View {
    let title: String
    let phase: Int

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "hammer")
                .font(.system(size: 28))
                .foregroundStyle(Color.mutedForeground)
            Text(title)
                .appFont(18, weight: .bold)
                .foregroundStyle(Color.appForeground)
            Text("iOS版はフェーズ\(phase)で実装予定です")
                .appFont(14)
                .foregroundStyle(Color.mutedForeground)
        }
        .frame(maxWidth: .infinity, minHeight: 240)
        .padding(24)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card))
        .overlay(RoundedRectangle(cornerRadius: Radius.card).stroke(Color.border))
    }
}
