import Foundation

// メニュー tab entries. Port of components/menu-view.tsx's MENU_ITEMS /
// TEST_DRIVE_MENU_ITEMS and their visibility rules.

public enum MenuItem: String, CaseIterable, Hashable, Sendable {
    case mypage
    case lolmap, lol, aa, cars, accidents
    case tripHistory = "trip-history"
    case emergency, notes, terms, qa, settings

    public var label: String {
        switch self {
        case .mypage: "マイページ"
        case .lolmap: "List of Location MAP"
        case .lol: "List of Location"
        case .aa: "オークション情報"
        case .cars: "高額車一覧"
        case .accidents: "無事故カレンダー"
        case .tripHistory: "運行履歴"
        case .emergency: "緊急連絡先"
        case .notes: "初心者ノート"
        case .terms: "ドライバー語録"
        case .qa: "Q&A"
        case .settings: "設定"
        }
    }

    public var summary: String {
        switch self {
        case .mypage: "名前・入社年月日・勤続年数を確認できます。"
        case .lolmap: "各ボタンを押すとGoogleマップを開きます。"
        case .lol: "配達先情報の一覧を確認できます。"
        case .aa: "オークションの開催日・搬出期限を確認できます。"
        case .cars: "該当車両は中継の際、本郷へ。"
        case .accidents: "目指せ無事故！"
        case .tripHistory: "過去の出庫・帰庫と休息時間を確認できます。"
        case .emergency: "緊急時に連絡する連絡先一覧です。"
        case .notes: "新人向けのメモや手順の確認ができます。"
        case .terms: "業界用語、隠語を調べられるおもしろ辞典📖"
        case .qa: "匿名で質問・回答できます。"
        case .settings: "フォントサイズや背景色を変更できます。"
        }
    }

    /// Shown in their own highlighted group only while 試験運転モード is on.
    public static let testDriveItems: [MenuItem] = [.mypage]

    /// Regular entries, in display order. LoL is hidden for part-time staff;
    /// 運行履歴 is dropped while 試験運転モード is on because マイページ hosts it.
    public static func regularItems(partTimeMode: Bool, testDriveMode: Bool) -> [MenuItem] {
        let all: [MenuItem] = [.lolmap, .lol, .aa, .cars, .accidents, .tripHistory, .emergency, .notes, .terms, .qa, .settings]
        return all.filter { item in
            if partTimeMode && item == .lol { return false }
            if testDriveMode && item == .tripHistory { return false }
            return true
        }
    }
}
