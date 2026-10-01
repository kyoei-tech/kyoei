import KyoeiCore
import Supabase
import SwiftUI

enum EmergencyRepository {
    private struct Payload: Encodable {
        var name: String
        var hours: String
        var phone: String
        var summary: String?
        var sort_order: Int?
    }

    private struct NoteUpdate: Encodable {
        var content: String
        var updated_at: String
    }

    static func fetch() async throws -> [EmergencyContactRow] {
        try await Backend.client.from("emergency_contacts").select(EmergencyContactRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func save(_ draft: EmergencyContactDraft, id: String?, sortOrder: Int) async throws {
        let summary = draft.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        let payload = Payload(name: draft.name.trimmingCharacters(in: .whitespaces), hours: draft.hoursText,
                              phone: draft.phone.trimmingCharacters(in: .whitespaces), summary: summary.isEmpty ? nil : summary,
                              sort_order: id == nil ? sortOrder : nil)
        if let id {
            try await Backend.client.from("emergency_contacts").update(payload).eq("id", value: id).execute()
        } else {
            try await Backend.client.from("emergency_contacts").insert(payload).execute()
        }
    }

    static func delete(id: String) async throws {
        try await Backend.client.from("emergency_contacts").delete().eq("id", value: id).execute()
    }

    /// Single-row shared notes ('current') shown above the contacts / report.
    static func fetchNote(table: String) async throws -> [SharedNoteRow] {
        try await Backend.client.from(table).select("id, content").eq("id", value: "current").execute().value
    }

    static func saveNote(table: String, content: String) async throws {
        try await Backend.client.from(table)
            .update(NoteUpdate(content: content, updated_at: DBTimestamp.format(Date())))
            .eq("id", value: "current").execute()
    }
}

/// 緊急連絡先: tap-to-call contacts, a shared orange memo (double-tap, PIN
/// 2486) and the entry to 事故報告. Port of components/emergency-contacts-view.tsx.
struct EmergencyContactsView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var table = RealtimeTable<EmergencyContactRow>(table: "emergency_contacts", fetch: EmergencyRepository.fetch)
    @State private var editMode = false
    @State private var form: EmergencyContactDraft?
    @State private var editingID: String?
    @State private var showsReport = false

    var body: some View {
        if showsReport {
            AccidentReportView(onBack: { showsReport = false })
        } else {
            content
        }
    }

    private var content: some View {
        let contacts = table.rows.sorted { $0.sort_order < $1.sort_order }
        return TabPage {
            PageHeading(title: "緊急連絡先", subtitle: "緊急時に連絡する連絡先の一覧です。電話番号をタップすると発信できます。") {
                if !settings.settings.partTimeMode {
                    EditToggleButton(editing: editMode) {
                        editMode.toggle()
                        form = nil
                    }
                }
            }
            SharedNoteBox(table: "emergency_contacts_memo", editable: !settings.settings.partTimeMode)
            Button { showsReport = true } label: {
                Label("事故を起こしてしまった/事故にあってしまったら", systemImage: "exclamationmark.shield")
                    .appFont(14, weight: .bold)
                    .foregroundStyle(Color.destructiveForeground)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.destructive, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(PressScaleStyle())

            if editMode && form == nil {
                Button { editingID = nil; form = EmergencyContactDraft() } label: { Label("連絡先を追加", systemImage: "plus") }
                    .buttonStyle(PillButtonStyle(kind: .outline))
            }
            if let draft = form {
                contactForm(draft, sortOrder: contacts.count)
            }
            if contacts.isEmpty && form == nil {
                EmptyStateBox(text: table.isLoading ? "読み込み中…" : "まだ連絡先が登録されていません。")
            }
            ForEach(contacts) { contact in
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(contact.name).appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                        if !contact.hours.isEmpty {
                            Label(contact.hours, systemImage: "clock").appFont(12).foregroundStyle(Color.mutedForeground)
                        }
                        if let url = telURL(contact.phone) {
                            Link(destination: url) {
                                Label(contact.phone, systemImage: "phone.fill").appFont(16, weight: .bold).foregroundStyle(Color.primary)
                            }
                        }
                        if let summary = contact.summary, !summary.isEmpty {
                            Text(summary).appFont(12).foregroundStyle(Color.mutedForeground)
                        }
                    }
                    Spacer(minLength: 0)
                    if editMode {
                        Button {
                            editingID = contact.id
                            form = EmergencyContactDraft(contact)
                        } label: { Label("編集", systemImage: "pencil").appFont(12, weight: .semibold) }
                            .buttonStyle(PillButtonStyle(kind: .outline)).fixedSize()
                    }
                }
                .padding(.horizontal, 20).padding(.vertical, 16)
                .card(border: Color.destructive.opacity(0.3), fill: Color.destructive.opacity(0.04))
            }
        }
        .syncing(table)
    }

