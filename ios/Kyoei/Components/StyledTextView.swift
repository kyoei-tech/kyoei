import KyoeiCore
import SwiftUI

/// Renders the **bold** / ;;red;; / ::orange:: / ##green## markup used by
/// notifications and the editable 誤タップ防止 messages. Port of
/// components/styled-notification-text.tsx.
struct StyledTextView: View {
    let raw: String

    var body: some View {
        Text(Self.attributed(raw))
    }

    static func attributed(_ raw: String) -> AttributedString {
        StyledText.parse(raw).reduce(into: AttributedString()) { result, segment in
            var piece = AttributedString(segment.text)
            if segment.bold {
                piece.inlinePresentationIntent = .stronglyEmphasized
            }
            switch segment.color {
            case .default: break
            case .red: piece.foregroundColor = .red
            case .orange: piece.foregroundColor = .orange
            case .green: piece.foregroundColor = .green
            }
            result += piece
        }
    }
}
