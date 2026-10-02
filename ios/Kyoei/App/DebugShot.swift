#if DEBUG
import Foundation

/// Simulator screenshots for the 機能説明書 (DEBUG builds only, never shipped):
///   -KyoeiShot <screen>        open that screen, e.g. "news-detail",
///                              "menu:lol", "mypage:inspection/step"
///   -KyoeiDebugLoginID <id>    sign in with this demo account
///   -KyoeiDebugPassword <pw>
enum DebugShot {
    static var name: String { UserDefaults.standard.string(forKey: "KyoeiShot") ?? "" }

    /// "mypage:inspection/step" → "mypage:inspection"
    static var screen: String { name.split(separator: "/").first.map(String.init) ?? "" }
    /// "mypage:inspection/step" → "step"
    static var sub: String { name.split(separator: "/").dropFirst().first.map(String.init) ?? "" }

    /// The part after "mypage:" / "menu:".
    static func item(after prefix: String) -> String? {
        screen.hasPrefix(prefix) ? String(screen.dropFirst(prefix.count)) : nil
    }

    static var loginID: String? { UserDefaults.standard.string(forKey: "KyoeiDebugLoginID") }
    static var password: String? { UserDefaults.standard.string(forKey: "KyoeiDebugPassword") }
}
#endif