    private func contactForm(_ draft: EmergencyContactDraft, sortOrder: Int) -> some View {
        let binding = Binding(get: { form ?? draft }, set: { form = $0 })
        return VStack(alignment: .leading, spacing: 12) {
            Text(editingID == nil ? "連絡先を追加" : "連絡先を編集").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            FormField(label: "名前") { BoxedTextField(placeholder: "", text: binding.name) }
            FormField(label: "営業時間") {
                Toggle("24時間対応", isOn: binding.is24h).appFont(14)
                if !binding.wrappedValue.is24h {
                    HStack {
                        timePicker(binding.startTime)
                        Text("〜").foregroundStyle(Color.mutedForeground)
                        timePicker(binding.endTime)
                    }
                }
            }
            FormField(label: "電話番号") {
                HStack(spacing: 8) {
                    BoxedTextField(placeholder: "", text: binding.phone)
                    CallButton(phone: binding.wrappedValue.phone)
                }
            }
            FormField(label: "概要（どんな時に使うのか）") { MemoEditor(placeholder: "", text: binding.summary) }
            FormActions(
                canSave: draft.canSave,
                onDelete: editingID.map { id in {
                    Task {
                        try? await EmergencyRepository.delete(id: id)
                        await table.refresh()
                        form = nil
                    }
                } },
                onCancel: { form = nil }
            ) {
                let id = editingID
                Task {
                    try? await EmergencyRepository.save(draft, id: id, sortOrder: sortOrder)
                    await table.refresh()
                    form = nil
                }
            }
        }
        .padding(20)
        .card()
    }

    private func timePicker(_ selection: Binding<String>) -> some View {
        Picker("", selection: selection) {
            ForEach(EmergencyContactDraft.timeOptions, id: \.self) { Text($0).tag($0) }
        }
        .pickerStyle(.menu)
    }
}

/// A shared single-row note in orange bold; double-tap (PIN 2486) to edit.
struct SharedNoteBox: View {
    let tableName: String
    let editable: Bool

    @State private var table: RealtimeTable<SharedNoteRow>
    @State private var gate = PinGate(code: "2486")
    @State private var editing = false
    @State private var draft = ""

    init(table tableName: String, editable: Bool) {
        self.tableName = tableName
        self.editable = editable
        _table = State(initialValue: RealtimeTable(table: tableName) { try await EmergencyRepository.fetchNote(table: tableName) })
    }

    var body: some View {
        let note = table.rows.first?.content ?? ""
        Group {
            if editing {
                VStack(alignment: .leading, spacing: 8) {
                    MemoEditor(placeholder: "", text: $draft, minLines: 3)
                    FormActions(onCancel: { editing = false }) {
                        let content = draft
                        Task {
                            try? await EmergencyRepository.saveNote(table: tableName, content: content)
                            await table.refresh()
                            editing = false
                        }
                    }
                }
            } else if !note.isEmpty {
                Text(note).appFont(14, weight: .bold).foregroundStyle(Color.orange)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Color.clear.frame(height: 8)
            }
        }
        .padding(editing || !note.isEmpty ? 16 : 0)
        .background(editing || !note.isEmpty ? Color.orange.opacity(0.08) : .clear, in: RoundedRectangle(cornerRadius: 16))
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            guard editable, !editing else { return }
            gate.guarded {
                draft = note
                editing = true
            }
        }
        .syncing(table)
        .pinGate(gate)
    }
}
