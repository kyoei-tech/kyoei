import KyoeiCore
import Supabase
import SwiftUI

enum AuctionRepository {
    private struct NewVenue: Encodable {
        var weekday: Int
        var venue_name: String
    }

    private struct NewDeadline: Encodable {
        var weekday: Int
        var venue_name: String
        var deadline_time: String
    }

    static func fetchVenues() async throws -> [AAVenueRow] {
        try await Backend.client.from("aa_venues").select(AAVenueRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func fetchDeadlines() async throws -> [AADeadlineRow] {
        try await Backend.client.from("aa_deadlines").select(AADeadlineRow.selectColumns)
            .order("sort_order", ascending: true).order("created_at", ascending: true).execute().value
    }

    static func addVenue(weekday: Int, name: String) async throws {
        try await Backend.client.from("aa_venues").insert(NewVenue(weekday: weekday, venue_name: name)).execute()
    }

    static func deleteVenue(id: String) async throws {
        try await Backend.client.from("aa_venues").delete().eq("id", value: id).execute()
    }

    static func addDeadline(weekday: Int, name: String, time: String) async throws {
        try await Backend.client.from("aa_deadlines").insert(NewDeadline(weekday: weekday, venue_name: name, deadline_time: time)).execute()
    }

    static func deleteDeadline(id: String) async throws {
        try await Backend.client.from("aa_deadlines").delete().eq("id", value: id).execute()
    }
}

/// オークション情報: venues by weekday and each venue's 搬出期限. 会場詳細
/// jumps to List of Location's AA entries. Editing is hidden for part-time
/// staff. Port of components/aa-view.tsx.
struct AuctionView: View {
    let onOpenVenueDetail: () -> Void

    @Environment(SettingsStore.self) private var settings
    @State private var venues = RealtimeTable<AAVenueRow>(table: "aa_venues", fetch: AuctionRepository.fetchVenues)
    @State private var deadlines = RealtimeTable<AADeadlineRow>(table: "aa_deadlines", fetch: AuctionRepository.fetchDeadlines)
    @State private var editingVenues = false
    @State private var editingDeadlines = false
    @State private var venueInputs = Array(repeating: "", count: 7)
    @State private var deadlineInputs = Array(repeating: "", count: 7)
    @State private var deadlineTimes = Array(repeating: AuctionSchedule.defaultDeadlineTime, count: 7)
    @State private var confirmDeleteID: String?

    var body: some View {
        let venueDays = AuctionSchedule.byWeekday(venues.rows, weekday: \.weekday, name: \.venue_name)
        let deadlineDays = AuctionSchedule.byWeekday(deadlines.rows, weekday: \.weekday, name: \.venue_name)
        TabPage {
            PageHeading(title: "AA", subtitle: "オークションの開催日と各会場の搬出期限を確認できます。")
            Button(action: onOpenVenueDetail) {
                HStack(spacing: 12) {
                    Image(systemName: "storefront").foregroundStyle(Color.primary)
                        .frame(width: 40, height: 40).background(Color.primary.opacity(0.15), in: RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("会場詳細").appFont(16, weight: .semibold).foregroundStyle(Color.appForeground)
                        Text("各会場の住所・電話番号などを確認できます。").appFont(12).foregroundStyle(Color.mutedForeground)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Color.mutedForeground)
                }
                .padding(.horizontal, 20).padding(.vertical, 16).card()
            }
            .buttonStyle(.plain)

            calendarCard("オークション開催日一覧", editing: $editingVenues) {
                ForEach(0..<7, id: \.self) { day in
                    dayRow(day) {
                        if venueDays[day].isEmpty && !editingVenues { dash }
                        FlowLayout(spacing: 6) {
                            ForEach(venueDays[day]) { venue in
                                chip(venue.venue_name, time: nil, id: venue.id, editing: editingVenues)
                            }
                        }
                        ForEach(venueDays[day].filter { $0.id == confirmDeleteID }) { venue in
                            ConfirmDeleteInline(message: "「\(venue.venue_name)」を削除しますか？", onConfirm: {
                                write { try await AuctionRepository.deleteVenue(id: venue.id) }
                            }, onCancel: { confirmDeleteID = nil })
                        }
                        if editingVenues {
                            HStack(spacing: 6) {
                                BoxedTextField(placeholder: "会場名を追加", text: $venueInputs[day]).onSubmit { addVenue(day) }
                                addButton { addVenue(day) }
                            }
                        }
                    }
                }
            }

            calendarCard("各会場搬出期限", editing: $editingDeadlines) {
                ForEach(0..<7, id: \.self) { day in
                    dayRow(day) {
                        if deadlineDays[day].isEmpty && !editingDeadlines { dash }
                        ForEach(deadlineDays[day]) { deadline in
                            chip(deadline.venue_name, time: deadline.deadline_time, id: deadline.id, editing: editingDeadlines)
                        }
                        ForEach(deadlineDays[day].filter { $0.id == confirmDeleteID }) { deadline in
                            ConfirmDeleteInline(message: "「\(deadline.venue_name)」を削除しますか？", onConfirm: {
                                write { try await AuctionRepository.deleteDeadline(id: deadline.id) }
                            }, onCancel: { confirmDeleteID = nil })
                        }
                        if editingDeadlines {
                            HStack(spacing: 6) {
                                BoxedTextField(placeholder: "会場名を追加", text: $deadlineInputs[day]).onSubmit { addDeadline(day) }
                                Picker("期限", selection: $deadlineTimes[day]) {
                                    ForEach(AuctionSchedule.deadlineTimes, id: \.self) { Text($0).tag($0) }
                                }
                                .pickerStyle(.menu)
                                addButton { addDeadline(day) }
                            }
                        }
                    }
                }
            }
        }
        .syncing(venues)
        .syncing(deadlines)
    }

    private var dash: some View {
        Text("—").appFont(14).foregroundStyle(Color.mutedForeground.opacity(0.5))
    }

    private func calendarCard<Content: View>(_ title: String, editing: Binding<Bool>, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).appFont(16, weight: .bold).foregroundStyle(Color.appForeground)
                Spacer()
                if !settings.settings.partTimeMode {
                    EditToggleButton(editing: editing.wrappedValue) {
                        editing.wrappedValue.toggle()
                        confirmDeleteID = nil
                    }
                }
            }
            content()
        }
        .padding(16)
        .card()
    }

    private func dayRow<Content: View>(_ day: Int, @ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(JapaneseCalendarText.weekdays[day]).appFont(14, weight: .bold).foregroundStyle(weekdayColor(day))
                .frame(width: 28, height: 28).background(Color.muted, in: Circle())
            VStack(alignment: .leading, spacing: 8) { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 4)
    }

    private func chip(_ name: String, time: String?, id: String, editing: Bool) -> some View {
        HStack(spacing: 6) {
            Label(name, systemImage: "storefront").appFont(14, weight: .medium)
            if let time {
                Spacer(minLength: 4)
                Label(time, systemImage: "clock").appFont(14, weight: .semibold)
            }
            if editing {
                Button { confirmDeleteID = id } label: { Image(systemName: "xmark").font(.system(size: 11)) }
                    .buttonStyle(.plain).accessibilityLabel("\(name)を削除")
            }
        }
        .foregroundStyle(Color.appForeground)
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Color.primary.opacity(0.1), in: Capsule())
    }

    private func addButton(action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "plus").foregroundStyle(Color.primaryForeground).padding(8).background(Color.primary, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("追加")
    }

    private func addVenue(_ day: Int) {
        let name = venueInputs[day].trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        venueInputs[day] = ""
        write { try await AuctionRepository.addVenue(weekday: day, name: name) }
    }

    private func addDeadline(_ day: Int) {
        let name = deadlineInputs[day].trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        let time = deadlineTimes[day]
        deadlineInputs[day] = ""
        write { try await AuctionRepository.addDeadline(weekday: day, name: name, time: time) }
    }

    private func write(_ operation: @escaping () async throws -> Void) {
        Task {
            try? await operation()
            confirmDeleteID = nil
            await venues.refresh()
            await deadlines.refresh()
        }
    }
}
