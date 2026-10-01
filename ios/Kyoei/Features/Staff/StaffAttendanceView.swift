import KyoeiCore
import SwiftUI

/// 出勤簿: today's yard managers and every employee's 出勤中/退勤済み status.
/// Double-tap a card to toggle attendance, triple-tap to edit its comment;
/// 編集 mode (hidden for part-time staff) adds/edits/deletes people.
/// Port of components/staff-attendance-view.tsx.
struct StaffAttendanceView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var staffTable = RealtimeTable<StaffMemberRow>(table: "staff_members", fetch: StaffRepository.fetch)
    @State private var managerTable = RealtimeTable<YardManagerRow>(table: "yard_managers", fetch: YardManagerRepository.fetch)
    @State private var taps = TapResolver()
    @State private var editMode = false
    @State private var editor: Editor?

    /// The one inline form open at a time.
    private enum Editor: Hashable {
        case staff(id: String?)
        case manager(id: String?)
        case staffComment(id: String)
        case managerComment(id: String)
    }

    private var partTime: Bool { settings.settings.partTimeMode }
    private var managers: [YardManagerRow] { managerTable.rows.sorted { $0.sort_order < $1.sort_order } }

    var body: some View {
        TabPage {
            PageHeading(
                title: "出勤簿",
                subtitle: partTime
                    ? "ボタンを2回連続でタップすると出勤状況が切り替わります。ヤード管理者は3回タップでコメントを編集できます。"
                    : "ボタンを2回連続でタップすると出勤状況が切り替わります。3回タップでコメントを編集できます。"
            ) {
                if !partTime {
                    EditToggleButton(editing: editMode) {
                        editMode.toggle()
                        editor = nil
                    }
                }
            }

            if editMode && editor != .manager(id: nil) {
                addButton("ヤード管理者を追加") { editor = .manager(id: nil) }
            }
            // Re-created per target so each form loads its own row.
            editorSection.id(editor)
            if editMode && editor != .staff(id: nil) {
                addButton("社員を追加") { editor = .staff(id: nil) }
            }

            if !managers.isEmpty || editMode {
                Text("本日のヤード管理者").appFont(14, weight: .bold).foregroundStyle(Color.mutedForeground)
                if managers.isEmpty {
                    EmptyStateBox(text: "まだヤード管理者が登録されていません。", verticalPadding: 24)
                } else {
                    let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: StaffRoster.yardManagerColumns(managers))
                    LazyVGrid(columns: columns, spacing: 8) {
                        ForEach(managers) { managerCard($0) }
                    }
                }
            }

            let arranged = StaffRoster.arrange(staffTable.rows)
            if staffTable.rows.isEmpty && editor != .staff(id: nil) {
                EmptyStateBox(text: staffTable.isLoading ? "読み込み中…" : "まだ社員が登録されていません。")
            } else {
                if !arranged.roleHolders.isEmpty {
                    Text("役職者").appFont(14, weight: .bold).foregroundStyle(Color.mutedForeground)
                    staffGrid(arranged.roleHolders)
                }
                if !arranged.roleHolders.isEmpty && !arranged.others.isEmpty {
                    Divider()
                }
                staffGrid(arranged.others)
            }
        }
        .syncing(staffTable)
        .syncing(managerTable)
    }

    // MARK: Cards

    private func staffGrid(_ members: [StaffMemberRow]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
            ForEach(members) { staffCard($0) }
        }
    }

    private func staffCard(_ member: StaffMemberRow) -> some View {
        let working = member.status == .working
        let tint: Color = working ? .primary : .secondary
        return VStack(spacing: 4) {
            if editMode {
                Label("編集", systemImage: "pencil").appFont(11, weight: .semibold).foregroundStyle(Color.secondary)
            }
            Text(member.status.label).appFont(14, weight: .bold).foregroundStyle(tint)
            Label(member.name, systemImage: "person").appFont(14, weight: .semibold).foregroundStyle(Color.appForeground)
            Text(member.subtitle).appFont(12).foregroundStyle(Color.mutedForeground)
            if let tenure = Tenure(hireDate: member.hireDate) {
                Text(tenure.label).appFont(12).foregroundStyle(Color.mutedForeground)
            }
            Text(working ? (member.comment ?? "") : "")
                .appFont(11)
                .foregroundStyle(Color.mutedForeground)
                .lineLimit(2)
                .frame(maxWidth: .infinity, minHeight: 32, alignment: .top)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 8)
        .padding(.vertical, 12)
        .card(border: working ? .primary : Color.secondary.opacity(0.3), fill: tint.opacity(working ? 0.15 : 0.08))
        .contentShape(Rectangle())
        .onTapGesture { tapStaff(member) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: "出勤状況を切り替え") { toggle(member) }
    }

    private func managerCard(_ manager: YardManagerRow) -> some View {
        let tint: Color = manager.checked_in ? (manager.employment_type == .regular ? .primary : .blue) : .secondary
        return VStack(spacing: 2) {
            if editMode {
                Image(systemName: "pencil").font(.system(size: 10)).foregroundStyle(Color.secondary)
            }
            Text(manager.checked_in ? "出勤中" : "退勤済み").appFont(9.6, weight: .bold).foregroundStyle(tint)
            Text(manager.name).appFont(12, weight: .bold).foregroundStyle(Color.appForeground).lineLimit(1)
            if let comment = manager.visibleComment {
                Text(comment).appFont(9.6).foregroundStyle(Color.mutedForeground).lineLimit(2)
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 4)
        .padding(.vertical, 8)
        .card(radius: 12, border: manager.checked_in ? tint : Color.secondary.opacity(0.3), fill: tint.opacity(manager.checked_in ? 0.15 : 0.08))
        .contentShape(Rectangle())
        .onTapGesture { tapManager(manager) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    private func tapStaff(_ member: StaffMemberRow) {
        if editMode {
            editor = .staff(id: member.id)
            return
        }
        taps.tap(member.id, onDouble: { toggle(member) }, onTriple: {
            // Part-time mode may only edit the yard managers' comments.
            if !partTime { editor = .staffComment(id: member.id) }
        })
    }

    private func tapManager(_ manager: YardManagerRow) {
        if editMode {
            editor = .manager(id: manager.id)
            return
        }
        taps.tap("manager-\(manager.id)", onDouble: {
            write(managerTable) { try await YardManagerRepository.setCheckedIn(id: manager.id, !manager.checked_in) }
        }, onTriple: {
            editor = .managerComment(id: manager.id)
        })
    }

    private func toggle(_ member: StaffMemberRow) {
        write(staffTable) { try await StaffRepository.setStatus(id: member.id, member.status.toggled) }
    }

    // MARK: Inline editors

    @ViewBuilder private var editorSection: some View {
        switch editor {
        case nil:
            EmptyView()
        case .staff(let id):
            StaffForm(member: staffTable.rows.first { $0.id == id }, onCancel: { editor = nil }) { values in
                if let id {
                    try await StaffRepository.update(id: id, name: values.name, role: values.role, vehicleClass: values.vehicleClass, hireDate: values.hireDate.date)
                } else {
                    try await StaffRepository.add(name: values.name, role: values.role, vehicleClass: values.vehicleClass, hireDate: values.hireDate.date, sortOrder: staffTable.rows.count)
                }
                await finish(staffTable)
            } onDelete: { id in
                try await StaffRepository.delete(id: id)
                await finish(staffTable)
            }
        case .manager(let id):
            YardManagerForm(manager: managerTable.rows.first { $0.id == id }, onCancel: { editor = nil }) { name, type in
                if let id {
                    try await YardManagerRepository.update(id: id, name: name, type: type)
                } else {
                    try await YardManagerRepository.add(name: name, type: type, sortOrder: managerTable.rows.count)
                }
                await finish(managerTable)
            } onDelete: { id in
                try await YardManagerRepository.delete(id: id)
                await finish(managerTable)
            }
        case .staffComment(let id):
            if let member = staffTable.rows.first(where: { $0.id == id }) {
                CommentForm(name: member.name, initial: member.comment ?? "", onCancel: { editor = nil }) { text in
                    try await StaffRepository.setComment(id: id, text)
                    await finish(staffTable)
                }
            }
        case .managerComment(let id):
            if let manager = managerTable.rows.first(where: { $0.id == id }) {
                CommentForm(name: manager.name, initial: manager.comment ?? "", onCancel: { editor = nil }) { text in
                    try await YardManagerRepository.setComment(id: id, text)
                    await finish(managerTable)
                }
            }
        }
    }

    private func finish<Row>(_ table: RealtimeTable<Row>) async {
        await table.refresh()
        editor = nil
    }

    private func write<Row>(_ table: RealtimeTable<Row>, _ operation: @escaping () async throws -> Void) {
        Task {
            try? await operation()
            await table.refresh()
        }
    }

    private func addButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: "plus")
                .appFont(14, weight: .semibold)
                .foregroundStyle(Color.primary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.primary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4])))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Forms

