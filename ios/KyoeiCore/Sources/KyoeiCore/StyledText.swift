import Foundation

// Rich-text markup used inside push-notification titles/messages and the
// editable 誤タップ防止 confirmations. Port of lib/notifications/notification-style.ts.
//
//   **text**   -> bold
//   ;;text;;   -> red
//   ::text::   -> orange
//   ##text##   -> green
// Markers may nest in any order, e.g. **;;3時間;;** renders bold+red.

public enum StyledColor: String, Sendable {
    case `default`, red, orange, green
}

public struct StyledSegment: Equatable, Sendable {
    public var text: String
    public var bold: Bool
    public var color: StyledColor

    public init(text: String, bold: Bool = false, color: StyledColor = .default) {
        self.text = text
        self.bold = bold
        self.color = color
    }
}

public enum StyledText {
    private static let markers: [(token: [Character], apply: @Sendable (inout StyledSegment) -> Void)] = [
        (Array("**"), { $0.bold = true }),
        (Array(";;"), { $0.color = .red }),
        (Array("::"), { $0.color = .orange }),
        (Array("##"), { $0.color = .green }),
    ]

    public static let markupHelp =
        "**太字**\u{3000};;赤字;;\u{3000}::オレンジ文字::\u{3000}##緑文字##（組み合わせ可: **;;赤字の太字;;**）\u{3000}改行もそのまま反映されます"

    /// Unmatched/unterminated markers are treated as literal text so partially
    /// typed input never breaks the editor preview.
    public static func parse(_ raw: String) -> [StyledSegment] {
        parse(Array(raw))
    }

    private static func parse(_ chars: [Character]) -> [StyledSegment] {
        var segments: [StyledSegment] = []
        var active = ""
        var cursor = 0

        func starts(_ token: [Character], at index: Int) -> Bool {
            index + token.count <= chars.count && Array(chars[index..<index + token.count]) == token
        }

        func flush() {
            if !active.isEmpty { segments.append(StyledSegment(text: active)) }
            active = ""
        }

        while cursor < chars.count {
            if let marker = markers.first(where: { starts($0.token, at: cursor) }) {
                let innerStart = cursor + marker.token.count
                var close = innerStart
                while close < chars.count, !starts(marker.token, at: close) { close += 1 }
                if close < chars.count {
                    flush()
                    for var segment in parse(Array(chars[innerStart..<close])) {
                        marker.apply(&segment)
                        segments.append(segment)
                    }
                    cursor = close + marker.token.count
                    continue
                }
            }
            active.append(chars[cursor])
            cursor += 1
        }
        flush()
        return segments
    }

    /// Strips every style marker, leaving plain text for OS notifications.
    public static func plain(_ raw: String) -> String {
        raw.replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: ";;", with: "")
            .replacingOccurrences(of: "::", with: "")
            .replacingOccurrences(of: "##", with: "")
    }
}
