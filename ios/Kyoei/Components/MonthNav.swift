import KyoeiCore
import SwiftUI

/// "< 2026年9月 >" header shared by every month calendar. Port of
/// components/month-nav.tsx.
struct MonthNav: View {
    @Binding var month: YearMonth

    var body: some View {
        HStack {
            arrow("chevron.left", label: "前の月") { month = month.adding(months: -1) }
            Spacer()
            Text(month.label)
                .appFont(16, weight: .bold)
                .foregroundStyle(Color.appForeground)
            Spacer()
            arrow("chevron.right", label: "次の月") { month = month.adding(months: 1) }
        }
    }

    private func arrow(_ systemName: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.mutedForeground)
                .frame(width: 32, height: 32)
                .overlay(Circle().stroke(Color.border))
        }
        .accessibilityLabel(label)
    }
}

extension View {
    /// Horizontal swipe changes the month; mostly-vertical drags (scrolling)
    /// are ignored. Port of useMonthSwipe.
    func monthSwipe(_ month: Binding<YearMonth>) -> some View {
        simultaneousGesture(
            DragGesture(minimumDistance: 30).onEnded { value in
                let dx = value.translation.width
                let dy = value.translation.height
                guard abs(dx) >= 50, abs(dx) >= abs(dy) * 1.5 else { return }
                month.wrappedValue = month.wrappedValue.adding(months: dx > 0 ? -1 : 1)
            }
        )
    }
}
