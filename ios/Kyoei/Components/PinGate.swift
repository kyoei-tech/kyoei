import Observation
import SwiftUI

/// Gates edit actions behind a numeric PIN. Port of usePasswordGate in
/// components/password-prompt.tsx: once entered correctly it stays unlocked
/// for the lifetime of the owning view (hold it in `@State`), so repeated
/// edits within the same visit don't re-prompt.
///
/// Note: like the web app, the PINs ship inside the client; this deters
/// casual taps, it is not access control.
@MainActor
@Observable
final class PinGate {
    let code: String
    let title: String
    private(set) var isUnlocked = false
    fileprivate var pendingAction: (() -> Void)?

    init(code: String, title: String = "パスワードを入力してください") {
        self.code = code
        self.title = title
    }

    /// Runs `action` immediately if unlocked, otherwise after a correct PIN.
    func guarded(_ action: @escaping () -> Void) {
        if isUnlocked {
            action()
        } else {
            pendingAction = action
        }
    }

    fileprivate func submit(_ value: String) -> Bool {
        guard value == code else { return false }
        isUnlocked = true
        let action = pendingAction
        pendingAction = nil
        action?()
        return true
    }

    fileprivate func cancel() {
        pendingAction = nil
    }
}

private struct PinPrompt: View {
    let gate: PinGate
    @State private var value = ""
    @State private var showsError = false
    @FocusState private var focused: Bool

    var body: some View {
        ModalCard {
            ModalIcon(systemName: "lock.fill")
            Text(gate.title)
                .appFont(14, weight: .semibold)
                .foregroundStyle(Color.appForeground)
                .multilineTextAlignment(.center)
            SecureField("", text: $value)
                .numericKeyboard()
                .focused($focused)
                .multilineTextAlignment(.center)
                .font(.system(size: 24, design: .monospaced))
                .tracking(8)
                .padding(.vertical, 12)
                .background(Color.appBackground, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(showsError ? Color.destructive : Color.border))
                .padding(.top, 16)
                .accessibilityLabel("パスワード")
                .onChange(of: value) { _, new in
                    showsError = false
                    let digits = String(new.filter(\.isNumber).prefix(gate.code.count))
                    if digits != new { value = digits }
                }
                .onSubmit(submit)
            if showsError {
                Text("パスワードが違います")
                    .appFont(12, weight: .semibold)
                    .foregroundStyle(Color.destructive)
                    .padding(.top, 8)
            }
            HStack(spacing: 8) {
                Button("キャンセル") { gate.cancel() }
                    .buttonStyle(PillButtonStyle(kind: .outline))
                Button("確定", action: submit)
                    .buttonStyle(PillButtonStyle())
                    .disabled(value.count != gate.code.count)
                    .opacity(value.count == gate.code.count ? 1 : 0.4)
            }
            .padding(.top, 20)
        }
        .onAppear { focused = true }
    }

    private func submit() {
        if !gate.submit(value) {
            showsError = true
            value = ""
        }
    }
}

extension View {
    /// Presents `gate`'s PIN prompt whenever a guarded action is waiting.
    func pinGate(_ gate: PinGate) -> some View {
        overlay {
            if gate.pendingAction != nil {
                PinPrompt(gate: gate)
            }
        }
    }
}
