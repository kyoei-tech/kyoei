import KyoeiCore
import SwiftUI

// Building blocks of the ホーム screens. Ports of live-clock.tsx,
// format-toggle.tsx, status-display.tsx and shift-timer.tsx.

/// Re-renders its content once per second, aligned to the wall clock.
struct EverySecond<Content: View>: View {
    @ViewBuilder var content: (Date) -> Content

    var body: some View {
        TimelineView(.periodic(from: Date(timeIntervalSince1970: Date().timeIntervalSince1970.rounded(.down)), by: 1)) { context in
            content(context.date)
        }
    }
}

struct FormatToggle: View {
    let hour12: Bool
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            Label(hour12 ? "午前/午後" : "24時間", systemImage: "clock")
                .appFont(12, weight: .medium)
                .foregroundStyle(Color.mutedForeground)
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Color.muted, in: Capsule())
                .overlay(Capsule().stroke(Color.border))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("時刻表記を切り替え")
    }
}

/// Large "now" clock at the top of ホーム.
struct LiveClockCard: View {
    let parts: ClockParts
    let hour12: Bool
    let onToggleFormat: () -> Void

    var body: some View {
        VStack(spacing: 2) {
            DateLine(parts: parts)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if !parts.meridiem.isEmpty {
                    Text(parts.meridiem).appFont(18, weight: .medium).foregroundStyle(Color.mutedForeground)
                }
                Text(parts.time).timerFont(48, weight: .semibold).foregroundStyle(Color.appForeground)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .overlay(alignment: .topTrailing) {
            FormatToggle(hour12: hour12, onToggle: onToggleFormat).padding(12)
        }
        .card(radius: Radius.card)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("現在時刻")
    }
}

struct DateLine: View {
    let parts: ClockParts

    var body: some View {
        (Text(parts.date).foregroundStyle(Color.mutedForeground) + Text("  " + parts.weekday).foregroundStyle(Color.appForeground))
            .appFont(14, weight: .medium)
    }
}

/// Second clock linked to the shift: 出庫時刻 / 出庫可能時刻 / 出勤時刻.
struct LinkedTimeCard: View {
    let label: String
    let parts: ClockParts
    let active: Bool
    let hour12: Bool
    let onToggleFormat: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(label)
                    .appFont(16, weight: .bold)
                    .foregroundStyle(active ? Color.primary : Color.mutedForeground)
                Spacer()
                FormatToggle(hour12: hour12, onToggle: onToggleFormat)
            }
            DateLine(parts: parts)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                if !parts.meridiem.isEmpty {
                    Text(parts.meridiem).appFont(14, weight: .medium).foregroundStyle(Color.mutedForeground)
                }
                Text(parts.time).timerFont(36, weight: .semibold)
                    .foregroundStyle(active ? Color.primary : Color.appForeground)
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .card(radius: Radius.card, border: active ? Color.primary.opacity(0.4) : .border)
    }
}

/// "HH:MM" large with ":SS" smaller, as on the web timers.
struct SplitTimerText: View {
    let text: String
    let color: Color

    var body: some View {
        let parts = text.split(separator: ":").map(String.init)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("\(parts[safe: 0] ?? "00"):\(parts[safe: 1] ?? "00")").timerFont(60)
            Text(":\(parts[safe: 2] ?? "00")").timerFont(30)
        }
        .foregroundStyle(color)
    }
}

struct CountdownPicker: View {
    static let options = [3, 9, 33]
    let selected: Int
    let onSelect: (Int) -> Void

    var body: some View {
        HStack(spacing: 10) {
            ForEach(Self.options, id: \.self) { hours in
                Button("\(hours)時間") { onSelect(hours) }
                    .buttonStyle(ChipButtonStyle(selected: hours == selected))
                    .accessibilityAddTraits(hours == selected ? .isSelected : [])
            }
        }
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
