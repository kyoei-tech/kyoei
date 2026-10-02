import Foundation

/// Build-time configuration, injected from Config/Secrets.xcconfig through
/// Info.plist (see project.yml). Missing values crash at launch on purpose:
/// a build without a backend is never useful.
enum AppConfig {
    static let supabaseURL = url(for: "SUPABASE_URL")
    static let supabaseAnonKey = string(for: "SUPABASE_ANON_KEY")

    private static func string(for key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty else {
            fatalError("Missing \(key) in Info.plist — copy Config/Secrets.example.xcconfig to Config/Secrets.xcconfig")
        }
        return value
    }

    private static func url(for key: String) -> URL {
        guard let url = URL(string: string(for: key)) else {
            fatalError("\(key) is not a valid URL")
        }
        return url
    }
}
