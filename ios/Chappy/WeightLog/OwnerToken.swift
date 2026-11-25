import Foundation
import Security

/// The Weight Log's bearer token (`WEIGHT_LOG_APP_TOKEN` on the site), kept
/// in the Keychain. It arrives once: pasted on the Weight tab, or copied
/// into the app's Documents as `owner-token` with `devicectl`, which the
/// app moves into the Keychain at launch and deletes.
enum OwnerToken {
    private static let service = "com.chappyasel.site.owner"
    private static let account = "weight-log-app-token"

    static var value: String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static var isSet: Bool { value != nil }

    @discardableResult
    static func save(_ token: String) -> Bool {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 32, let data = trimmed.data(using: .utf8) else { return false }
        clear()
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            // Readable once the phone has been unlocked since boot, so the
            // Log Weight intents work from the Lock Screen's Action button.
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    /// Moves a token copied into Documents into the Keychain.
    static func importDroppedFile() {
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else { return }
        // A site to try a local build against, dropped the same way.
        let baseFile = docs.appendingPathComponent("weight-log-base")
        if let base = try? String(contentsOf: baseFile, encoding: .utf8) {
            WeightLogAPI.base = base
            try? FileManager.default.removeItem(at: baseFile)
        }
        let file = docs.appendingPathComponent("owner-token")
        guard let text = try? String(contentsOf: file, encoding: .utf8) else { return }
        if save(text) { try? FileManager.default.removeItem(at: file) }
    }
}