private struct StaffForm: View {
    struct Values {
        var name = ""
        var role = ""
        var vehicleClass = ""
        var hireDate = HireDateInput()
    }

    let member: StaffMemberRow?
    let onCancel: () -> Void
    let onSave: (Values) async throws -> Void
    let onDelete: (String) async throws -> Void

    @State private var values = Values()
    @State private var saving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(member == nil ? "社員を追加" : "社員を編集").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            FormField(label: "役職") { BoxedTextField(placeholder: "例：部長", text: $values.role) }
            FormField(label: "入社年月日") {
                HStack(spacing: 8) {
                    picker("年", selection: $values.hireDate.year, options: HireDateInput.yearOptions()) { "\($0)年" }
                    picker("月", selection: $values.hireDate.month, options: Array(1...12)) { "\($0)月" }
                    picker("日", selection: $values.hireDate.day,
                           options: Array(1...HireDateInput.daysIn(year: values.hireDate.year, month: values.hireDate.month))) { "\($0)日" }
                }
                if let tenure = Tenure(hireDate: values.hireDate.date) {
                    Text(tenure.label).appFont(12, weight: .medium).foregroundStyle(Color.primary)
                }
            }
            FormField(label: "担当車格") { BoxedTextField(placeholder: "例：小型", text: $values.vehicleClass) }
            FormField(label: "名前") { BoxedTextField(placeholder: "例：山田 太郎", text: $values.name) }
            FormActions(
                canSave: !saving && !values.name.trimmingCharacters(in: .whitespaces).isEmpty,
                onDelete: member.map { m in { run { try await onDelete(m.id) } } },
                onCancel: onCancel,
                onSave: {
                    var trimmed = values
                    trimmed.name = trimmed.name.trimmingCharacters(in: .whitespaces)
                    trimmed.role = trimmed.role.trimmingCharacters(in: .whitespaces)
                    trimmed.vehicleClass = trimmed.vehicleClass.trimmingCharacters(in: .whitespaces)
                    run { try await onSave(trimmed) }
                }
            )
        }
        .padding(20)
        .card()
        .onAppear {
            guard let member else { return }
            values = Values(name: member.name, role: member.role, vehicleClass: member.vehicle_class, hireDate: HireDateInput(member.hireDate))
        }
    }

    private func picker(_ placeholder: String, selection: Binding<Int?>, options: [Int], label: @escaping (Int) -> String) -> some View {
        Picker(placeholder, selection: selection) {
            Text(placeholder).tag(Int?.none)
            ForEach(options, id: \.self) { Text(label($0)).tag(Int?.some($0)) }
        }
        .pickerStyle(.menu)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        .card(radius: 14, fill: .appBackground)
    }

    private func run(_ operation: @escaping () async throws -> Void) {
        saving = true
        Task {
            defer { saving = false }
            try? await operation()
        }
    }
}

