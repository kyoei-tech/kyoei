import Foundation
import Security

/// A random per-device identifier scoping this device's own rows
/// (trip_history, attendance_day_overrides, ...). Port of lib/device-id.ts,
/// but kept in the Keychain rather than app storage so it survives an app
/// reinstall — otherwise a reinstall would orphan the driver's 運行履歴.
enum DeviceID {
    private static let service = "jp.kyoei.device-id"
    private static let account = "device-id"

    static let current: String = load() ?? create()

    private static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func create() -> String {
        let id = UUID().uuidString.lowercased()
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
            kSecValueData as String: Data(id.utf8),
        ]
        SecItemAdd(attributes as CFDictionary, nil)
        return id
    }
}
