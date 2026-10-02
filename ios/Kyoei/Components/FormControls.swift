import KyoeiCore
import Observation
import SwiftUI

/// Page title with an explanatory line and an optional trailing action.
struct PageHeading<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).appFont(20, weight: .bold).foregroundStyle(Color.appForeground)
                if let subtitle {
                    Text(subtitle).appFont(14).foregroundStyle(Color.mutedForeground)
                }
            }
            Spacer(minLength: 0)
            trailing
        }
    }
}

extension PageHeading where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}

/// Small toggle pill used for 編集/完了 buttons.
struct EditToggleButton: View {
    let editing: Bool
    var label = "編集"
    var systemImage = "pencil"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(editing ? "完了" : label, systemImage: editing ? "xmark" : systemImage)
                .appFont(14, weight: .semibold)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .foregroundStyle(editing ? Color.primaryForeground : Color.mutedForeground)
                .background(editing ? Color.primary : Color.clear, in: Capsule())
                .overlay(Capsule().stroke(editing ? Color.clear : Color.border))
        }
        .buttonStyle(.plain)
    }
}

/// Labelled form field.
struct FormField<Content: View>: View {
    let label: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).appFont(12, weight: .medium).foregroundStyle(Color.mutedForeground)
            content
        }
    }
}

/// Single-line input styled like the web inputs.
struct BoxedTextField: View {
    let placeholder: String
    @Binding var text: String
    var fill: Color = .appBackground

    var body: some View {
        TextField(placeholder, text: $text)
            .appFont(14)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .card(radius: 14, fill: fill)
    }
}

/// Text field that writes back when editing ends (return key or focus
/// leaving) — the web inputs' onBlur saves.
struct CommitTextField: View {
    let placeholder: String
    let value: String
    let onCommit: (String) -> Void

    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .focused($focused)
            .onAppear { text = value }
            .onChange(of: value) { _, new in if !focused { text = new } }
            .onSubmit(commit)
            .onChange(of: focused) { _, isFocused in if !isFocused { commit() } }
    }

    private func commit() {
        if text != value { onCommit(text) }
    }
}

/// Dashed placeholder box for empty lists.
struct EmptyStateBox: View {
    let text: String
    var verticalPadding: CGFloat = 40

    var body: some View {
        Text(text)
            .appFont(14)
            .foregroundStyle(Color.mutedForeground)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, verticalPadding)
            .padding(.horizontal, 20)
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.border, style: StrokeStyle(lineWidth: 1, dash: [4])))
    }
}

/// Save / cancel row at the bottom of inline forms, with an optional delete.
struct FormActions: View {
    var canSave = true
    var saveLabel = "保存"
    var onDelete: (() -> Void)?
    let onCancel: () -> Void
    let onSave: () -> Void

    @State private var confirmingDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if confirmingDelete, let onDelete {
                ConfirmDeleteInline(onConfirm: onDelete, onCancel: { confirmingDelete = false })
            }
            HStack(spacing: 8) {
                if onDelete != nil && !confirmingDelete {
                    Button { confirmingDelete = true } label: {
                        Label("削除", systemImage: "trash").appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
                Button("キャンセル", action: onCancel).buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                Button(saveLabel, action: onSave).buttonStyle(PillButtonStyle()).fixedSize()
                    .disabled(!canSave).opacity(canSave ? 1 : 0.4)
            }
        }
    }
}

/// Per-item double/triple tap resolution for the 出勤簿 cards (see TapSequence).
@MainActor
@Observable
final class TapResolver {
    @ObservationIgnored private var sequences: [String: TapSequence] = [:]
    @ObservationIgnored private var pending: [String: Task<Void, Never>] = [:]

    func tap(_ id: String, onDouble: @escaping @MainActor () -> Void, onTriple: @escaping @MainActor () -> Void) {
        pending[id]?.cancel()
        var sequence = sequences[id] ?? TapSequence()
        let immediate = sequence.tap()
        sequences[id] = sequence
        if immediate == .triple {
            onTriple()
            return
        }
        pending[id] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(TapSequence.pause))
            guard !Task.isCancelled, let self else { return }
            var settled = self.sequences[id] ?? TapSequence()
            let action = settled.settle()
            self.sequences[id] = settled
            if action == .double { onDouble() }
        }
    }
}