private struct YardManagerForm: View {
    let manager: YardManagerRow?
    let onCancel: () -> Void
    let onSave: (String, EmploymentType) async throws -> Void
    let onDelete: (String) async throws -> Void

    @State private var name = ""
    @State private var type: EmploymentType = .regular

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(manager == nil ? "ヤード管理者を追加" : "ヤード管理者を編集").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            FormField(label: "名前") { BoxedTextField(placeholder: "例：山田 太郎", text: $name) }
            FormField(label: "雇用形態") {
                Picker("雇用形態", selection: $type) {
                    ForEach(EmploymentType.allCases, id: \.self) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
            }
            FormActions(
                canSave: !name.trimmingCharacters(in: .whitespaces).isEmpty,
                onDelete: manager.map { m in { Task { try? await onDelete(m.id) } } },
                onCancel: onCancel,
                onSave: {
                    let trimmed = name.trimmingCharacters(in: .whitespaces)
                    Task { try? await onSave(trimmed, type) }
                }
            )
        }
        .padding(20)
        .card()
        .onAppear {
            guard let manager else { return }
            name = manager.name
            type = manager.employment_type
        }
    }
}

private struct CommentForm: View {
    let name: String
    let initial: String
    let onCancel: () -> Void
    let onSave: (String) async throws -> Void

    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(name)さんのコメントを編集").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            MemoEditor(placeholder: "出勤中のみ表示されるコメントを入力（改行できます）", text: $text, minLines: 3)
            FormActions(onCancel: onCancel) {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                Task { try? await onSave(trimmed) }
            }
        }
        .padding(20)
        .card()
        .onAppear { text = initial }
    }
}
