import SwiftUI

/// Full-screen "誤タップ防止" confirmation shown before a status change
/// (出庫/帰庫/出勤/退勤). Port of components/confirm-action-modal.tsx.
/// `message` may contain styled-text markup and line breaks.
struct ConfirmActionDialog<Body: View>: View {
    let message: String
    var confirmLabel = "開始する"
    /// nil hides the cancel button (acknowledgement-only dialog).
    var cancelLabel: String? = "キャンセル"
    let onConfirm: () -> Void
    var onCancel: () -> Void = {}
    @ViewBuilder var extra: Body

    // Guards against a fast double-tap firing the status change twice.
    @State private var fired = false

    var body: some View {
        ModalCard {
            ModalIcon(systemName: "exclamationmark.triangle.fill")
            StyledTextView(raw: message)
                .appFont(16, weight: .bold)
                .foregroundStyle(Color.appForeground)
                .multilineTextAlignment(.center)
            extra.padding(.top, 12)
            HStack(spacing: 8) {
                if let cancelLabel {
                    Button(cancelLabel) { fire(onCancel) }
                        .buttonStyle(PillButtonStyle(kind: .outline))
                }
                Button(confirmLabel) { fire(onConfirm) }
                    .buttonStyle(PillButtonStyle())
            }
            .padding(.top, 20)
        }
    }

    private func fire(_ action: () -> Void) {
        guard !fired else { return }
        fired = true
        action()
    }
}

extension ConfirmActionDialog where Body == EmptyView {
    init(
        message: String,
        confirmLabel: String = "開始する",
        cancelLabel: String? = "キャンセル",
        onConfirm: @escaping () -> Void,
        onCancel: @escaping () -> Void = {}
    ) {
        self.init(message: message, confirmLabel: confirmLabel, cancelLabel: cancelLabel,
                  onConfirm: onConfirm, onCancel: onCancel) { EmptyView() }
    }
}

/// Inline "are you sure?" panel shown after a delete action is tapped.
struct ConfirmDeleteInline: View {
    var message = "本当に削除しますか？"
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message)
                .appFont(14, weight: .medium)
                .foregroundStyle(Color.appForeground)
            HStack(spacing: 8) {
                Button("削除する", action: onConfirm)
                    .buttonStyle(PillButtonStyle(kind: .destructive))
                    .fixedSize()
                Button("キャンセル", action: onCancel)
                    .buttonStyle(PillButtonStyle(kind: .outline))
                    .fixedSize()
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.destructive.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.destructive.opacity(0.4)))
    }
}
