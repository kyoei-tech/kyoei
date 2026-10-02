import Foundation

/// How the 車台番号 was entered: read from a photo, or spoken (for a rusted
/// stamping with no caution plate).
public enum ChassisInput: String, Codable, Sendable {
    case camera, voice
}

/// Turns a spoken 車台番号 (speech recognition, Japanese) into the written
/// form: letter names (ゼット・ブイ・ダブリュー) → letters, number words and
/// kanji numerals → digits, ハイフン/ダッシュ/の → "-". The driver checks the
/// result on screen before it is matched.
public enum SpokenChassis {
    /// Longest names first so ダブリュー wins over ダブル, エイチ over エー, etc.
    private static let words: [(String, String)] = [
        ("ダブリュー", "W"), ("ダブリュ", "W"), ("ダブル", "W"),
        ("エックス", "X"), ("エッチ", "H"), ("エイチ", "H"), ("ジェイ", "J"), ("ジェー", "J"),
        ("ディー", "D"), ("デー", "D"), ("ティー", "T"), ("テー", "T"), ("キュー", "Q"),
        ("ヴィー", "V"), ("ブイ", "V"), ("ビー", "B"), ("シー", "C"), ("ジー", "G"),
        ("エフ", "F"), ("エル", "L"), ("エム", "M"), ("エヌ", "N"), ("エス", "S"),
        ("アール", "R"), ("ゼット", "Z"), ("ズィー", "Z"), ("ワイ", "Y"), ("ユー", "U"),
        ("ピー", "P"), ("ケー", "K"), ("ケイ", "K"), ("アイ", "I"), ("オー", "O"),
        ("エー", "A"), ("エイ", "A"), ("イー", "E"),
        ("ハイフン", "-"), ("ダッシュ", "-"), ("バー", "-"), ("マイナス", "-"),
        ("ゼロ", "0"), ("レイ", "0"), ("マル", "0"),
        ("イチ", "1"), ("ワン", "1"), ("ツー", "2"), ("サン", "3"), ("スリー", "3"),
        ("ヨン", "4"), ("フォー", "4"), ("ファイブ", "5"), ("ロク", "6"), ("シックス", "6"),
        ("ナナ", "7"), ("シチ", "7"), ("セブン", "7"), ("ハチ", "8"), ("エイト", "8"),
        ("キュウ", "9"), ("ナイン", "9"), ("ニ", "2"), ("ゴ", "5"), ("ク", "9"), ("シ", "4"),
        ("ノ", "-"),
    ]

    private static let kanjiDigits: [Character: Int] = ["〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9]
    private static let kanjiUnits: [Character: Int] = ["十": 10, "百": 100, "千": 1000]

    public static func normalize(_ spoken: String) -> String {
        // Full-width → half-width, hiragana → katakana, upper case.
        var text = spoken.precomposedStringWithCompatibilityMapping
        text = text.applyingTransform(.hiraganaToKatakana, reverse: false) ?? text
        text = convertKanjiNumbers(text).uppercased()
        var result = ""
        var index = text.startIndex
        outer: while index < text.endIndex {
            let rest = text[index...]
            for (word, value) in words where rest.hasPrefix(word) {
                result += value
                index = text.index(index, offsetBy: word.count)
                continue outer
            }
            let character = text[index]
            if character.isASCII, character.isLetter || character.isNumber {
                result.append(character)
            } else if "-‐‑‒–—―−ー".contains(character) {
                result.append("-")
            }
            index = text.index(after: index)
        }
        return ChassisNumber.normalize(result)
    }

    /// 「三十」→30, 「千二百三十四」→1234, 「一二三」→123.
    private static func convertKanjiNumbers(_ text: String) -> String {
        var output = ""
        var run = ""
        func flush() {
            guard !run.isEmpty else { return }
            if run.contains(where: { kanjiUnits[$0] != nil }) {
                var total = 0
                var digit = 0
                for character in run {
                    if let value = kanjiDigits[character] {
                        digit = value
                    } else if let unit = kanjiUnits[character] {
                        total += (digit == 0 ? 1 : digit) * unit
                        digit = 0
                    }
                }
                output += String(total + digit)
            } else {
                output += run.compactMap { kanjiDigits[$0].map(String.init) }.joined()
            }
            run = ""
        }
        for character in text {
            if kanjiDigits[character] != nil || kanjiUnits[character] != nil {
                run.append(character)
            } else {
                flush()
                output.append(character)
            }
        }
        flush()
        return output
    }
}
