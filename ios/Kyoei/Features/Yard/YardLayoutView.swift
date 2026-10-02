import KyoeiCore
import SwiftUI

/// ヤード配置: which destination each yard position holds, a kana-aware
/// 移動先検索 over the registered stores, and (PIN 5789, hidden for part-time
/// staff) editing of yards, positions and the destination list. Edits save
/// as you go and sync to every device. Port of components/yard-layout-view.tsx.
struct YardLayoutView: View {
    @Environment(SettingsStore.self) private var settings
    @State private var yards = RealtimeTable<YardRow>(table: "yards", fetch: YardRepository.fetchYards)
    @State private var positions = RealtimeTable<YardPositionRow>(table: "yard_rows", fetch: YardRepository.fetchPositions)
    @State private var destinations = RealtimeTable<YardDestinationRow>(table: "yard_destinations", fetch: YardRepository.fetchDestinations)
    @State private var titles = RealtimeTable<DestinationTitleRow>(table: "yard_destination_titles", fetch: YardRepository.fetchTitles)
    @State private var stores = RealtimeTable<DestinationStoreRow>(table: "yard_destination_stores", fetch: YardRepository.fetchStores)
    @State private var gate = PinGate(code: "5789")
    @State private var search = ""
    @State private var showsToolbar = false
    @State private var managingDestinations = false
    @State private var editingYardID: String?
    @State private var addingYard = false
    @State private var newYardName = ""

    private var partTime: Bool { settings.settings.partTimeMode }
    private var sortedYards: [YardRow] { yards.rows.sorted { $0.sort_order < $1.sort_order } }
    private var destinationNames: [String] { YardLayout.sortedDestinations(destinations.rows).map(\.name) }

    var body: some View {
        TabPage {
            PageHeading(title: "ヤード配置") {
                if !partTime {
                    EditToggleButton(editing: showsToolbar, systemImage: "slider.horizontal.3") {
                        if showsToolbar {
                            showsToolbar = false
                            managingDestinations = false
                        } else {
                            gate.guarded { showsToolbar = true }
                        }
                    }
                }
            }
            updateStatus
            Label("ヒント：中継用紙の店舗名の後に市区町村が書いてある場合、一般の可能性大", systemImage: "lightbulb")
                .appFont(12)
                .foregroundStyle(Color.mutedForeground)

            searchSection

            if showsToolbar {
                Button { managingDestinations.toggle() } label: {
                    Label("行き先を追加", systemImage: "checklist")
                }
                .buttonStyle(PillButtonStyle(kind: managingDestinations ? .primary : .outline))
                .fixedSize()
            }
            if managingDestinations {
                DestinationManager(rows: YardLayout.sortedDestinations(destinations.rows), positions: positions.rows) {
                    await destinations.refresh()
                    await positions.refresh()
                }
            }

            let byYard = YardLayout.positionsByYard(positions.rows)
            ForEach(sortedYards) { yard in
                YardSection(
                    yard: yard,
                    positions: byYard[yard.id] ?? [],
                    destinationNames: destinationNames,
                    editing: editingYardID == yard.id,
                    canEdit: !partTime,
                    onToggleEdit: {
                        if editingYardID == yard.id {
                            editingYardID = nil
                        } else {
                            gate.guarded { editingYardID = yard.id }
                        }
                    },
                    onChanged: {
                        await yards.refresh()
                        await positions.refresh()
                    },
                    onDeleted: { editingYardID = nil }
                )
            }

            if !partTime { addYardSection }
        }
        .syncing(yards)
        .syncing(positions)
        .syncing(destinations)
        .syncing(titles)
        .syncing(stores)
        .pinGate(gate)
    }

    @ViewBuilder private var updateStatus: some View {
        if let latest = YardLayout.latestUpdate(yards: yards.rows, positions: positions.rows) {
            let today = YardLayout.isUpdatedToday(latest)
            let color: Color = today ? .primary : .destructive
            VStack(alignment: .leading, spacing: 2) {
                Text(today ? "更新済み" : "未更新").appFont(14, weight: .bold)
                Text("最終更新：\(Self.updatedFormatter.string(from: latest))").appFont(12, weight: .medium)
            }
            .foregroundStyle(color)
        }
    }

