import SwiftUI

// iOS-only modifiers wrapped so the app sources also typecheck on macOS
// (see ios/AppCheck), where Xcode isn't required.

extension View {
    func numericKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.numberPad)
        #else
        self
        #endif
    }

    func emailKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.emailAddress).textInputAutocapitalization(.never)
        #else
        self
        #endif
    }

    func inlineNavigationTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    func hiddenNavigationBar() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
        #else
        self
        #endif
    }
}
