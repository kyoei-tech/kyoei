import SwiftUI

/// The app's single in-app notification surface: every notification shows as
/// a blocking modal that must be dismissed with "了解しました。", one at a time.
/// Port of components/pending-notification-modal.tsx.
struct PendingNotificationOverlay: View {
    @Environment(PendingNotificationStore.self) private var store

    var body: some View {
        if let current = store.current {
            ModalCard(maxWidth: 384, dimming: 0.6) {
                Image(systemName: "bell.badge.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Color.primary)
                    .frame(width: 48, height: 48)
                    .background(Color.primary.opacity(0.15), in: Circle())
                StyledTextView(raw: current.title)
                    .appFont(16, weight: .bold)
                    .foregroundStyle(Color.appForeground)
                    .multilineTextAlignment(.center)
                    .padding(.top, 12)
                StyledTextView(raw: current.message)
                    .appFont(14)
                    .foregroundStyle(Color.appForeground)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.top, 12)
                Button("了解しました。") { store.dismiss(current.id) }
                    .buttonStyle(PillButtonStyle())
                    .padding(.top, 20)
            }
            .id(current.id)
        }
    }
}
