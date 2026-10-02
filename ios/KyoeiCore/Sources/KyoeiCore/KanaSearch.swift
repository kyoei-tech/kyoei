import Foundation

// Lets a search query typed in hiragana also match katakana or kanji text
// (e.g. "とうきょう" finds "東京" or "トウキョウ"). Port of lib/search/kana.ts
// + use-kana-search.ts. The web app needed kuromoji plus a 12-file
// dictionary for kanji readings; on Apple platforms CFStringTokenizer's
// Latin transcription provides readings out of the box.

private let hiraganaRange: ClosedRange<UInt32> = 0x3041...0x3096
private let kanaOffset: UInt32 = 0x60

private func mapScalars(_ input: String, _ transform: (UInt32) -> UInt32) -> String {
    var scalars = String.UnicodeScalarView()
    for scalar in input.unicodeScalars {
        scalars.append(Unicode.Scalar(transform(scalar.value)) ?? scalar)
    }
    return String(scalars)
}

public func hiraganaToKatakana(_ input: String) -> String {
    mapScalars(input) { hiraganaRange.contains($0) ? $0 + kanaOffset : $0 }
}

public func katakanaToHiragana(_ input: String) -> String {
    mapScalars(input) { (hiraganaRange.lowerBound + kanaOffset...hiraganaRange.upperBound + kanaOffset).contains($0) ? $0 - kanaOffset : $0 }
}

/// True if every character is hiragana, katakana, or the long-vowel mark 'ー'.
public func isKanaOnly(_ input: String) -> Bool {
    guard !input.isEmpty else { return false }
    return input.unicodeScalars.allSatisfy {
        (hiraganaRange.lowerBound...hiraganaRange.upperBound + kanaOffset).contains($0.value) || $0 == "ー"
    }
}

public final class KanaSearch: @unchecked Sendable {
    public static let shared = KanaSearch()

    private let lock = NSLock()
    // Readings are expensive to compute, so they're cached by source text and
    // shared across every search box in the app.
    private var readingCache: [String: String] = [:]

    public init() {}

    /// Hiragana reading of `text`. Kana-only tokens keep their own spelling
    /// (the Latin round-trip would turn "サービス" into "さあびす").
    public func reading(of text: String) -> String {
        lock.lock()
        if let cached = readingCache[text] {
            lock.unlock()
            return cached
        }
        lock.unlock()

        let cf = text as CFString
        let tokenizer = CFStringTokenizerCreate(
            nil, cf, CFRangeMake(0, CFStringGetLength(cf)),
            kCFStringTokenizerUnitWordBoundary, Locale(identifier: "ja") as CFLocale
        )
        var result = ""
        while CFStringTokenizerAdvanceToNextToken(tokenizer) != [] {
            let range = CFStringTokenizerGetCurrentTokenRange(tokenizer)
            let surface = (text as NSString).substring(with: NSRange(location: range.location, length: range.length))
            if isKanaOnly(surface) {
                result += katakanaToHiragana(surface)
            } else if let latin = CFStringTokenizerCopyCurrentTokenAttribute(
                tokenizer, kCFStringTokenizerAttributeLatinTranscription
            ) as? String {
                result += latin.applyingTransform(.latinToHiragana, reverse: false) ?? surface
            } else {
                result += surface
            }
        }

        lock.lock()
        readingCache[text] = result
        lock.unlock()
        return result
    }

    public func matches(_ text: String?, query rawQuery: String) -> Bool {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if query.isEmpty { return true }
        let haystack = (text ?? "").lowercased()
        if haystack.isEmpty { return false }
        if haystack.contains(query) { return true }

        let queryHiragana = katakanaToHiragana(query)
        if haystack.contains(queryHiragana) || haystack.contains(hiraganaToKatakana(query)) {
            return true
        }
        return reading(of: text ?? "").contains(queryHiragana)
    }
}
