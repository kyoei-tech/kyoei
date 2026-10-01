import KyoeiCore
import SwiftUI

// Building blocks of the ホーム screens. Ports of live-clock.tsx,
// format-toggle.tsx, status-display.tsx and shift-timer.tsx.

/// ホーム must fit on one screen without scrolling. `FitHomePage` first lays
/// the cards out at their regular size; if that doesn't fit the space between
/// the header and the tab bar it switches every card to its compact size
/// (`homeCompact`), and only if even that doesn't fit (e.g. the largest font
/// setting) does it fall back to scrolling.
struct HomeCompactKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var homeCompact: Bool {
        get { self[HomeCompactKey.self] }
        set { self[HomeCompactKey.self] = newValue }
    }
}

/// Hands `homeCompact` to code that builds views from a parent's helpers.
struct CompactReader<Content: View>: View {
    @ViewBuilder var content: (Bool) -> Content
    @Environment(\.homeCompact) private var compact

    var body: some View { content(compact) }
}

struct FitHomePage<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ViewThatFits(in: .vertical) {
            column(compact: false)
            column(compact: true)
            ScrollView { column(compact: true) }
        }
    }

    private func column(compact: Bool) -> some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 12) { content }
            .environment(\.homeCompact, compact)
            .padding(.horizontal, 16)
            .padding(.vertical, compact ? 10 : 16)
            .frame(maxWidth: 448)
            .frame(maxWidth: .infinity)
    }
}

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

    @Environment(\.homeCompact) private var compact

    var body: some View {
        VStack(spacing: compact ? 0 : 2) {
            DateLine(parts: parts)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if !parts.meridiem.isEmpty {
                    Text(parts.meridiem).appFont(18, weight: .medium).foregroundStyle(Color.mutedForeground)
                }
                Text(parts.time).timerFont(compact ? 40 : 48, weight: .semibold).foregroundStyle(Color.appForeground)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.vertical, compact ? 8 : 12)
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
/// Compact: label and date on the left, the time on the right, in one row.
struct LinkedTimeCard: View {
    let label: String
    let parts: ClockParts
    let active: Bool
    let hour12: Bool
    let onToggleFormat: () -> Void

    @Environment(\.homeCompact) private var compact

    var body: some View {
        Group {
            if compact {
                HStack(alignment: .center, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label)
                            .appFont(14, weight: .bold)
                            .foregroundStyle(active ? Color.primary : Color.mutedForeground)
                        DateLine(parts: parts)
                    }
                    Spacer(minLength: 4)
                    time(size: 32)
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(label)
                            .appFont(16, weight: .bold)
                            .foregroundStyle(active ? Color.primary : Color.mutedForeground)
                        Spacer()
                        FormatToggle(hour12: hour12, onToggle: onToggleFormat)
                    }
                    DateLine(parts: parts)
                    time(size: 36).frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.horizontal, compact ? 16 : 20)
        .padding(.vertical, compact ? 8 : 12)
        .card(radius: Radius.card, border: active ? Color.primary.opacity(0.4) : .border)
    }

    private func time(size: CGFloat) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            if !parts.meridiem.isEmpty {
                Text(parts.meridiem).appFont(14, weight: .medium).foregroundStyle(Color.mutedForeground)
            }
            Text(parts.time).timerFont(size, weight: .semibold)
                .foregroundStyle(active ? Color.primary : Color.appForeground)
        }
    }
}

/// "HH:MM" large with ":SS" smaller, as on the web timers.
struct SplitTimerText: View {
    let text: String
    let color: Color

    @Environment(\.homeCompact) private var compact

    var body: some View {
        let parts = text.split(separator: ":").map(String.init)
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text("\(parts[safe: 0] ?? "00"):\(parts[safe: 1] ?? "00")").timerFont(compact ? 50 : 60)
            Text(":\(parts[safe: 2] ?? "00")").timerFont(compact ? 26 : 30)
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
