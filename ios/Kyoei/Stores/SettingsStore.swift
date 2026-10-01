import Foundation
import KyoeiCore
import Observation
import SwiftUI

/// App-wide device settings, persisted as JSON in UserDefaults. Port of
/// lib/settings/settings-context.tsx; the shape and defaults live in
/// KyoeiCore's AppSettings.
@MainActor
@Observable
final class SettingsStore {
    private static let storageKey = "kyoei-settings"

    var settings: AppSettings {
        didSet { save() }
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: Self.storageKey),
           let stored = try? JSONDecoder().decode(AppSettings.self, from: data) {
            settings = stored
        } else {
            settings = AppSettings()
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(settings) {
            defaults.set(data, forKey: Self.storageKey)
        }
    }

    /// nil follows the OS appearance.
    var colorScheme: ColorScheme? {
        switch settings.theme {
        case .light: .light
        case .dark: .dark
        case .system: nil
        }
    }

    func toggleAppMode() {
        settings.appMode = settings.appMode == .driver ? .timecard : .driver
    }
}
