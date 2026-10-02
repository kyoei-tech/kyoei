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

    /// Login IDs and setup codes: ASCII keyboard, no auto-capitalization.
    func asciiKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.asciiCapable).textInputAutocapitalization(.never)
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

extension View {
    /// Full-screen cover on iOS; a sheet where that isn't available (macOS check).
    func fullScreen<Item: Identifiable, Content: View>(item: Binding<Item?>, @ViewBuilder content: @escaping (Item) -> Content) -> some View {
        #if os(iOS)
        fullScreenCover(item: item, content: content)
        #else
        sheet(item: item, content: content)
        #endif
    }
}

extension View {
    func fullScreen<Content: View>(isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> Content) -> some View {
        #if os(iOS)
        fullScreenCover(isPresented: isPresented, content: content)
        #else
        sheet(isPresented: isPresented, content: content)
        #endif
    }
}