    private static let updatedFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.dateFormat = "yyyy/MM/dd HH:mm"
        return formatter
    }()

    private var searchSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Color.mutedForeground)
                TextField("中継表の降地を入力して移動先を検索", text: $search)
                    .appFont(14)
                    .autocorrectionDisabled()
                if !search.isEmpty {
                    Button { search = "" } label: { Image(systemName: "xmark") }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.mutedForeground)
                        .accessibilityLabel("検索をクリア")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .card(radius: 12)

            if let results = YardLayout.search(search, stores: stores.rows, titles: titles.rows) {
                VStack(alignment: .leading, spacing: 6) {
                    if results.isEmpty {
                        Text("該当なし。確認してください。").appFont(14).foregroundStyle(Color.mutedForeground)
                    } else {
                        ForEach(results, id: \.store.id) { result in
                            HStack {
                                Text(result.store.name).foregroundStyle(Color.appForeground).lineLimit(1)
                                Spacer()
                                Text(result.title).foregroundStyle(Color.mutedForeground)
                            }
                            .appFont(14, weight: .semibold)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .card(radius: 12)
            }
        }
    }

    @ViewBuilder private var addYardSection: some View {
        if addingYard {
            HStack(spacing: 8) {
                BoxedTextField(placeholder: "ヤード名", text: $newYardName, fill: .card)
                Button("追加") {
                    let name = newYardName.trimmingCharacters(in: .whitespaces)
                    guard !name.isEmpty else { return }
                    Task {
                        try? await YardRepository.addYard(name: name, sortOrder: yards.rows.count)
                        newYardName = ""
                        addingYard = false
                        await yards.refresh()
                    }
                }
                .buttonStyle(PillButtonStyle()).fixedSize()
                Button { addingYard = false; newYardName = "" } label: { Image(systemName: "xmark") }
                    .buttonStyle(.plain)
                    .accessibilityLabel("キャンセル")
            }
            .padding(16)
            .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.primary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4])))
        } else {
            Button { addingYard = true } label: {
                Label("ヤードを追加", systemImage: "plus")
                    .appFont(14, weight: .semibold)
                    .foregroundStyle(Color.primary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.primary.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [4])))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - One yard

private struct YardSection: View {
    let yard: YardRow
    let positions: [YardPositionRow]
    let destinationNames: [String]
    let editing: Bool
    let canEdit: Bool
    let onToggleEdit: () -> Void
    let onChanged: () async -> Void
    let onDeleted: () -> Void

    @State private var openPicker: String?
    @State private var newLabel = ""
    @State private var newDestinations: [String] = []
    @State private var confirmDeletePositionID: String?
    @State private var confirmDeleteYard = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if editing {
                CommitTextField(placeholder: "ヤード名", value: yard.name) { name in
                    let trimmed = name.trimmingCharacters(in: .whitespaces)
                    guard !trimmed.isEmpty else { return }
                    write { try await YardRepository.renameYard(id: yard.id, name: trimmed) }
                }
                .appFont(16, weight: .bold)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .card(radius: 12, fill: .appBackground)
            } else {
                Text(yard.name).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
            }

            if positions.isEmpty && !editing {
                Text("位置が登録されていません。").appFont(14).foregroundStyle(Color.mutedForeground.opacity(0.6))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            ForEach(positions) { position in
                positionRow(position)
            }
            if editing { addPositionRow }

            HStack {
                if editing {
                    if confirmDeleteYard {
                        ConfirmDeleteInline(message: "「\(yard.name)」を削除しますか？", onConfirm: {
                            write { try await YardRepository.deleteYard(id: yard.id) }
                            onDeleted()
                        }, onCancel: { confirmDeleteYard = false })
                    } else {
                        Button { confirmDeleteYard = true } label: {
                            Label("ヤードを削除", systemImage: "trash").appFont(12, weight: .semibold).foregroundStyle(Color.destructive)
                        }
                        .buttonStyle(.plain)
                    }
                }
                Spacer()
                if canEdit && !confirmDeleteYard {
                    EditToggleButton(editing: editing, action: onToggleEdit)
                }
            }
        }
        .padding(16)
        .card(radius: Radius.card, border: editing ? Color.primary.opacity(0.5) : .border)
        .onChange(of: editing) { _, isEditing in
            if !isEditing {
                openPicker = nil
                confirmDeletePositionID = nil
                confirmDeleteYard = false
            }
        }
    }

    @ViewBuilder private func positionRow(_ position: YardPositionRow) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if editing {
                    CommitTextField(placeholder: "位置名（任意）", value: position.label) { label in
                        write { try await YardRepository.setPositionLabel(id: position.id, label.trimmingCharacters(in: .whitespaces)) }
                    }
                    .appFont(14, weight: .semibold)
                    .frame(width: 96)
                    divider
                    Button { openPicker = openPicker == position.id ? nil : position.id } label: {
                        destinationsText(position.destinations, placeholder: "行き先を選択")
                    }
                    .buttonStyle(.plain)
                    Button { confirmDeletePositionID = position.id } label: { Image(systemName: "trash").font(.system(size: 13)) }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.mutedForeground.opacity(0.6))
                        .accessibilityLabel("\(position.label.isEmpty ? "無題の位置" : position.label)を削除")
                } else {
                    Text(position.label.isEmpty ? "—" : position.label)
                        .appFont(14, weight: .semibold)
                        .foregroundStyle(position.label.isEmpty ? Color.mutedForeground.opacity(0.5) : Color.appForeground)
                        .lineLimit(1)
                        .frame(width: 80, alignment: .leading)
                    divider
                    destinationsText(position.destinations, placeholder: "—")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .card(radius: 12, fill: .appBackground)

            if editing && openPicker == position.id {
                DestinationChecklist(names: destinationNames, selected: position.destinations) { name in
                    write { try await YardRepository.setPositionDestinations(id: position.id, YardLayout.toggling(name, in: position.destinations)) }
                }
            }
            if editing && confirmDeletePositionID == position.id {
                ConfirmDeleteInline(message: "「\(position.label.isEmpty ? "無題の位置" : position.label)」を削除しますか？", onConfirm: {
                    confirmDeletePositionID = nil
                    write { try await YardRepository.deletePosition(id: position.id) }
                }, onCancel: { confirmDeletePositionID = nil })
            }
        }
    }

    private var addPositionRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                TextField("位置名（任意）", text: $newLabel)
                    .appFont(14)
                    .frame(width: 96)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .card(radius: 12, fill: .appBackground)
                Button { openPicker = openPicker == "new" ? nil : "new" } label: {
                    destinationsText(newDestinations, placeholder: "行き先を選択（任意）")
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .card(radius: 12, fill: .appBackground)
                }
                .buttonStyle(.plain)
                Button {
                    let label = newLabel.trimmingCharacters(in: .whitespaces)
                    guard YardLayout.canAddPosition(label: label, destinations: newDestinations) else { return }
                    let chosen = newDestinations
                    write { try await YardRepository.addPosition(yardID: yard.id, label: label, destinations: chosen, sortOrder: positions.count) }
                    newLabel = ""
                    newDestinations = []
                    openPicker = nil
                } label: {
                    Image(systemName: "plus").foregroundStyle(Color.primaryForeground).padding(8).background(Color.primary, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("位置を追加")
            }
            if openPicker == "new" {
                DestinationChecklist(names: destinationNames, selected: newDestinations) { name in
                    newDestinations = YardLayout.toggling(name, in: newDestinations)
                }
            }
        }
    }

    private var divider: some View {
        Text("|").foregroundStyle(Color.mutedForeground.opacity(0.4)).accessibilityHidden(true)
    }

    private func destinationsText(_ names: [String], placeholder: String) -> some View {
        Text(names.isEmpty ? placeholder : names.joined(separator: "、"))
            .appFont(14)
            .foregroundStyle(names.isEmpty ? Color.mutedForeground : Color.appForeground)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func write(_ operation: @escaping () async throws -> Void) {
        Task {
            try? await operation()
            await onChanged()
        }
    }
}

