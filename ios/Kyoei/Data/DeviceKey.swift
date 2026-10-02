import CryptoKit
import Foundation
import LocalAuthentication
import Security

/// This iPhone's key for approving admin console sign-ins.
///
/// A P-256 key created in the Secure Enclave (it can never leave the chip)
/// with `.userPresence`: every signature needs Face ID (or the passcode). Its
/// public key is registered with the account only while redeeming an admin's
/// one-time setup/reset code, so possession of this iPhone plus Face ID is
/// the second factor. Without a Secure Enclave (the Simulator) a software key
/// in the Keychain stands in, gated by the same Face ID/passcode prompt.
enum DeviceKey {
    private static let service = "jp.kyoei.app.admin-approval-key"

    enum KeyError: Error { case missing, unavailable }

    /// Creates a new key, replacing any previous one, and returns its public
    /// key (X9.63 uncompressed, base64) for registration.
    static func createNew() throws -> String {
        deleteStored()
        if SecureEnclave.isAvailable {
            var error: Unmanaged<CFError>?
            guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly, [.privateKeyUsage, .userPresence], &error) else {
                throw KeyError.unavailable
            }
            let key = try SecureEnclave.P256.Signing.PrivateKey(accessControl: access)
            try store(Data("se:".utf8) + key.dataRepresentation)
            return key.publicKey.x963Representation.base64EncodedString()
        }
        let key = P256.Signing.PrivateKey()
        try store(Data("sw:".utf8) + key.rawRepresentation)
        return key.publicKey.x963Representation.base64EncodedString()
    }

    static var exists: Bool { (try? load()) != nil }

    /// Signs with Face ID / passcode. Returns the raw r||s signature, base64.
    static func sign(_ message: String, reason: String) async throws -> String {
        let blob = try load()
        let context = LAContext()
        context.localizedReason = reason
        let payload = Data(message.utf8)
        if blob.starts(with: Data("se:".utf8)) {
            let key = try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: blob.dropFirst(3), authenticationContext: context)
            return try key.signature(for: payload).rawRepresentation.base64EncodedString()
        }
        // Software key: ask for Face ID / passcode explicitly.
        guard try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) else { throw KeyError.unavailable }
        let key = try P256.Signing.PrivateKey(rawRepresentation: blob.dropFirst(3))
        return try key.signature(for: payload).rawRepresentation.base64EncodedString()
    }

    // MARK: Keychain (this device only, never backed up)

    private static func store(_ data: Data) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "key",
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecValueData as String: data,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeyError.unavailable }
    }

    private static func load() throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "key",
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { throw KeyError.missing }
        return data
    }

    private static func deleteStored() {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
    }
}