private struct DestinationChecklist: View {
    let names: [String]
    let selected: [String]
    let onToggle: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if names.isEmpty {
                Text("行き先が登録されていません。").appFont(12).foregroundStyle(Color.mutedForeground.opacity(0.6)).padding(8)
            }
            ForEach(names, id: \.self) { name in
                let checked = selected.contains(name)
                Button { onToggle(name) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: checked ? "checkmark.square.fill" : "square")
                            .foregroundStyle(checked ? Color.primary : Color.mutedForeground)
                        Text(name).appFont(14).foregroundStyle(Color.appForeground)
                        Spacer()
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(checked ? .isSelected : [])
            }
        }
        .padding(8)
        .card(radius: 12)
    }
}

/// 行き先の候補一覧: add, rename (re-pointing assigned positions) and delete.
private struct DestinationManager: View {
    let rows: [YardDestinationRow]
    let positions: [YardPositionRow]
    let onChanged: () async -> Void

    @State private var newName = ""
    @State private var confirmDeleteID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("行き先の候補一覧").appFont(14, weight: .bold).foregroundStyle(Color.appForeground)
            if rows.isEmpty {
                Text("行き先が登録されていません。").appFont(14).foregroundStyle(Color.mutedForeground.opacity(0.6))
            }
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        CommitTextField(placeholder: "行き先名", value: row.name) { name in
                            let trimmed = name.trimmingCharacters(in: .whitespaces)
                            guard !trimmed.isEmpty else { return }
                            write { try await YardRepository.renameDestination(row, to: trimmed, positions: positions) }
                        }
                        .appFont(14)
                        Button { confirmDeleteID = row.id } label: { Image(systemName: "trash").font(.system(size: 13)) }
                            .buttonStyle(.plain)
                            .foregroundStyle(Color.mutedForeground.opacity(0.6))
                            .accessibilityLabel("\(row.name)を削除")
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .card(radius: 12, fill: .appBackground)
                    if confirmDeleteID == row.id {
                        ConfirmDeleteInline(message: "「\(row.name)」を削除しますか？", onConfirm: {
                            confirmDeleteID = nil
                            write { try await YardRepository.deleteDestination(id: row.id) }
                        }, onCancel: { confirmDeleteID = nil })
                    }
                }
            }
            HStack(spacing: 8) {
                BoxedTextField(placeholder: "新しい行き先名", text: $newName)
                    .onSubmit(add)
                Button(action: add) {
                    Image(systemName: "plus").foregroundStyle(Color.primaryForeground).padding(10).background(Color.primary, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("行き先を追加")
            }
        }
        .padding(16)
        .card()
    }

    private func add() {
        let name = newName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        newName = ""
        write { try await YardRepository.addDestination(name: name, sortOrder: rows.count) }
    }

    private func write(_ operation: @escaping () async throws -> Void) {
        Task {
            try? await operation()
            await onChanged()
        }
    }
}
